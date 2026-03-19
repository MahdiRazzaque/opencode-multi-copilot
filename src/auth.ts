import { setTimeout as sleep } from "node:timers/promises";

import type { AuthHook, AuthOuathResult, PluginInput } from "@opencode-ai/plugin";

import { AliasSchema } from "./schemas.js";
import { normaliseDomain } from "./provider.js";

const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000;
const USER_AGENT = "opencode-multi-copilot";

export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const COPILOT_CLIENT_ID = "Ov23li8tweQw6odWQebz";

type AccountRecord = {
  access_token: string;
  refresh_token: string;
  expires: number;
  enterpriseUrl: string;
};

type LedgerModule = {
  getTokenForAlias(alias: string): Promise<AccountRecord>;
  resolveAccountForModel(modelId: string): Promise<{
    alias: string;
    account: AccountRecord;
  }>;
};

function getCopilotBaseUrl(enterpriseUrl?: string): string {
  if (!enterpriseUrl) {
    return "https://api.github.com";
  }

  return `https://copilot-api.${normaliseDomain(enterpriseUrl)}`;
}

function getOauthUrls(inputs: Record<string, string>): {
  deviceCodeUrl: string;
  accessTokenUrl: string;
  enterpriseUrl?: string;
} {
  if (inputs.deploymentType !== "enterprise") {
    return {
      deviceCodeUrl: GITHUB_DEVICE_CODE_URL,
      accessTokenUrl: GITHUB_ACCESS_TOKEN_URL,
    };
  }

  const domain = normaliseDomain(inputs.enterpriseUrl ?? "");

  return {
    deviceCodeUrl: `https://${domain}/login/device/code`,
    accessTokenUrl: `https://${domain}/login/oauth/access_token`,
    enterpriseUrl: domain,
  };
}

function validateAlias(value: string): string | undefined {
  const result = AliasSchema.safeParse(value);
  if (result.success) {
    return undefined;
  }

  return result.error.issues[0]?.message ?? "Invalid alias.";
}

function validateEnterpriseUrl(value: string): string | undefined {
  if (!value) {
    return "URL or domain is required";
  }

  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    if (!url.hostname) {
      return "Please enter a valid URL or domain";
    }
    return undefined;
  } catch (_e) {
    return "Please enter a valid URL (e.g. company.ghe.com or https://company.ghe.com)";
  }
}

function extractModelId(body: unknown): string | undefined {
  if (typeof body !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body) as { model?: string };
    const model = parsed.model;

    if (!model) {
      return undefined;
    }

    return model.replace(/^multi-copilot\//, "").replace(/^github-copilot\//, "");
  } catch (_e) {
    return undefined;
  }
}

function rewriteRequestTarget(
  request: Request | URL | string,
  enterpriseUrl: string | undefined
): Request | URL | string {
  if (!enterpriseUrl) {
    return request;
  }

  const baseUrl = getCopilotBaseUrl(enterpriseUrl);
  const target = request instanceof URL ? request.href : request.toString();

  try {
    const url = new URL(target);
    return new URL(`${baseUrl}${url.pathname}${url.search}`);
  } catch (_e) {
    return request;
  }
}

async function loadLedgerModule(): Promise<LedgerModule> {
  return (await import("./ledger.js")) as unknown as LedgerModule;
}

async function mirrorGithubCopilotModels(input: PluginInput, provider: Parameters<NonNullable<AuthHook["loader"]>>[1]) {
  const list = await input.client.provider.list();
  const githubCopilot = (list.data?.all ?? []).find((item) => item.id === "github-copilot");

  if (!githubCopilot) {
    return;
  }

  const models = provider.models as Record<string, unknown>;

  for (const [modelId, modelInfo] of Object.entries(githubCopilot.models)) {
    const mirroredId = `multi-copilot/${modelId.replace(/^github-copilot\//, "")}`;
    models[mirroredId] = {
      ...modelInfo,
      id: mirroredId,
    };
  }
}

