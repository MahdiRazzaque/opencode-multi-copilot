import { describe, expect, test } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import type { Config, Provider } from "@opencode-ai/sdk";

import { INVALID_ALIAS_MESSAGE } from "../src/auth/alias.js";
import { MULTI_COPILOT_PROVIDER } from "../src/constants.js";
import { createMultiCopilotPlugin } from "../src/plugin/create-multi-copilot-plugin.js";

describe("createMultiCopilotPlugin", () => {
  test("registers the multi-copilot auth provider and config override", async () => {
    const hooks = await createMultiCopilotPlugin({} as PluginInput);
    const config: Config = {};
    const aliasPrompt = hooks.auth?.methods[0]?.prompts?.[0];

    if (!aliasPrompt || aliasPrompt.type !== "text") {
      throw new Error("Expected the first auth prompt to be a text alias prompt.");
    }

    await hooks.config?.(config);

    expect(hooks.auth?.provider).toBe(MULTI_COPILOT_PROVIDER);
    expect(hooks.auth?.methods[0]?.type).toBe("oauth");
    expect(aliasPrompt.validate?.("my alias!")).toBe(INVALID_ALIAS_MESSAGE);
    expect(config.provider?.[MULTI_COPILOT_PROVIDER]).toEqual({
      id: "github-copilot",
      name: "Multi Copilot",
      options: {
        baseURL: "https://api.github.com",
      },
    });
  });

  test("returns a fetch interceptor from the auth loader", async () => {
    const hooks = await createMultiCopilotPlugin({} as PluginInput);
    const loaderOutput = await hooks.auth?.loader?.(
      async () => ({ key: "ignored", type: "api", value: "ignored" }),
      {
        env: [],
        id: MULTI_COPILOT_PROVIDER,
        models: {},
        name: "Multi Copilot",
        options: {},
        source: "custom",
      } satisfies Provider,
    );

    expect(loaderOutput?.["apiKey"]).toBe("");
    expect(typeof loaderOutput?.["fetch"]).toBe("function");
  });
});
