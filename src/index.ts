import type { Plugin } from "@opencode-ai/plugin";

import { createMultiCopilotPlugin } from "./plugin/create-multi-copilot-plugin.js";

const plugin: Plugin = async (input) => createMultiCopilotPlugin(input);

export default plugin;
