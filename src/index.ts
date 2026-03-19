import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Config } from "@opencode-ai/sdk";

import { createAuthHook } from "./auth.js";
import { ensureAuthLedger, ensureMappingConfig } from "./config.js";

export default async function MultiCopilotPlugin(input: PluginInput): Promise<Hooks> {
  await ensureMappingConfig();
  await ensureAuthLedger();

  return {
    config: async (config: Config) => {
      config.provider = config.provider ?? {};
      config.provider["multi-copilot"] = {
        name: "Multi Copilot",
        env: [],
      };
    },
    auth: createAuthHook(input),
  };
}
