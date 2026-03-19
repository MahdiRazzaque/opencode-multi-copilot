import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { assertValidAlias } from "../auth/alias.js";
import { DEFAULT_MAPPING_FILE } from "../constants.js";
import type { ModelMapping } from "../types.js";

const mappingFileSchema = z.object({
  default_account: z.string().nullable(),
  mappings: z.record(z.string(), z.string()),
});

export class MappingStore {
  private cachedMapping?: ModelMapping;
  private cachedMtimeMs?: number;

  constructor(private readonly options: { filePath: string }) {}

  async load(): Promise<ModelMapping> {
    await this.ensureInitialised();
    const fileStat = await stat(this.options.filePath);

    if (this.cachedMapping && this.cachedMtimeMs === fileStat.mtimeMs) {
      return this.cachedMapping;
    }

    const raw = await readFile(this.options.filePath, "utf8");
    const parsed = mappingFileSchema.parse(JSON.parse(raw));
    if (parsed.default_account) {
      assertValidAlias(parsed.default_account);
    }

    for (const alias of Object.values(parsed.mappings)) {
      assertValidAlias(alias);
    }

    const mapping: ModelMapping = {
      defaultAccount: parsed.default_account,
      mappings: parsed.mappings,
    };

    this.cachedMapping = mapping;
    this.cachedMtimeMs = fileStat.mtimeMs;

    return mapping;
  }

  private async ensureInitialised(): Promise<void> {
    try {
      await stat(this.options.filePath);
    } catch (_e) {
      await mkdir(dirname(this.options.filePath), { recursive: true });
      await writeFile(this.options.filePath, DEFAULT_MAPPING_FILE, "utf8");
    }
  }
}
