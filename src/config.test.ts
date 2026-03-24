import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as path from "node:path";

const consoleWarnMock = mock((_message?: unknown, _payload?: unknown) => {});
const mockWriteFile = mock(() => Promise.resolve());
const mockRename = mock(() => Promise.resolve());
const mockChmod = mock(() => Promise.resolve());
const mockMkdir = mock(() => Promise.resolve());
const mockAccess = mock(() => Promise.resolve());
const mockStat = mock(() => Promise.resolve({ mtimeMs: 1000 }));
const mockReadFile = mock(() => Promise.resolve("{}"));
const mockHomedir = mock(() => "/test/home");

mock.module("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  rename: mockRename,
  chmod: mockChmod,
  mkdir: mockMkdir,
  access: mockAccess,
  stat: mockStat,
  readFile: mockReadFile,
}));

mock.module("node:os", () => ({
  homedir: mockHomedir,
}));

const {
  CONFIG_DIR,
  MAPPING_PATH,
  AUTH_PATH,
  ensureMappingConfig,
  ensureAuthLedger,
  ensureConfigDir,
  setDefaultAccountIfEmpty,
  writeCachedModelIds,
} = await import("./config.js");

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function waitForCallCount(fn: { mock: { calls: unknown[][] } }, expectedCount: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (fn.mock.calls.length === expectedCount) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for ${expectedCount} calls`);
}

describe("Config paths and auto-generation", () => {
  beforeEach(() => {
    console.warn = consoleWarnMock as typeof console.warn;
    consoleWarnMock.mockReset();
    consoleWarnMock.mockImplementation((_message?: unknown, _payload?: unknown) => {});
  });

  describe("Config paths", () => {
    test("CONFIG_DIR resolves to ~/.config/opencode", () => {
      expect(CONFIG_DIR).toBe(path.join("/test/home", ".config", "opencode"));
    });

    test("MAPPING_PATH resolves to CONFIG_DIR/multi-copilot-mapping.json", () => {
      expect(MAPPING_PATH).toBe(
        path.join(
          "/test/home",
          ".config",
          "opencode",
          "multi-copilot-mapping.json"
        )
      );
    });

    test("AUTH_PATH resolves to CONFIG_DIR/multi-copilot-auth.json", () => {
      expect(AUTH_PATH).toBe(
        path.join(
          "/test/home",
          ".config",
          "opencode",
          "multi-copilot-auth.json"
        )
      );
    });
  });

  describe("ensureConfigDir", () => {
    beforeEach(() => {
      mockMkdir.mockReset();
      mockMkdir.mockImplementation(() => Promise.resolve());
    });

    test("creates config directory with recursive: true", async () => {
      await ensureConfigDir();

      expect(mockMkdir).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
    });
  });

  describe("ensureMappingConfig", () => {
    beforeEach(() => {
      mockMkdir.mockReset();
      mockAccess.mockReset();
      mockWriteFile.mockReset();
      mockRename.mockReset();
      mockMkdir.mockImplementation(() => Promise.resolve());
      mockWriteFile.mockImplementation(() => Promise.resolve());
      mockRename.mockImplementation(() => Promise.resolve());
    });

    test("creates mapping file when it does not exist", async () => {
      mockAccess.mockImplementation(() => Promise.reject(new Error("ENOENT")));

      await ensureMappingConfig();

      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockRename).toHaveBeenCalled();

      const writeCall = mockWriteFile.mock.calls[0] as unknown[] | undefined;
      if (!writeCall) {
        throw new Error("Expected writeFile to be called");
      }

      const writtenContent = writeCall[1] as string;
      const parsed = JSON.parse(writtenContent);

      expect(parsed.default_account).toBe("");
      expect(parsed.model_mirroring).toBe("skip");
      expect(parsed.mappings).toEqual({});
    });

    test("creates parent directory if missing", async () => {
      mockAccess.mockImplementation(() => Promise.reject(new Error("ENOENT")));

      await ensureMappingConfig();

      expect(mockMkdir).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
    });

    test("does NOT overwrite existing mapping file", async () => {
      mockAccess.mockImplementation(() => Promise.resolve());

      await ensureMappingConfig();

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockRename).not.toHaveBeenCalled();
    });
  });

  describe("ensureAuthLedger", () => {
    beforeEach(() => {
      mockMkdir.mockReset();
      mockAccess.mockReset();
      mockWriteFile.mockReset();
      mockRename.mockReset();
      mockChmod.mockReset();
      mockMkdir.mockImplementation(() => Promise.resolve());
      mockWriteFile.mockImplementation(() => Promise.resolve());
      mockRename.mockImplementation(() => Promise.resolve());
      mockChmod.mockImplementation(() => Promise.resolve());
    });

    test("creates auth file with empty object when file does not exist", async () => {
      mockAccess.mockImplementation(() => Promise.reject(new Error("ENOENT")));

      await ensureAuthLedger();

      expect(mockWriteFile).toHaveBeenCalled();

      const writeCall = mockWriteFile.mock.calls[0] as unknown[] | undefined;
      if (!writeCall) {
        throw new Error("Expected writeFile to be called");
      }

      const writtenContent = writeCall[1] as string;
      const parsed = JSON.parse(writtenContent);

      expect(parsed).toEqual({});
    });

    test("sets file permissions to 0o600", async () => {
      mockAccess.mockImplementation(() => Promise.reject(new Error("ENOENT")));

      await ensureAuthLedger();

      expect(mockChmod).toHaveBeenCalledWith(AUTH_PATH, 0o600);
    });

    test("does NOT overwrite existing auth file", async () => {
      mockAccess.mockImplementation(() => Promise.resolve());

      await ensureAuthLedger();

      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockChmod).not.toHaveBeenCalled();
    });

    test("uses atomic write (temp file + rename)", async () => {
      mockAccess.mockImplementation(() => Promise.reject(new Error("ENOENT")));

      await ensureAuthLedger();

      const writeCall = mockWriteFile.mock.calls[0] as unknown[] | undefined;
      if (!writeCall) {
        throw new Error("Expected writeFile to be called");
      }

      const tmpPath = writeCall[0] as string;
      expect(tmpPath).toContain(".tmp");

      const renameCall = mockRename.mock.calls[0] as unknown[] | undefined;
      if (!renameCall) {
        throw new Error("Expected rename to be called");
      }

      const [from, to] = renameCall as [string, string];
      expect(from).toContain(".tmp");
      expect(to).toBe(AUTH_PATH);
    });

    test("uses a unique temp path for each auth ledger write", async () => {
      mockAccess.mockImplementation(() => Promise.reject(new Error("ENOENT")));

      await ensureAuthLedger();
      mockAccess.mockImplementation(() => Promise.reject(new Error("ENOENT")));
      await ensureAuthLedger();

      const firstWriteCall = mockWriteFile.mock.calls[0] as unknown as [string, string] | undefined;
      const secondWriteCall = mockWriteFile.mock.calls[1] as unknown as [string, string] | undefined;
      if (!firstWriteCall || !secondWriteCall) {
        throw new Error("Expected two writeFile calls");
      }

      expect(firstWriteCall[0]).not.toBe(secondWriteCall[0]);
    });
  });
});

describe("readMappingConfig", () => {
  beforeEach(async () => {
    const { clearMappingCache } = await import("./config.js");

    mockStat.mockReset();
    mockReadFile.mockReset();
    clearMappingCache();
  });

  test("reads and parses mapping file", async () => {
    const { readMappingConfig, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 1000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "work", mappings: {} }))
    );

    const result = await readMappingConfig();
    expect(result.default_account).toBe("work");
    expect(result.mappings).toEqual({});
  });

  test("returns cached result when mtime unchanged", async () => {
    const { readMappingConfig, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 2000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "cached", mappings: {} }))
    );

    await readMappingConfig();
    const readCount1 = mockReadFile.mock.calls.length;

    await readMappingConfig();
    const readCount2 = mockReadFile.mock.calls.length;

    expect(readCount2).toBe(readCount1);
  });

  test("re-reads file when mtime has changed", async () => {
    const { readMappingConfig, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 3000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "v1", mappings: {} }))
    );
    await readMappingConfig();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 4000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "v2", mappings: {} }))
    );
    const result = await readMappingConfig();

    expect(result.default_account).toBe("v2");
  });

  test("throws descriptive error if file content is invalid JSON", async () => {
    const { readMappingConfig, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 5000 }));
    mockReadFile.mockImplementation(() => Promise.resolve("not valid json"));

    expect(readMappingConfig()).rejects.toThrow();
  });

  test("throws descriptive error if file fails Zod validation", async () => {
    const { readMappingConfig, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 6000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ wrong_field: "bad" }))
    );

    expect(readMappingConfig()).rejects.toThrow();
  });
});

describe("resolveAliasForModel", () => {
  test("returns explicit mapping when found", async () => {
    const { resolveAliasForModel } = await import("./config.js");

    const mapping = {
      default_account: "default",
      model_mirroring: "skip" as const,
      mappings: { "github-copilot/claude-opus-4.6": "work" },
    };

    const result = resolveAliasForModel("claude-opus-4.6", ["work", "personal"], mapping);
    expect(result).toBe("work");
  });

  test("returns default_account when no explicit mapping", async () => {
    const { resolveAliasForModel } = await import("./config.js");

    const mapping = {
      default_account: "personal",
      model_mirroring: "skip" as const,
      mappings: {},
    };

    const result = resolveAliasForModel("some-model", ["work", "personal"], mapping);
    expect(result).toBe("personal");
  });

  test("returns first auth alias when no explicit mapping and no default_account", async () => {
    const { resolveAliasForModel } = await import("./config.js");

    const mapping = {
      default_account: "",
      model_mirroring: "skip" as const,
      mappings: {},
    };

    const result = resolveAliasForModel("some-model", ["work", "personal"], mapping);
    expect(result).toBe("work");
  });

  test("returns undefined when no mapping, no default, and no auth aliases", async () => {
    const { resolveAliasForModel } = await import("./config.js");

    const mapping = {
      default_account: "",
      model_mirroring: "skip" as const,
      mappings: {},
    };

    const result = resolveAliasForModel("some-model", [], mapping);
    expect(result).toBeUndefined();
  });
});

describe("readMirroringMode", () => {
  beforeEach(async () => {
    const { clearMappingCache } = await import("./config.js");

    mockStat.mockReset();
    mockReadFile.mockReset();
    consoleWarnMock.mockReset();
    consoleWarnMock.mockImplementation((_message?: unknown, _payload?: unknown) => {});
    clearMappingCache();
  });

  test("returns 'auto' when model_mirroring is set to auto", async () => {
    const { readMirroringMode, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 10000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "", model_mirroring: "auto", mappings: {} }))
    );

    const result = await readMirroringMode();
    expect(result).toBe("auto");
  });

  test("returns 'skip' when model_mirroring is set to skip", async () => {
    const { readMirroringMode, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 11000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "", model_mirroring: "skip", mappings: {} }))
    );

    const result = await readMirroringMode();
    expect(result).toBe("skip");
  });

  test("returns 'skip' when model_mirroring is not present in config", async () => {
    const { readMirroringMode, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 12000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "", mappings: {} }))
    );

    const result = await readMirroringMode();
    expect(result).toBe("skip");
  });

  test("returns 'skip' when config file cannot be read", async () => {
    const { readMirroringMode, clearMappingCache } = await import("./config.js");
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.reject(new Error("ENOENT")));

    const result = await readMirroringMode();
    expect(result).toBe("skip");
    expect(consoleWarnMock).toHaveBeenCalledWith("[multi-copilot]", {
      level: "warn",
      event: "mirroring-mode-read-failed",
      fallback: "Falling back to model_mirroring='skip'.",
      error: "ENOENT",
    });
  });
});

describe("readCachedModelIds", () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    consoleWarnMock.mockReset();
    consoleWarnMock.mockImplementation((_message?: unknown, _payload?: unknown) => {});
  });

  test("returns [] without warning when the optional cache file is missing", async () => {
    const { readCachedModelIds } = await import("./config.js");
    mockReadFile.mockImplementation(() => Promise.reject(new Error("ENOENT")));

    const result = await readCachedModelIds();

    expect(result).toEqual([]);
    expect(consoleWarnMock).not.toHaveBeenCalled();
  });

  test("returns [] and warns when the cache file shape is invalid", async () => {
    const { readCachedModelIds } = await import("./config.js");
    mockReadFile.mockImplementation(() => Promise.resolve(JSON.stringify({ nope: true })));

    const result = await readCachedModelIds();

    expect(result).toEqual([]);
    expect(consoleWarnMock).toHaveBeenCalledWith("[multi-copilot]", {
      level: "warn",
      event: "cached-model-ids-invalid",
      fallback: "Ignoring cached model IDs and continuing without mirrored-model cache.",
    });
  });
});

describe("mapping writes", () => {
  beforeEach(async () => {
    const { clearMappingCache } = await import("./config.js");

    mockStat.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockRename.mockReset();
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 13000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "", model_mirroring: "skip", mappings: {} }))
    );
    mockWriteFile.mockImplementation(() => Promise.resolve());
    mockRename.mockImplementation(() => Promise.resolve());
  });

  test("serialises concurrent default-account initialisation for the mapping file", async () => {
    const firstWrite = createDeferred();
    let currentMtime = 13000;
    let currentContent = JSON.stringify({ default_account: "", model_mirroring: "skip", mappings: {} });
    const tempContents = new Map<string, string>();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: currentMtime }));
    mockReadFile.mockImplementation(() => Promise.resolve(currentContent));
    mockWriteFile.mockImplementationOnce(async (...args: unknown[]) => {
      const [tempPath, content] = args as [string, string];
      tempContents.set(tempPath, content);
      await firstWrite.promise;
    });
    mockWriteFile.mockImplementation(async (...args: unknown[]) => {
      const [tempPath, content] = args as [string, string];
      tempContents.set(tempPath, content);
    });
    mockRename.mockImplementation(async (...args: unknown[]) => {
      const [from] = args as [string, string];
      const nextContent = tempContents.get(from);
      if (!nextContent) {
        throw new Error("Expected temp file content before rename");
      }

      currentContent = nextContent;
      currentMtime += 1;
    });

    const first = setDefaultAccountIfEmpty("work");
    await waitForCallCount(mockWriteFile, 1);

    const second = setDefaultAccountIfEmpty("personal");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWriteFile.mock.calls.length).toBe(1);

    firstWrite.resolve();
    await Promise.all([first, second]);

    expect(JSON.parse(currentContent)).toMatchObject({
      default_account: "work",
    });
    expect(mockWriteFile.mock.calls.length).toBe(1);
  });

  test("uses unique temp paths for repeated model cache writes", async () => {
    await writeCachedModelIds(["claude-opus-4.6"]);
    await writeCachedModelIds(["gpt-5"]);

    const firstWriteCall = mockWriteFile.mock.calls[0] as unknown as [string, string] | undefined;
    const secondWriteCall = mockWriteFile.mock.calls[1] as unknown as [string, string] | undefined;
    if (!firstWriteCall || !secondWriteCall) {
      throw new Error("Expected two writeFile calls");
    }

    expect(firstWriteCall[0]).not.toBe(secondWriteCall[0]);
  });
});

describe("mapping writes", () => {
  beforeEach(async () => {
    const { clearMappingCache } = await import("./config.js");

    mockStat.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockRename.mockReset();
    clearMappingCache();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: 13000 }));
    mockReadFile.mockImplementation(() =>
      Promise.resolve(JSON.stringify({ default_account: "", model_mirroring: "skip", mappings: {} }))
    );
    mockWriteFile.mockImplementation(() => Promise.resolve());
    mockRename.mockImplementation(() => Promise.resolve());
  });

  test("serialises concurrent default-account initialisation for the mapping file", async () => {
    const firstWrite = createDeferred();
    let currentMtime = 13000;
    let currentContent = JSON.stringify({ default_account: "", model_mirroring: "skip", mappings: {} });
    const tempContents = new Map<string, string>();

    mockStat.mockImplementation(() => Promise.resolve({ mtimeMs: currentMtime }));
    mockReadFile.mockImplementation(() => Promise.resolve(currentContent));
    mockWriteFile.mockImplementationOnce(async (...args: unknown[]) => {
      const [tempPath, content] = args as [string, string];
      tempContents.set(tempPath, content);
      await firstWrite.promise;
    });
    mockWriteFile.mockImplementation(async (...args: unknown[]) => {
      const [tempPath, content] = args as [string, string];
      tempContents.set(tempPath, content);
    });
    mockRename.mockImplementation(async (...args: unknown[]) => {
      const [from] = args as [string, string];
      const nextContent = tempContents.get(from);
      if (!nextContent) {
        throw new Error("Expected temp file content before rename");
      }

      currentContent = nextContent;
      currentMtime += 1;
    });

    const first = setDefaultAccountIfEmpty("work");
    await waitForCallCount(mockWriteFile, 1);

    const second = setDefaultAccountIfEmpty("personal");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWriteFile.mock.calls.length).toBe(1);

    firstWrite.resolve();
    await Promise.all([first, second]);

    expect(JSON.parse(currentContent)).toMatchObject({
      default_account: "work",
    });
    expect(mockWriteFile.mock.calls.length).toBe(1);
  });

  test("uses unique temp paths for repeated model cache writes", async () => {
    await writeCachedModelIds(["claude-opus-4.6"]);
    await writeCachedModelIds(["gpt-5"]);

    const firstWriteCall = mockWriteFile.mock.calls[0] as unknown as [string, string] | undefined;
    const secondWriteCall = mockWriteFile.mock.calls[1] as unknown as [string, string] | undefined;
    if (!firstWriteCall || !secondWriteCall) {
      throw new Error("Expected two writeFile calls");
    }

    expect(firstWriteCall[0]).not.toBe(secondWriteCall[0]);
  });
});
