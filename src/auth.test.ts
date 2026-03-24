import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Auth } from "@opencode-ai/sdk";

const sleepMock = mock(async (_ms: number) => {});
const getTokenForAliasMock = mock(async () => ({
  access_token: "ghu_test",
  refresh_token: "ghu_test",
  expires: 0,
  enterpriseUrl: "",
}));
const resolveAccountForModelMock = mock(async () => ({
  alias: "work",
  account: {
    access_token: "ghu_test",
    refresh_token: "ghu_test",
    expires: 0,
    enterpriseUrl: "",
  },
}));
const setAccountMock = mock(async () => {});
const setDefaultAccountIfEmptyMock = mock(async () => {});
const readMirroringModeMock = mock(async (): Promise<"auto" | "skip"> => "skip");
const readMappingConfigMock = mock(async () => ({ default_account: "", model_mirroring: "skip" as const, mappings: {} as Record<string, string> }));
const fetchMock = mock(async (_input: unknown, _init?: RequestInit): Promise<Response> => {
  throw new Error("Unexpected fetch call");
});

mock.module("node:timers/promises", () => ({
  setTimeout: sleepMock,
}));

mock.module("./ledger.js", () => ({
  getTokenForAlias: getTokenForAliasMock,
  resolveAccountForModel: resolveAccountForModelMock,
  setAccount: setAccountMock,
  clearLedgerCache: mock(() => {}),
  loadLedger: mock(async () => ({})),
  saveLedger: mock(async () => {}),
  getAccount: mock(async () => undefined),
  removeAccount: mock(async () => {}),
  sanitiseLedger: mock(() => ({})),
  toJSON: mock(() => ({})),
}));

mock.module("./config.js", () => ({
  setDefaultAccountIfEmpty: setDefaultAccountIfEmptyMock,
  readMirroringMode: readMirroringModeMock,
  CONFIG_DIR: "/tmp/mock-config",
  MAPPING_PATH: "/tmp/mock-config/multi-copilot-mapping.json",
  AUTH_PATH: "/tmp/mock-config/multi-copilot-auth.json",
  clearMappingCache: mock(() => {}),
  ensureConfigDir: mock(async () => {}),
  ensureMappingConfig: mock(async () => {}),
  ensureAuthLedger: mock(async () => {}),
  readMappingConfig: readMappingConfigMock,
  writeCachedModelIds: mock(async () => {}),
  readCachedModelIds: mock(async () => []),
  resolveAliasForModel: mock(
    (_modelId: string, _aliases: string[], _mapping: any) => undefined
  ),
}));

globalThis.fetch = fetchMock as unknown as typeof fetch;

const { createAuthHook } = await import("./auth.js");

function createJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function createInput() {
  return {
    input: {
      client: {
        provider: {
          list: mock(async () => ({ data: { all: [] } })),
        },
      },
      project: {},
      directory: "/tmp/project",
      worktree: "/tmp/project",
      serverUrl: new URL("http://localhost:3000"),
      $: {},
    } as any,
  };
}

function createProvider() {
  return {
    id: "multi-copilot",
    name: "Multi Copilot",
    source: "config",
    env: [],
    options: {},
    models: {},
  } as any;
}

function createAuthInfo(enterpriseUrl = ""): () => Promise<Auth> {
  return async () => ({
    type: "oauth" as const,
    refresh: "ghu_auth_refresh",
    access: "ghu_auth_access",
    expires: 0,
    enterpriseUrl,
  });
}

beforeEach(() => {
  sleepMock.mockReset();
  sleepMock.mockImplementation(async (_ms: number) => {});
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_input: unknown, _init?: RequestInit): Promise<Response> => {
    throw new Error("Unexpected fetch call");
  });
  getTokenForAliasMock.mockReset();
  getTokenForAliasMock.mockImplementation(async () => ({
    access_token: "ghu_test",
    refresh_token: "ghu_test",
    expires: 0,
    enterpriseUrl: "",
  }));
  resolveAccountForModelMock.mockReset();
  resolveAccountForModelMock.mockImplementation(async () => ({
    alias: "work",
    account: {
      access_token: "ghu_test",
      refresh_token: "ghu_test",
      expires: 0,
      enterpriseUrl: "",
    },
  }));
  setAccountMock.mockReset();
  setAccountMock.mockImplementation(async () => {});
  setDefaultAccountIfEmptyMock.mockReset();
  setDefaultAccountIfEmptyMock.mockImplementation(async () => {});
  readMirroringModeMock.mockReset();
  readMirroringModeMock.mockImplementation(async (): Promise<"auto" | "skip"> => "skip");
  readMappingConfigMock.mockReset();
  readMappingConfigMock.mockImplementation(async () => ({ default_account: "", model_mirroring: "skip" as const, mappings: {} as Record<string, string> }));
});

