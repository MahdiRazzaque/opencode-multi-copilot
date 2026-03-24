import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Config } from "@opencode-ai/sdk";

import { createAuthHook } from "./auth.js";
import { ensureAuthLedger, ensureMappingConfig, readMappingConfig } from "./config.js";
import { warnFallback } from "./diagnostics.js";

function buildConfigModel(bareId: string) {
  return {
    id: bareId,
    name: bareId,
    temperature: true,
    tool_call: true,
    cost: { input: 0, output: 0 },
    limit: { context: 128000, output: 16384 },
  };
}

export default async function MultiCopilotPlugin(input: PluginInput): Promise<Hooks> {
  await ensureMappingConfig();
  await ensureAuthLedger();

  return {
    config: async (config: Config) => {
      config.provider = config.provider ?? {};

      const models: Record<string, ReturnType<typeof buildConfigModel>> = {};
      const mapping = await readMappingConfig().catch((error) => {
        warnFallback(
          "mapping-config-unavailable",
          "Continuing with no predeclared config-hook models.",
          error
        );
        return null;
      });
      if (mapping) {
        for (const key of Object.keys(mapping.mappings)) {
          const bareId = key.replace(/^github-copilot\//, "");
          models[bareId] = buildConfigModel(bareId);
        }
      }

      config.provider["multi-copilot"] = {
        name: "Multi Copilot",
        env: [],
        models,
      };
    },
    auth: createAuthHook(input),
  };
}
