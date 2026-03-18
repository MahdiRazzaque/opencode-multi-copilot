import { homedir } from "node:os";
import { join } from "node:path";

export type MultiCopilotPaths = {
  authFilePath: string;
  configDirectory: string;
  mappingFilePath: string;
};

export function resolveMultiCopilotPaths(homeDirectory = homedir()): MultiCopilotPaths {
  const configDirectory = join(homeDirectory, ".config", "opencode");

  return {
    authFilePath: join(configDirectory, "multi-copilot-auth.json"),
    configDirectory,
    mappingFilePath: join(configDirectory, "multi-copilot-mapping.json"),
  };
}