describe("createAuthHook", () => {
  test("returns the expected auth hook structure and prompts", () => {
    const { input } = createInput();
    const hook = createAuthHook(input);

    expect(hook.provider).toBe("multi-copilot");
    expect(typeof hook.loader).toBe("function");
    expect(hook.methods).toHaveLength(1);

    const method = hook.methods[0];
    expect(method.type).toBe("oauth");
    expect(method.label).toBe("Authorise with GitHub");

    if (!method.prompts) {
      throw new Error("Expected prompts to be defined");
    }

    expect(method.prompts).toHaveLength(3);

    const [aliasPrompt, deploymentPrompt, enterprisePrompt] = method.prompts;

    if (aliasPrompt.type !== "text") {
      throw new Error("Expected alias prompt to be text");
    }
    expect(aliasPrompt.type).toBe("text");
    expect(aliasPrompt.key).toBe("alias");
    expect(aliasPrompt.validate?.("work")).toBeUndefined();
    expect(aliasPrompt.validate?.("my alias!")).toBe(
      "Invalid alias. Use only alphanumeric characters, hyphens, and underscores."
    );

    expect(deploymentPrompt.type).toBe("select");
    expect(deploymentPrompt.key).toBe("deploymentType");
    if (deploymentPrompt.type !== "select") {
      throw new Error("Expected deployment prompt to be a select");
    }
    expect(deploymentPrompt.options).toEqual([
      {
        label: "GitHub.com",
        value: "github.com",
        hint: "Public",
      },
      {
        label: "GitHub Enterprise",
        value: "enterprise",
        hint: "Data residency or self-hosted",
      },
    ]);

    if (enterprisePrompt.type !== "text") {
      throw new Error("Expected enterprise prompt to be text");
    }
    expect(enterprisePrompt.type).toBe("text");
    expect(enterprisePrompt.key).toBe("enterpriseUrl");
    expect(enterprisePrompt.condition?.({ deploymentType: "github.com" })).toBe(false);
    expect(enterprisePrompt.condition?.({ deploymentType: "enterprise" })).toBe(true);
  });

  test("authorize returns a device-flow object with the correct client id", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        createJsonResponse({
          device_code: "device-code-123",
          user_code: "ABCD-1234",
          verification_uri: "https://github.com/login/device",
          interval: 2,
        })
      )
    );

    const { input } = createInput();
    const hook = createAuthHook(input);
    const method = hook.methods[0];

    if (method.type !== "oauth") {
      throw new Error("Expected oauth method");
    }

    const result = await method.authorize({
      alias: "work",
      deploymentType: "github.com",
    });

    expect(result).toMatchObject({
      url: "https://github.com/login/device",
      instructions: "Enter code: ABCD-1234",
      method: "auto",
    });
    expect(typeof result.callback).toBe("function");

    const fetchCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    if (!fetchCall) {
      throw new Error("Expected device code request");
    }

    expect(fetchCall[0]).toBe("https://github.com/login/device/code");

    const init = fetchCall[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: "Ov23li8tweQw6odWQebz",
      scope: "read:user",
    });
  });

  test("callback polls until it receives an access token", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            device_code: "device-code-123",
            user_code: "ABCD-1234",
            verification_uri: "https://github.com/login/device",
            interval: 2,
          })
        )
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            error: "authorization_pending",
          })
        )
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            access_token: "ghu_callback_token",
          })
        )
      );

    const { input } = createInput();
    const hook = createAuthHook(input);
    const method = hook.methods[0];

    if (method.type !== "oauth") {
      throw new Error("Expected oauth method");
    }

    const authorisation = await method.authorize({ alias: "work" });
    if (authorisation.method !== "auto") {
      throw new Error("Expected auto authorisation flow");
    }
    const result = await authorisation.callback();

    expect(result).toEqual({
      type: "success",
      refresh: "ghu_callback_token",
      access: "ghu_callback_token",
      expires: 0,
    });
    expect(sleepMock).toHaveBeenCalledWith(5000);

    const pollCall = fetchMock.mock.calls[1] as unknown[] | undefined;
    if (!pollCall) {
      throw new Error("Expected polling request");
    }

    expect(pollCall[0]).toBe("https://github.com/login/oauth/access_token");

    const init = pollCall[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: "Ov23li8tweQw6odWQebz",
      device_code: "device-code-123",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
  });

  test("callback increases the polling interval after slow_down", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            device_code: "device-code-123",
            user_code: "ABCD-1234",
            verification_uri: "https://github.com/login/device",
            interval: 2,
          })
        )
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            error: "slow_down",
          })
        )
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            access_token: "ghu_callback_token",
          })
        )
      );

    const { input } = createInput();
    const hook = createAuthHook(input);
    const method = hook.methods[0];

    if (method.type !== "oauth") {
      throw new Error("Expected oauth method");
    }

    const authorisation = await method.authorize({ alias: "work" });
    if (authorisation.method !== "auto") {
      throw new Error("Expected auto authorisation flow");
    }
    const result = await authorisation.callback();

    expect(result).toEqual({
      type: "success",
      refresh: "ghu_callback_token",
      access: "ghu_callback_token",
      expires: 0,
    });
    expect(sleepMock).toHaveBeenCalledWith(10000);
  });

  test("callback returns failed on an unrecoverable oauth error", async () => {
    fetchMock
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            device_code: "device-code-123",
            user_code: "ABCD-1234",
            verification_uri: "https://github.com/login/device",
            interval: 2,
          })
        )
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          createJsonResponse({
            error: "expired_token",
          })
        )
      );

    const { input } = createInput();
    const hook = createAuthHook(input);
    const method = hook.methods[0];

    if (method.type !== "oauth") {
      throw new Error("Expected oauth method");
    }

    const authorisation = await method.authorize({ alias: "work" });
    if (authorisation.method !== "auto") {
      throw new Error("Expected auto authorisation flow");
    }
    const result = await authorisation.callback();

    expect(result).toEqual({
      type: "failed",
    });
  });

  test("loader mirrors github-copilot models when model_mirroring is auto", async () => {
    readMirroringModeMock.mockImplementation(async (): Promise<"auto" | "skip"> => "auto");

    const providerListResponse = createJsonResponse({
      all: [
        {
          id: "github-copilot",
          name: "GitHub Copilot",
          env: [],
          models: {
            "github-copilot/claude-sonnet-4": {
              id: "github-copilot/claude-sonnet-4",
              name: "Claude Sonnet 4",
              release_date: "2026-01-01",
              attachment: false,
              reasoning: true,
              temperature: true,
              tool_call: true,
              limit: {
                context: 200000,
                output: 32000,
              },
              options: {},
            },
          },
        },
      ],
    });

    fetchMock
      .mockImplementationOnce(() => Promise.resolve(providerListResponse))
      .mockImplementationOnce(() => Promise.resolve(createJsonResponse({ ok: true })));

    const { input } = createInput();
    const hook = createAuthHook(input);
    const provider = createProvider();

    const loaded = await hook.loader?.(createAuthInfo(), provider);

    expect(loaded).toMatchObject({
      baseURL: "https://api.githubcopilot.com",
      apiKey: "copilot",
    });
    expect(typeof loaded?.fetch).toBe("function");

    expect(provider.models["claude-sonnet-4"]).toMatchObject({
      id: "claude-sonnet-4",
      name: "Claude Sonnet 4",
    });

    const providerCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    if (!providerCall) {
      throw new Error("Expected /provider fetch call");
    }
    expect(String(providerCall[0])).toBe("http://localhost:3000/provider");

    await loaded?.fetch?.("https://api.github.com/chat/completions", {
      method: "POST",
      headers: {
        "x-api-key": "remove-me",
      },
      body: JSON.stringify({
        model: "multi-copilot/claude-sonnet-4",
      }),
    });

    expect(resolveAccountForModelMock).toHaveBeenCalledWith("claude-sonnet-4");
    expect(getTokenForAliasMock).toHaveBeenCalledWith("work");

    const fetchCall = fetchMock.mock.calls[1] as unknown[] | undefined;
    if (!fetchCall) {
      throw new Error("Expected wrapped fetch call");
    }

    const init = fetchCall[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers.Authorization).toBe("Bearer ghu_test");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  test("loader skips model mirroring when model_mirroring is skip with no mappings", async () => {
    readMirroringModeMock.mockImplementation(async (): Promise<"auto" | "skip"> => "skip");
    readMappingConfigMock.mockImplementation(async () => ({
      default_account: "",
      model_mirroring: "skip" as const,
      mappings: {} as Record<string, string>,
    }));

    const { input } = createInput();
    const hook = createAuthHook(input);
    const provider = createProvider();

    const loaded = await hook.loader?.(createAuthInfo(), provider);

    expect(loaded).toMatchObject({
      baseURL: "https://api.githubcopilot.com",
      apiKey: "copilot",
    });
    expect(Object.keys(provider.models)).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("loader does not mutate provider models when model_mirroring is skip", async () => {
    readMirroringModeMock.mockImplementation(async (): Promise<"auto" | "skip"> => "skip");
    readMappingConfigMock.mockImplementation(async () => ({
      default_account: "work",
      model_mirroring: "skip" as const,
      mappings: {
        "github-copilot/claude-sonnet-4": "work",
        "github-copilot/gpt-4o": "personal",
      } as Record<string, string>,
    }));

    const { input } = createInput();
    const hook = createAuthHook(input);
    const provider = createProvider();

    const loaded = await hook.loader?.(createAuthInfo(), provider);

    expect(loaded).toMatchObject({
      baseURL: "https://api.githubcopilot.com",
      apiKey: "copilot",
    });

    expect(fetchMock).not.toHaveBeenCalled();

    expect(Object.keys(provider.models)).toHaveLength(0);
  });

  test("loader returns an enterprise base url when enterprise auth is active", async () => {
    const { input } = createInput();
    const hook = createAuthHook(input);
    const provider = createProvider();

    const loaded = await hook.loader?.(createAuthInfo("https://github.example.com/"), provider);

    expect(loaded).toMatchObject({
      baseURL: "https://copilot-api.github.example.com",
      apiKey: "copilot",
    });
  });
});
