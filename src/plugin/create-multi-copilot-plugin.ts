import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Config, Provider } from "@opencode-ai/sdk";

import { AuthStateManager } from "../auth/auth-state-manager.js";
import { validateAliasPrompt } from "../auth/alias.js";
import {
  GitHubDeviceFlowClient,
  normaliseEnterpriseHost,
} from "../auth/github-device-flow.js";
import { TokenService } from "../auth/token-service.js";
import { MULTI_COPILOT_PROVIDER } from "../constants.js";
import { MappingStore } from "../config/mapping-store.js";
import { resolveMultiCopilotPaths } from "../config/paths.js";
import { CopilotBaseUrlStrategy } from "../network/base-url-strategy.js";
import { createInterceptingFetch } from "./fetch-interceptor.js";

export async function createMultiCopilotPlugin(_input: PluginInput): Promise<Hooks> {
  const paths = resolveMultiCopilotPaths();
  const mappingStore = new MappingStore({ filePath: paths.mappingFilePath });
  const stateManager = AuthStateManager.getInstance({ filePath: paths.authFilePath });
  const oauthClient = new GitHubDeviceFlowClient();
  const tokenService = new TokenService({
    clock: () => Date.now(),
    oauthClient,
    stateManager,
  });
  const baseUrlStrategy = new CopilotBaseUrlStrategy();
  const routedFetch = createInterceptingFetch({
    baseUrlStrategy,
    downstreamFetch: fetch,
    mappingStore,
    tokenService,
  });

  await mappingStore.load();

  return {
    auth: {
      provider: MULTI_COPILOT_PROVIDER,
      async loader(_getAuth, provider) {
        normaliseProviderModels(provider);

        return {
          apiKey: "",
          async fetch(request: RequestInfo | URL, init?: RequestInit) {
            return routedFetch(request, init);
          },
        };
      },
      methods: [
        {
          type: "oauth",
          label: "Authorise a GitHub Copilot account",
          prompts: [
            {
              key: "alias",
              message: "Choose an account alias",
              placeholder: "work",
              type: "text",
              validate: validateAliasPrompt,
            },
            {
              key: "enterprise_url",
              message: "Optional GitHub Enterprise hostname",
              placeholder: "github.example.com",
              type: "text",
            },
          ],
          async authorize(inputs = {}) {
            const alias = inputs["alias"] ?? "";
            const enterpriseUrl = inputs["enterprise_url"]
              ? normaliseEnterpriseHost(inputs["enterprise_url"])
              : null;
            const started = await oauthClient.startAuthorisation(enterpriseUrl);

            return {
              instructions: `Enter code: ${started.userCode}`,
              method: "auto" as const,
              url: started.verificationUri,
              async callback() {
                try {
                  const tokens = await oauthClient.pollForTokens({
                    deviceCode: started.deviceCode,
                    enterpriseUrl,
                    expiresIn: started.expiresIn,
                    interval: started.interval,
                  });

                  await stateManager.upsertAccount({
                    accessToken: tokens.accessToken,
                    alias,
                    ...(tokens.accountId ? { accountId: tokens.accountId } : {}),
                    enterpriseUrl,
                    expiresAt: tokens.expiresAt,
                    refreshToken: tokens.refreshToken,
                  });

                  return {
                    key: alias,
                    provider: MULTI_COPILOT_PROVIDER,
                    type: "success" as const,
                  };
                } catch {
                  return { type: "failed" as const };
                }
              },
            };
          },
        },
      ],
    },
    config: async (config: Config) => {
      config.provider ??= {};

      const existing = config.provider[MULTI_COPILOT_PROVIDER];
      config.provider[MULTI_COPILOT_PROVIDER] = {
        ...existing,
        id: existing?.id ?? "github-copilot",
        name: existing?.name ?? "Multi Copilot",
        options: {
          ...(existing?.options ?? {}),
          baseURL: "https://api.github.com",
        },
      };
    },
  };
}

function normaliseProviderModels(provider: Provider): void {
  for (const model of Object.values(provider.models)) {
    model.api.npm = "@ai-sdk/github-copilot";
    model.cost = {
      cache: {
        read: 0,
        write: 0,
      },
      input: 0,
      output: 0,
    };
  }
}
