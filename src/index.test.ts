import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockEnsureMappingConfig = mock(async () => {});
const mockEnsureAuthLedger = mock(async () => {});
const mockCreateAuthHook = mock((input: any) => ({
  provider: "multi-copilot",
  loader: async (_auth: any, provider: any) => {
    const list = await input.client.provider.list();
    const githubCopilot = list.data?.all?.find((item: any) => item.id === "github-copilot");

    if (githubCopilot?.models) {
      for (const [modelId, modelInfo] of Object.entries(githubCopilot.models as Record<string, any>)) {
        provider.models[modelId] = {
          ...modelInfo,
          cost: 0,
        };
      }
    }

    return {
      baseURL: "https://api.github.com",
      apiKey: "copilot",
      fetch: globalThis.fetch,
    };
  },
  methods: [
    {
      type: "oauth",
      label: "Sign in with GitHub Copilot",
      prompts: [],
      authorize: async () => ({}),
    },
  ],
}));

mock.module("./config.js", () => ({
  ensureMappingConfig: mockEnsureMappingConfig,
  ensureAuthLedger: mockEnsureAuthLedger,
  CONFIG_DIR: "/tmp/mock-config",
  MAPPING_PATH: "/tmp/mock-config/multi-copilot-mapping.json",
  AUTH_PATH: "/tmp/mock-config/multi-copilot-auth.json",
  clearMappingCache: mock(() => {}),
  ensureConfigDir: mock(async () => {}),
  readMappingConfig: mock(async () => ({ default_account: "", model_mirroring: "skip", mappings: {} })),
  resolveAliasForModel: mock(
    (_modelId: string, _aliases: string[], _mapping: any) => undefined
  ),
  setDefaultAccountIfEmpty: mock(async () => {}),
  readMirroringMode: mock(async () => "skip"),
  writeCachedModelIds: mock(async () => {}),
  readCachedModelIds: mock(async () => []),
}));

mock.module("./auth.js", () => ({
  createAuthHook: mockCreateAuthHook,
  GITHUB_DEVICE_CODE_URL: "https://github.com/login/device/code",
  GITHUB_ACCESS_TOKEN_URL: "https://github.com/login/oauth/access_token",
  COPILOT_CLIENT_ID: "Ov23li8tweQw6odWQebz",
}));

const { default: MultiCopilotPlugin } = await import("./index.js");

function createInput(providerListResponse?: { data?: { all: any[] } }) {
  const providerListMock = mock(async () =>
    providerListResponse ?? {
      data: {
        all: [],
      },
    }
  );

  return {
    input: {
      client: {
        provider: {
          list: providerListMock,
        },
      },
      project: {},
      directory: "/tmp/project",
      worktree: "/tmp/project",
      serverUrl: new URL("http://localhost:3000"),
      $: {},
    } as any,
    providerListMock,
  };
}

