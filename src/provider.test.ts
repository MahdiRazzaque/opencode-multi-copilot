import { beforeEach, describe, expect, mock, test } from "bun:test";

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
  detectAgent,
  detectVision,
  normaliseDomain,
} = await import("./provider.js");

describe("provider helpers", () => {
  beforeEach(() => {
    fetchMock.mockClear();
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

    expect(constructBaseURL(personalAccount)).toBe("https://api.githubcopilot.com");
    expect(constructBaseURL(enterpriseAccount)).toBe("https://copilot-api.github.mycompany.com");
  });
});
