import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Config } from "@opencode-ai/sdk";

import { createAuthHook } from "./auth.js";
import { ensureAuthLedger, ensureMappingConfig, readMappingConfig } from "./config.js";
import { warnFallback } from "./diagnostics.js";
import { buildMultiCopilotModel } from "./models.js";

export default async function MultiCopilotPlugin(input: PluginInput): Promise<Hooks> {
  await ensureMappingConfig();
  await ensureAuthLedger();

  return {
    config: async (config: Config) => {
      config.provider = config.provider ?? {};

      const models: Record<string, ReturnType<typeof buildMultiCopilotModel>> = {};
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
          models[bareId] = buildMultiCopilotModel(bareId);
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
