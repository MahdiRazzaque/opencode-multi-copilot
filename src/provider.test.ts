import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockResolveAccountForModel = mock(async (_modelId: string) => ({
  alias: "work",
  account: {
    access_token: "test-token-abc",
    refresh_token: "test-token-abc",
    expires: 0,
    enterpriseUrl: "",
  },
}));

mock.module("./ledger.js", () => ({
  resolveAccountForModel: mockResolveAccountForModel,
}));

const fetchMock = mock(async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
});

globalThis.fetch = fetchMock as unknown as typeof fetch;

const {
  PERSONAL_BASE_URL,
  constructBaseURL,
  createCustomFetch,
  detectAgent,
  detectVision,
  normaliseDomain,
  createMultiCopilotProvider,
} = await import("./provider.js");

describe("provider helpers", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    mockResolveAccountForModel.mockClear();
  });

  test("detectVision returns true for completions image_url content", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "https://example.com/cat.png" } }],
        },
      ],
    };

    expect(detectVision(body, "https://api.github.com/chat/completions")).toBe(true);
  });

  test("detectVision returns true for responses input_image content", () => {
    const body = {
      input: [
        {
          role: "user",
          content: [{ type: "input_image", image_url: "https://example.com/cat.png" }],
        },
      ],
    };

    expect(detectVision(body, "https://api.github.com/v1/responses")).toBe(true);
  });

  test("detectVision returns true for messages image content", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "image", source: { type: "base64", data: "abc" } }],
        },
      ],
    };

    expect(detectVision(body, "https://api.github.com/v1/messages")).toBe(true);
  });

  test("detectVision returns true for messages tool_result image content", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              content: [{ type: "image", source: { type: "base64", data: "abc" } }],
            },
          ],
        },
      ],
    };

    expect(detectVision(body, "https://api.github.com/v1/messages")).toBe(true);
  });

  test("detectVision returns false when no image content is present", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    };

    expect(detectVision(body, "https://api.github.com/v1/messages")).toBe(false);
  });

  test("detectAgent returns true when the last role is assistant", () => {
    const body = {
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    };

    expect(detectAgent(body, "https://api.github.com/chat/completions")).toBe(true);
  });

  test("detectAgent returns false when the last role is user", () => {
    const body = {
      messages: [
        { role: "assistant", content: "hi" },
        { role: "user", content: "hello" },
      ],
    };

    expect(detectAgent(body, "https://api.github.com/chat/completions")).toBe(false);
  });

  test("detectAgent returns false for empty body", () => {
    expect(detectAgent(null)).toBe(false);
    expect(detectAgent({})).toBe(false);
  });

  test("createCustomFetch injects Authorization from the resolved account", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token-abc");
  });

  test("createCustomFetch injects x-initiator agent when the last role is not user", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
        ],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers["x-initiator"]).toBe("agent");
  });

  test("createCustomFetch injects x-initiator user when the last role is user", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers["x-initiator"]).toBe("user");
  });

  test("createCustomFetch injects Copilot-Vision-Request for vision content", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: "https://example.com/cat.png" } }],
          },
        ],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers["Copilot-Vision-Request"]).toBe("true");
  });

  test("createCustomFetch injects Openai-Intent conversation-edits", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers["Openai-Intent"]).toBe("conversation-edits");
  });

  test("createCustomFetch injects the opencode multi-copilot user agent", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("opencode/multi-copilot");
  });

  test("createCustomFetch deletes x-api-key from headers", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      headers: {
        "x-api-key": "remove-me",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();
  });

  test("createCustomFetch deletes lowercase authorization from headers", async () => {
    const customFetch = createCustomFetch("claude-sonnet-4");

    await customFetch("https://api.github.com/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer stale-token",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    if (!call) {
      throw new Error("Expected wrapped fetch call");
    }

    const headers = call[1].headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.Authorization).toBe("Bearer test-token-abc");
  });

  test("constructBaseURL returns the personal base URL for personal accounts", () => {
    expect(constructBaseURL({ enterpriseUrl: "" })).toBe(PERSONAL_BASE_URL);
  });

  test("constructBaseURL returns the enterprise copilot host for enterprise accounts", () => {
    expect(constructBaseURL({ enterpriseUrl: "https://github.example.com" })).toBe(
      "https://copilot-api.github.example.com"
    );
  });

  test("normaliseDomain strips protocol and trailing slash", () => {
    expect(normaliseDomain("https://github.example.com/")).toBe("github.example.com");
  });

  test("normaliseDomain strips protocol without requiring a trailing slash", () => {
    expect(normaliseDomain("https://github.example.com")).toBe("github.example.com");
  });

  test("normaliseDomain preserves path segments after stripping protocol", () => {
    expect(normaliseDomain("https://github.example.com/api/v3")).toBe("github.example.com/api/v3");
  });

  test("constructBaseURL uses enterprise routing only for enterprise accounts", () => {
    const enterpriseAccount = {
      access_token: "ent-token",
      refresh_token: "ent-token",
      expires: 0,
      enterpriseUrl: "https://github.mycompany.com",
    };
    const personalAccount = {
      access_token: "per-token",
      refresh_token: "per-token",
      expires: 0,
      enterpriseUrl: "",
    };

    expect(constructBaseURL(personalAccount)).toBe("https://api.github.com");
    expect(constructBaseURL(enterpriseAccount)).toBe("https://copilot-api.github.mycompany.com");
  });
});

describe("createMultiCopilotProvider", () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  const mockAccount = {
    access_token: "test-token",
    refresh_token: "refresh-token",
    expires: 0,
    enterpriseUrl: "",
  };

  test("returns an object with .chatModel method", () => {
    const provider = createMultiCopilotProvider("gpt-4", mockAccount);
    expect(typeof provider.chatModel).toBe("function");
  });

  test("returns an object with .languageModel method", () => {
    const provider = createMultiCopilotProvider("gpt-4", mockAccount);
    expect(typeof provider.languageModel).toBe("function");
  });

  test("uses the correct baseURL from constructBaseURL", async () => {
    const enterpriseAccount = {
      ...mockAccount,
      enterpriseUrl: "https://github.example.com",
    };
    const provider = createMultiCopilotProvider("gpt-4", enterpriseAccount);
    const model = provider.chatModel("gpt-4");

    try {
      await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
      } as any);
    } catch (e) {
    }

    expect(fetchMock).toHaveBeenCalled();
    const call = fetchMock.mock.calls[0] as [string | URL | Request, RequestInit] | undefined;
    const url = call?.[0] instanceof Request ? call[0].url : call?.[0].toString();
    expect(typeof url).toBe("string");
    expect(url).toContain("https://copilot-api.github.example.com");
  });
});
