import { setTimeout as sleep } from "node:timers/promises";

import type { AuthHook, AuthOuathResult, PluginInput } from "@opencode-ai/plugin";

import { AliasSchema } from "./schemas.js";
import { normaliseDomain, constructBaseURL, detectVision, detectAgent } from "./provider.js";
import { setAccount } from "./ledger.js";
import { readMirroringMode, setDefaultAccountIfEmpty, writeCachedModelIds } from "./config.js";

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

function getRequestUrl(request: Request | URL | string): string {
  if (request instanceof Request) {
    return request.url;
  }

  return request instanceof URL ? request.href : request;
}

function normaliseHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const values: Record<string, string> = {};
    headers.forEach((value, key) => {
      values[key] = value;
    });
    return values;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  }

  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

async function readRequestBody(request: Request | URL | string, init?: RequestInit): Promise<unknown> {
  if (typeof init?.body === "string") {
    try {
      return JSON.parse(init.body);
    } catch (_e) {
      return init.body;
    }
  }

  if (init?.body !== undefined) {
    return init.body;
  }

  if (!(request instanceof Request)) {
    return undefined;
  }

  try {
    const text = await request.clone().text();
    if (!text) {
      return undefined;
    }

    return JSON.parse(text);
  } catch (_e) {
    return undefined;
  }
}

async function buildForwardedInit(request: Request | URL | string, init: RequestInit | undefined): Promise<RequestInit> {
  if (!(request instanceof Request)) {
    return { ...init };
  }

  const baseInit: RequestInit = {
    method: request.method,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const bodyText = await request.clone().text();
    if (bodyText) {
      baseInit.body = bodyText;
    }
  }

  return {
    ...baseInit,
    ...init,
  };
}

function rewriteRequestTarget(
  request: Request | URL | string,
  account: AccountRecord
): Request | URL | string {
  const baseUrl = constructBaseURL(account);
  const target = getRequestUrl(request);

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

async function fetchGithubCopilotModels(
  serverUrl: URL
): Promise<Record<string, unknown> | undefined> {
  const url = new URL("/provider", serverUrl);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as {
    all?: Array<{ id: string; models: Record<string, unknown> }>;
  };

  const githubCopilot = (data.all ?? []).find((item) => item.id === "github-copilot");
  return githubCopilot?.models;
}

async function mirrorGithubCopilotModels(
  input: PluginInput,
  provider: Parameters<NonNullable<AuthHook["loader"]>>[1]
) {
  const mode = await readMirroringMode();

  if (mode !== "auto") {
    return;
  }

  if (!provider?.models) {
    return;
  }

  const target = provider.models as Record<string, unknown>;
  const models = await fetchGithubCopilotModels(input.serverUrl);
  if (models) {
    const bareIds: string[] = [];
    for (const [modelId, modelInfo] of Object.entries(models)) {
      const bareId = modelId.replace(/^github-copilot\//, "");
      bareIds.push(bareId);

      // Strip provider-specific fields that would route requests through
      // github-copilot's SDK instead of multi-copilot's custom fetch.
      const { providerID, api, ...rest } = modelInfo as Record<string, unknown>;
      const sourceApi = (api ?? {}) as Record<string, unknown>;

      // Preserve existing config-hook models (they have full parsed structure);
      // only add newly discovered models from github-copilot.
      if (target[bareId]) {
        continue;
      }

      target[bareId] = {
        ...rest,
        id: bareId,
        providerID: "multi-copilot",
        api: {
          id: sourceApi.id ?? bareId,
          npm: "@ai-sdk/openai-compatible",
        },
      };
    }
    await writeCachedModelIds(bareIds).catch(() => {});
  }
}

export function createAuthHook(input: PluginInput): AuthHook {
  return {
    provider: "multi-copilot",
    async loader(auth, provider) {
      await mirrorGithubCopilotModels(input, provider).catch(() => {});

      const info = await auth();
      if (!info || info.type !== "oauth") {
        return {};
      }

      const fetchFn = async function multiCopilotFetch(request: Request | URL | string, init?: RequestInit) {
        const body = await readRequestBody(request, init);
        const modelId = extractModelId(typeof body === "string" ? body : JSON.stringify(body));

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

        const url = getRequestUrl(request);

        const isVision = detectVision(body, url);
        const isAgent = detectAgent(body, url);

        const mergedHeaders = {
          ...(request instanceof Request ? normaliseHeaders(request.headers) : {}),
          ...normaliseHeaders(init?.headers),
        };

        const headers: Record<string, string> = {
          "x-initiator": isAgent ? "agent" : "user",
          ...mergedHeaders,
          "User-Agent": USER_AGENT,
          Authorization: `Bearer ${account.refresh_token || account.access_token}`,
          "Openai-Intent": "conversation-edits",
        };

        if (isVision) {
          headers["Copilot-Vision-Request"] = "true";
        }

        delete headers.authorization;
        delete headers["x-api-key"];
        delete headers.Authorization;
        headers.Authorization = `Bearer ${account.refresh_token || account.access_token}`;

        return fetch(rewriteRequestTarget(request, account), {
          ...(await buildForwardedInit(request, init)),
          headers,
        });
      };

      return {
        baseURL: constructBaseURL({ enterpriseUrl: info.enterpriseUrl ?? "" }),
        apiKey: "copilot",
        fetch: fetchFn,
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
                  const alias = inputs.alias ?? "";
                  const accountData = {
                    access_token: data.access_token,
                    refresh_token: data.access_token,
                    expires: 0,
                    enterpriseUrl: urls.enterpriseUrl ?? "",
                  };

                  await setAccount(alias, accountData);
                  await setDefaultAccountIfEmpty(alias);

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
