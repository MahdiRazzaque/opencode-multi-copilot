import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";

import { EMPTY_MAPPING_CONFIG, MappingConfigSchema } from "./schemas.js";
import type { MappingConfig, ModelMirroring } from "./schemas.js";

export const CONFIG_DIR = path.join(homedir(), ".config", "opencode");
export const MAPPING_PATH = path.join(CONFIG_DIR, "multi-copilot-mapping.json");
export const AUTH_PATH = path.join(CONFIG_DIR, "multi-copilot-auth.json");
export const MODEL_CACHE_PATH = path.join(CONFIG_DIR, "multi-copilot-models-cache.json");

let cachedMapping: MappingConfig | null = null;
let cachedMtime: number | null = null;

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string };
  return errorWithCode.code === "ENOENT" || error.message.includes("ENOENT");
}

async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, filePath);
}

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function ensureMappingConfig(): Promise<void> {
  try {
    await fs.access(MAPPING_PATH);
    return;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  await ensureConfigDir();
  await writeFileAtomically(MAPPING_PATH, `${JSON.stringify(EMPTY_MAPPING_CONFIG, null, 2)}\n`);
}

export async function ensureAuthLedger(): Promise<void> {
  try {
    await fs.access(AUTH_PATH);
    return;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  await ensureConfigDir();
  await writeFileAtomically(AUTH_PATH, `${JSON.stringify({}, null, 2)}\n`);
  await fs.chmod(AUTH_PATH, 0o600);
}

export function clearMappingCache(): void {
  cachedMapping = null;
  cachedMtime = null;
}

export async function readMappingConfig(): Promise<MappingConfig> {
  const statResult = await fs.stat(MAPPING_PATH);
  const currentMtime = statResult.mtimeMs;

  if (cachedMapping !== null && cachedMtime === currentMtime) {
    return cachedMapping;
  }

  const content = await fs.readFile(MAPPING_PATH, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`Failed to parse mapping config at ${MAPPING_PATH}: invalid JSON`, {
      cause: error,
    });
  }

  try {
    const validated = MappingConfigSchema.parse(parsed);
    cachedMapping = validated;
    cachedMtime = currentMtime;
    return validated;
  } catch (error) {
    throw new Error(`Failed to validate mapping config at ${MAPPING_PATH}`, {
      cause: error,
    });
  }
}

export function resolveAliasForModel(
  modelId: string,
  authAliases: string[],
  mapping: MappingConfig
): string | undefined {
  const explicitAlias = mapping.mappings[`github-copilot/${modelId}`];
  if (explicitAlias) {
    return explicitAlias;
  }

  if (mapping.default_account) {
    return mapping.default_account;
  }

  if (authAliases.length > 0) {
    return authAliases[0];
  }

  return undefined;
}

export async function setDefaultAccountIfEmpty(alias: string): Promise<void> {
  const mapping = await readMappingConfig();
  if (mapping.default_account) {
    return;
  }

  mapping.default_account = alias;
  cachedMapping = mapping;
  await writeFileAtomically(MAPPING_PATH, `${JSON.stringify(mapping, null, 2)}\n`);
}

export async function readMirroringMode(): Promise<ModelMirroring> {
  try {
    const mapping = await readMappingConfig();
    return mapping.model_mirroring ?? "skip";
  } catch {
    return "skip";
  }
}

export async function readCachedModelIds(): Promise<string[]> {
  try {
    const content = await fs.readFile(MODEL_CACHE_PATH, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function writeCachedModelIds(modelIds: string[]): Promise<void> {
  await ensureConfigDir();
  await writeFileAtomically(MODEL_CACHE_PATH, `${JSON.stringify(modelIds, null, 2)}\n`);
}
 