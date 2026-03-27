import { describe, expect, test } from "bun:test";
import {
  AliasSchema,
  MappingConfigSchema,
  AuthLedgerSchema,
  AccountDataSchema,
  EMPTY_MAPPING_CONFIG,
} from "./schemas.js";

describe("AliasSchema", () => {
  test("accepts valid aliases", () => {
    expect(AliasSchema.parse("work")).toBe("work");
    expect(AliasSchema.parse("personal-1")).toBe("personal-1");
    expect(AliasSchema.parse("my_alias")).toBe("my_alias");
    expect(AliasSchema.parse("a")).toBe("a");
    expect(AliasSchema.parse("ABC123")).toBe("ABC123");
  });

  test("rejects empty string", () => {
    expect(() => AliasSchema.parse("")).toThrow(
      "Invalid alias. Use only alphanumeric characters, hyphens, and underscores."
    );
  });

  test("rejects alias with space", () => {
    expect(() => AliasSchema.parse("my alias!")).toThrow(
      "Invalid alias. Use only alphanumeric characters, hyphens, and underscores."
    );
  });

  test("rejects alias with space only", () => {
    expect(() => AliasSchema.parse("hello world")).toThrow(
      "Invalid alias. Use only alphanumeric characters, hyphens, and underscores."
    );
  });

  test("rejects alias with @ symbol", () => {
    expect(() => AliasSchema.parse("alias@bad")).toThrow(
      "Invalid alias. Use only alphanumeric characters, hyphens, and underscores."
    );
  });
});

describe("MappingConfigSchema", () => {
  test("accepts minimal valid config", () => {
    const result = MappingConfigSchema.parse({
      default_account: "",
      mappings: {},
    });
    expect(result.default_account).toBe("");
    expect(result.model_mirroring).toBe("auto");
    expect(result.mappings).toEqual({});
  });

  test("accepts config with valid mapping", () => {
    const result = MappingConfigSchema.parse({
      default_account: "work",
      mappings: {
        "github-copilot/claude-opus-4.6": "work",
      },
    });
    expect(result.default_account).toBe("work");
    expect(result.mappings["github-copilot/claude-opus-4.6"]).toBe("work");
  });

  test("accepts config with model_mirroring set to auto", () => {
    const result = MappingConfigSchema.parse({
      default_account: "",
      model_mirroring: "auto",
      mappings: {},
    });
    expect(result.model_mirroring).toBe("auto");
  });

  test("accepts config with model_mirroring set to skip", () => {
    const result = MappingConfigSchema.parse({
      default_account: "",
      model_mirroring: "skip",
      mappings: {},
    });
    expect(result.model_mirroring).toBe("skip");
  });

  test("defaults model_mirroring to auto when not provided", () => {
    const result = MappingConfigSchema.parse({
      default_account: "",
      mappings: {},
    });
    expect(result.model_mirroring).toBe("auto");
  });

  test("rejects invalid model_mirroring value", () => {
    expect(() =>
      MappingConfigSchema.parse({
        default_account: "",
        model_mirroring: "invalid",
        mappings: {},
      })
    ).toThrow();
  });

  test("rejects missing default_account key", () => {
    expect(() =>
      MappingConfigSchema.parse({
        mappings: {},
      })
    ).toThrow();
  });

  test("rejects mapping key without github-copilot/ prefix", () => {
    expect(() =>
      MappingConfigSchema.parse({
        default_account: "",
        mappings: {
          "claude-opus-4.6": "work",
        },
      })
    ).toThrow();
  });

  test("rejects mapping key with wrong prefix", () => {
    expect(() =>
      MappingConfigSchema.parse({
        default_account: "",
        mappings: {
          "openai/gpt-4": "work",
        },
      })
    ).toThrow();
  });
});

describe("AuthLedgerSchema", () => {
  test("accepts empty object", () => {
    const result = AuthLedgerSchema.parse({});
    expect(result).toEqual({});
  });

  test("accepts valid ledger with one account", () => {
    const result = AuthLedgerSchema.parse({
      work: {
        access_token: "ghu_xxx",
        refresh_token: "ghu_xxx",
        expires: 0,
        enterpriseUrl: "",
      },
    });
    expect(result.work.access_token).toBe("ghu_xxx");
    expect(result.work.expires).toBe(0);
    expect(result.work.enterpriseUrl).toBe("");
  });

  test("accepts ledger with missing enterpriseUrl (defaults to empty string)", () => {
    const result = AuthLedgerSchema.parse({
      personal: {
        access_token: "ghu_abc",
        refresh_token: "ghu_abc",
        expires: 0,
      },
    });
    expect(result.personal.enterpriseUrl).toBe("");
  });
});

describe("AccountDataSchema", () => {
  test("accepts valid account data", () => {
    const result = AccountDataSchema.parse({
      access_token: "ghu_token123",
      refresh_token: "ghu_token123",
      expires: 0,
      enterpriseUrl: "",
    });
    expect(result.access_token).toBe("ghu_token123");
    expect(result.refresh_token).toBe("ghu_token123");
    expect(result.expires).toBe(0);
    expect(result.enterpriseUrl).toBe("");
  });

  test("rejects missing access_token", () => {
    expect(() =>
      AccountDataSchema.parse({
        refresh_token: "ghu_token123",
        expires: 0,
        enterpriseUrl: "",
      })
    ).toThrow();
  });

  test("accepts account with enterprise URL", () => {
    const result = AccountDataSchema.parse({
      access_token: "ghu_token123",
      refresh_token: "ghu_token123",
      expires: 0,
      enterpriseUrl: "https://github.example.com",
    });
    expect(result.enterpriseUrl).toBe("https://github.example.com");
  });
});

describe("EMPTY_MAPPING_CONFIG", () => {
  test("has correct shape", () => {
    expect(EMPTY_MAPPING_CONFIG.default_account).toBe("");
    expect(EMPTY_MAPPING_CONFIG.model_mirroring).toBe("auto");
    expect(EMPTY_MAPPING_CONFIG.mappings).toEqual({});
  });

  test("is valid according to MappingConfigSchema", () => {
    const result = MappingConfigSchema.parse(EMPTY_MAPPING_CONFIG);
    expect(result).toEqual(EMPTY_MAPPING_CONFIG);
  });
});
