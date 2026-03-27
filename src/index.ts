import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Config } from "@opencode-ai/sdk";

import { createAuthHook } from "./auth.js";
import {
  ensureAuthLedger,
  ensureMappingConfig,
  readCachedModels,
  readMappingConfig,
} from "./config.js";
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
      const cachedModels = await readCachedModels().catch(() => []);
      const nameMap = new Map(cachedModels.map((model) => [model.id, model.name]));

      if (mapping) {
        for (const key of Object.keys(mapping.mappings)) {
          const bareId = key.replace(/^github-copilot\//, "");
          const cachedName = nameMap.get(bareId);
          const source: Record<string, unknown> = {};

          if (cachedName) {
            source.name = cachedName;
          }

          models[bareId] = buildMultiCopilotModel(bareId, source);
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