export function createAuthHook(input: PluginInput): AuthHook {
  return {
    provider: "multi-copilot",
    async loader(auth, provider) {
      await mirrorGithubCopilotModels(input, provider);

      const info = await auth();
      if (!info || info.type !== "oauth") {
        return {};
      }

      return {
        baseURL: getCopilotBaseUrl(info.enterpriseUrl),
        apiKey: "copilot",
        async fetch(request: Request | URL | string, init?: RequestInit) {
          const modelId = extractModelId(init?.body);

          let account: AccountRecord = {
            access_token: info.access,
            refresh_token: info.refresh,
            expires: info.expires,
            enterpriseUrl: info.enterpriseUrl ?? "",
          };

          if (modelId) {
            const ledger = await loadLedgerModule();
            const resolved = await ledger.resolveAccountForModel(modelId);
            account = await ledger.getTokenForAlias(resolved.alias);
          }

          const headers: Record<string, string> = {
            ...(init?.headers as Record<string, string> | undefined),
            "User-Agent": USER_AGENT,
            Authorization: `Bearer ${account.refresh_token || account.access_token}`,
          };
          delete headers.authorization;
          delete headers["x-api-key"];

          return fetch(rewriteRequestTarget(request, account.enterpriseUrl), {
            ...init,
            headers,
          });
        },
      };
    },
    methods: [
      {
        type: "oauth",
        label: "Authorise with GitHub",
        prompts: [
          {
            type: "text",
            key: "alias",
            message: "Enter an alias for this account",
            placeholder: "work",
            validate: validateAlias,
          },
          {
            type: "select",
            key: "deploymentType",
            message: "Select GitHub deployment type",
            options: [
              {
                label: "GitHub.com",
                value: "github.com",
                hint: "Public",
              },
              {
                label: "GitHub Enterprise",
                value: "enterprise",
                hint: "Data residency or self-hosted",
              },
            ],
          },
          {
            type: "text",
            key: "enterpriseUrl",
            message: "Enter your GitHub Enterprise URL or domain",
            placeholder: "company.ghe.com or https://company.ghe.com",
            condition: (inputs) => inputs.deploymentType === "enterprise",
            validate: validateEnterpriseUrl,
          },
        ],
        async authorize(inputs = {}): Promise<AuthOuathResult> {
          const urls = getOauthUrls(inputs);

          const deviceResponse = await fetch(urls.deviceCodeUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "User-Agent": USER_AGENT,
            },
            body: JSON.stringify({
              client_id: COPILOT_CLIENT_ID,
              scope: "read:user",
            }),
          });

          if (!deviceResponse.ok) {
            throw new Error("Failed to initiate device authorisation");
          }

          const deviceData = (await deviceResponse.json()) as {
            device_code: string;
            user_code: string;
            verification_uri: string;
            interval: number;
          };

          return {
            url: deviceData.verification_uri,
            instructions: `Enter code: ${deviceData.user_code}`,
            method: "auto",
            callback: async () => {
              while (true) {
                const response = await fetch(urls.accessTokenUrl, {
                  method: "POST",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    "User-Agent": USER_AGENT,
                  },
                  body: JSON.stringify({
                    client_id: COPILOT_CLIENT_ID,
                    device_code: deviceData.device_code,
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                  }),
                });

                if (!response.ok) {
                  return { type: "failed" };
                }

                const data = (await response.json()) as {
                  access_token?: string;
                  error?: string;
                  interval?: number;
                };

                if (data.access_token) {
                  return {
                    type: "success",
                    refresh: data.access_token,
                    access: data.access_token,
                    expires: 0,
                    ...(urls.enterpriseUrl ? { enterpriseUrl: urls.enterpriseUrl } : {}),
                  } as { type: "success"; refresh: string; access: string; expires: number; enterpriseUrl?: string };
                }

                if (data.error === "authorization_pending") {
                  await sleep(deviceData.interval * 1000 + OAUTH_POLLING_SAFETY_MARGIN_MS);
                  continue;
                }

                if (data.error === "slow_down") {
                  const interval =
                    typeof data.interval === "number" && data.interval > 0
                      ? data.interval * 1000
                      : (deviceData.interval + 5) * 1000;
                  await sleep(interval + OAUTH_POLLING_SAFETY_MARGIN_MS);
                  continue;
                }

                if (data.error) {
                  return { type: "failed" };
                }

                await sleep(deviceData.interval * 1000 + OAUTH_POLLING_SAFETY_MARGIN_MS);
              }
            },
          };
        },
      },
    ],
  };
}
