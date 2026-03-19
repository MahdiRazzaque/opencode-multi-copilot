import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as path from "node:path";

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
} = await import("./config.js");

describe("Config paths and auto-generation", () => {
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
  });
});
