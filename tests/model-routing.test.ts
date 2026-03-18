import { describe, expect, test } from "bun:test";

import {
  extractRequestedModel,
  resolveRoute,
} from "../src/routing/model-routing.js";

describe("extractRequestedModel", () => {
  test("extracts the model from a completions payload", () => {
    expect(extractRequestedModel(JSON.stringify({ model: "gpt-5", prompt: "Hello" }))).toBe("gpt-5");
  });

  test("extracts the model from a responses payload", () => {
    expect(extractRequestedModel(JSON.stringify({ model: "gpt-5-mini", input: "Hello" }))).toBe("gpt-5-mini");
  });

  test("extracts the model from a messages payload", () => {
    expect(
      extractRequestedModel(
        JSON.stringify({
          messages: [{ content: "Hello", role: "user" }],
          model: "claude-opus-4.6",
        }),
      ),
    ).toBe("claude-opus-4.6");
  });
});

describe("resolveRoute", () => {
  test("routes to the mapped alias when the account is authenticated", () => {
    expect(
      resolveRoute({
        authenticatedAliases: ["personal", "work"],
        mapping: {
          defaultAccount: null,
          mappings: { "claude-opus-4.6": "work" },
        },
        requestBody: JSON.stringify({ messages: [{ content: "Hi", role: "user" }], model: "claude-opus-4.6" }),
      }),
    ).toEqual({ alias: "work", model: "claude-opus-4.6" });
  });

  test("falls back to the default account when the model is unmapped", () => {
    expect(
      resolveRoute({
        authenticatedAliases: ["personal", "work"],
        mapping: {
          defaultAccount: "personal",
          mappings: {},
        },
        requestBody: JSON.stringify({ input: "Hi", model: "gpt-5-mini" }),
      }),
    ).toEqual({ alias: "personal", model: "gpt-5-mini" });
  });

  test("falls back to the first authenticated account when no default is configured", () => {
    expect(
      resolveRoute({
        authenticatedAliases: ["work", "personal"],
        mapping: {
          defaultAccount: null,
          mappings: {},
        },
        requestBody: JSON.stringify({ model: "gpt-5-mini", prompt: "Hi" }),
      }),
    ).toEqual({ alias: "work", model: "gpt-5-mini" });
  });

  test("fails fast when a mapped alias is unauthenticated", () => {
    expect(() =>
      resolveRoute({
        authenticatedAliases: ["personal"],
        mapping: {
          defaultAccount: null,
          mappings: { "claude-opus-4.6": "work" },
        },
        requestBody: JSON.stringify({ messages: [{ content: "Hi", role: "user" }], model: "claude-opus-4.6" }),
      }),
    ).toThrow("Run 'opencode auth multi-copilot' to authenticate");
  });
});
