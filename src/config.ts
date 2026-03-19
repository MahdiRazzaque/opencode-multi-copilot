import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { EMPTY_MAPPING_CONFIG } from "./schemas.js";

export const CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
export const MAPPING_PATH = path.join(
  CONFIG_DIR,
  "multi-copilot-mapping.json"
);
export const AUTH_PATH = path.join(CONFIG_DIR, "multi-copilot-auth.json");

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function ensureMappingConfig(): Promise<void> {
  await ensureConfigDir();

  try {
    await fs.access(MAPPING_PATH);
  } catch {
    const tmpPath = `${MAPPING_PATH}.tmp`;
    await fs.writeFile(
      tmpPath,
      JSON.stringify(EMPTY_MAPPING_CONFIG, null, 2),
      "utf-8"
    );
    await fs.rename(tmpPath, MAPPING_PATH);
  }
}

export async function ensureAuthLedger(): Promise<void> {
  await ensureConfigDir();

  try {
    await fs.access(AUTH_PATH);
  } catch {
    const tmpPath = `${AUTH_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify({}, null, 2), "utf-8");
    await fs.rename(tmpPath, AUTH_PATH);
    await fs.chmod(AUTH_PATH, 0o600);
  }
}
