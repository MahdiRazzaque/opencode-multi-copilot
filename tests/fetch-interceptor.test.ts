import { describe, expect, mock, test } from "bun:test";

import { createInterceptingFetch } from "../src/plugin/fetch-interceptor.js";

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  return input instanceof Request ? input : new Request(input, init);
}

describe("createInterceptingFetch", () => {
  test("injects the routed account token and rewrites enterprise Copilot URLs", async () => {
    const downstreamFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = toRequest(input, init);

      expect(request.url).toBe("https://copilot-api.github.example.com/copilot_internal/v2/chat/completions");
      expect(request.headers.get("authorization")).toBe("Bearer work-token");

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const fetchWithRouting = createInterceptingFetch({
      baseUrlStrategy: {
        resolveApiUrl: (account, originalUrl) =>
          new URL(originalUrl.replace("https://api.github.com", `https://copilot-api.${account.enterpriseUrl}`)),
      },
      downstreamFetch,
      mappingStore: {
        load: async () => ({
          defaultAccount: null,
          mappings: { "claude-opus-4.6": "work" },
        }),
      },
      tokenService: {
        forceRefresh: async () => ({
          accessToken: "fresh-work-token",
          alias: "work",
          enterpriseUrl: "github.example.com",
        }),
        getAccountCredentials: async () => ({
          accessToken: "work-token",
          alias: "work",
          enterpriseUrl: "github.example.com",
        }),
        listAuthenticatedAliases: async () => ["work"],
      },
    });

    await fetchWithRouting("https://api.github.com/copilot_internal/v2/chat/completions", {
      body: JSON.stringify({ messages: [{ content: "Hi", role: "user" }], model: "claude-opus-4.6" }),
      method: "POST",
    });

    expect(downstreamFetch).toHaveBeenCalledTimes(1);
  });

  test("refreshes and retries once after a 401 response", async () => {
    const downstreamFetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const authorisation = toRequest(input, init).headers.get("authorization");

        if (authorisation === "Bearer stale-token") {
          return new Response("stale", { status: 401 });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    );

    const forceRefresh = mock(async () => ({
      accessToken: "fresh-token",
      alias: "work",
      enterpriseUrl: null,
    }));
    const fetchWithRouting = createInterceptingFetch({
      baseUrlStrategy: {
        resolveApiUrl: (_account, originalUrl) => new URL(originalUrl),
      },
      downstreamFetch,
      mappingStore: {
        load: async () => ({
          defaultAccount: "work",
          mappings: {},
        }),
      },
      tokenService: {
        forceRefresh,
        getAccountCredentials: async () => ({
          accessToken: "stale-token",
          alias: "work",
          enterpriseUrl: null,
        }),
        listAuthenticatedAliases: async () => ["work"],
      },
    });

    const response = await fetchWithRouting("https://api.github.com/copilot_internal/v2/chat/completions", {
      body: JSON.stringify({ messages: [{ content: "Hi", role: "user" }], model: "claude-opus-4.6" }),
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(forceRefresh).toHaveBeenCalledTimes(1);
    expect(downstreamFetch).toHaveBeenCalledTimes(2);
  });

  test("preserves a Request object's method and body on first call and retry", async () => {
    const seen: Array<{ body: string; method: string }> = [];
    const downstreamFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      seen.push({
        body: await request.clone().text(),
        method: request.method,
      });

      const authorisation = request.headers.get("authorization");
      if (authorisation === "Bearer stale-token") {
        return new Response("stale", { status: 401 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const request = new Request("https://api.github.com/copilot_internal/v2/chat/completions", {
      body: JSON.stringify({ messages: [{ content: "Hi", role: "user" }], model: "claude-opus-4.6" }),
      method: "POST",
    });
    const fetchWithRouting = createInterceptingFetch({
      baseUrlStrategy: {
        resolveApiUrl: (_account, originalUrl) => new URL(originalUrl),
      },
      downstreamFetch,
      mappingStore: {
        load: async () => ({
          defaultAccount: "work",
          mappings: {},
        }),
      },
      tokenService: {
        forceRefresh: async () => ({
          accessToken: "fresh-token",
          alias: "work",
          enterpriseUrl: null,
        }),
        getAccountCredentials: async () => ({
          accessToken: "stale-token",
          alias: "work",
          enterpriseUrl: null,
        }),
        listAuthenticatedAliases: async () => ["work"],
      },
    });

    const response = await fetchWithRouting(request);

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      {
        body: JSON.stringify({ messages: [{ content: "Hi", role: "user" }], model: "claude-opus-4.6" }),
        method: "POST",
      },
      {
        body: JSON.stringify({ messages: [{ content: "Hi", role: "user" }], model: "claude-opus-4.6" }),
        method: "POST",
      },
    ]);
  });
});