function createConfig(provider?: Record<string, any>) {
  return {
    provider,
  } as any;
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

beforeEach(() => {
  mockEnsureMappingConfig.mockReset();
  mockEnsureMappingConfig.mockImplementation(async () => {});
  mockEnsureAuthLedger.mockReset();
  mockEnsureAuthLedger.mockImplementation(async () => {});
  mockCreateAuthHook.mockReset();
  mockCreateAuthHook.mockImplementation((input: any) => ({
    provider: "multi-copilot",
    loader: async (_auth: any, provider: any) => {
      const list = await input.client.provider.list();
      const githubCopilot = list.data?.all?.find((item: any) => item.id === "github-copilot");

      if (githubCopilot?.models) {
        for (const [modelId, modelInfo] of Object.entries(githubCopilot.models as Record<string, any>)) {
          provider.models[modelId] = {
            ...modelInfo,
            cost: 0,
          };
        }
      }

      return {
        baseURL: "https://api.github.com",
        apiKey: "copilot",
        fetch: globalThis.fetch,
      };
    },
    methods: [
      {
        type: "oauth",
        label: "Sign in with GitHub Copilot",
        prompts: [],
        authorize: async () => ({}),
      },
    ],
  }));
});

describe("MultiCopilotPlugin", () => {
  test("default export is a function", () => {
    expect(typeof MultiCopilotPlugin).toBe("function");
  });

  test("calling plugin returns hooks with both config and auth properties", async () => {
    const { input } = createInput();

    const hooks = await MultiCopilotPlugin(input);

    expect(hooks).toHaveProperty("config");
    expect(hooks).toHaveProperty("auth");
    expect(typeof hooks.config).toBe("function");
    expect(hooks.auth).toBeDefined();
  });

  test("config hook sets config.provider.multi-copilot with the expected provider config", async () => {
    const { input } = createInput();
    const hooks = await MultiCopilotPlugin(input);
    const config = createConfig({});

    if (!hooks.config) {
      throw new Error("Expected config hook to be defined");
    }

    await hooks.config(config);

    expect(config.provider["multi-copilot"]).toEqual({
      name: "Multi Copilot",
      env: [],
      models: {},
    });
  });

  test("config hook creates config.provider if undefined", async () => {
    const { input } = createInput();
    const hooks = await MultiCopilotPlugin(input);
    const config = createConfig();

    if (!hooks.config) {
      throw new Error("Expected config hook to be defined");
    }

    await hooks.config(config);

    expect(config.provider).toEqual({
      "multi-copilot": {
        name: "Multi Copilot",
        env: [],
        models: {},
      },
    });
  });

  test("config hook is pure and does not trigger init I/O", async () => {
    const { input } = createInput();
    const hooks = await MultiCopilotPlugin(input);
    const config = createConfig({ existing: { name: "Existing", env: [] } });

    mockEnsureMappingConfig.mockClear();
    mockEnsureAuthLedger.mockClear();
    mockCreateAuthHook.mockClear();

    if (!hooks.config) {
      throw new Error("Expected config hook to be defined");
    }

    await hooks.config(config);

    expect(mockEnsureMappingConfig).not.toHaveBeenCalled();
    expect(mockEnsureAuthLedger).not.toHaveBeenCalled();
    expect(mockCreateAuthHook).not.toHaveBeenCalled();
    expect(config.provider.existing).toEqual({ name: "Existing", env: [] });
  });

  test("auth.provider is multi-copilot", async () => {
    const { input } = createInput();
    const hooks = await MultiCopilotPlugin(input);

    expect(hooks.auth?.provider).toBe("multi-copilot");
  });

  test("ensureMappingConfig is called during init", async () => {
    const { input } = createInput();

    await MultiCopilotPlugin(input);

    expect(mockEnsureMappingConfig).toHaveBeenCalledTimes(1);
  });

  test("ensureAuthLedger is called during init", async () => {
    const { input } = createInput();

    await MultiCopilotPlugin(input);

    expect(mockEnsureAuthLedger).toHaveBeenCalledTimes(1);
  });

  test("createAuthHook is called with the plugin input", async () => {
    const { input } = createInput();

    await MultiCopilotPlugin(input);

    expect(mockCreateAuthHook).toHaveBeenCalledWith(input);
  });

  test("auth loader mirrors models from github-copilot into provider.models", async () => {
    const { input } = createInput({
      data: {
        all: [
          {
            id: "github-copilot",
            models: {
              "github-copilot/gpt-4o": {
                id: "github-copilot/gpt-4o",
                name: "GPT-4o",
                cost: {
                  input: 1,
                  output: 2,
                },
              },
            },
          },
        ],
      },
    });
    const hooks = await MultiCopilotPlugin(input);
    const provider = createProvider();

    if (!hooks.auth?.loader) {
      throw new Error("Expected auth loader to be defined");
    }

    await hooks.auth.loader(async () => ({ type: "oauth" } as any), provider);

    expect(provider.models).toEqual({
      "github-copilot/gpt-4o": {
        id: "github-copilot/gpt-4o",
        name: "GPT-4o",
        cost: 0,
      },
    });
  });

  test("empty github-copilot model list does not crash", async () => {
    const { input } = createInput({
      data: {
        all: [
          {
            id: "github-copilot",
            models: {},
          },
        ],
      },
    });
    const hooks = await MultiCopilotPlugin(input);
    const provider = createProvider();

    if (!hooks.auth?.loader) {
      throw new Error("Expected auth loader to be defined");
    }

    const result = await hooks.auth.loader(async () => ({ type: "oauth" } as any), provider);

    expect(result).toEqual({
      baseURL: "https://api.github.com",
      apiKey: "copilot",
      fetch: globalThis.fetch,
    });
    expect(provider.models).toEqual({});
  });

  test("loader returns baseURL, apiKey, and fetch", async () => {
    const { input } = createInput();
    const hooks = await MultiCopilotPlugin(input);
    const provider = createProvider();

    if (!hooks.auth?.loader) {
      throw new Error("Expected auth loader to be defined");
    }

    const result = await hooks.auth.loader(async () => ({ type: "oauth" } as any), provider);

    expect(result).toEqual({
      baseURL: "https://api.github.com",
      apiKey: "copilot",
      fetch: globalThis.fetch,
    });
  });
});
