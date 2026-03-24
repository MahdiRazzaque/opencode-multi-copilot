# Interface Reference

## Scope

This project does not expose an HTTP API. Its public interfaces are OpenCode plugin hooks, prompt contracts, local configuration files, and exported helper functions that define externally visible behaviour.

## Plugin entry point

### `default export async function MultiCopilotPlugin(input: PluginInput): Promise<Hooks>`

Defined in `src/index.ts`.

#### Purpose

Bootstraps local config files and returns the hooks consumed by OpenCode.

#### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `input` | `PluginInput` | OpenCode plugin context including `serverUrl` |

#### Returns

| Property | Type | Description |
| --- | --- | --- |
| `config` | `(config: Config) => Promise<void>` | Registers `multi-copilot` provider metadata |
| `auth` | `AuthHook` | Supplies the provider auth implementation |

#### Side effects

- Ensures the mapping file exists
- Ensures the auth ledger exists

## Auth hook

### `createAuthHook(input: PluginInput): AuthHook`

Defined in `src/auth.ts`.

#### Returned hook shape

| Property | Value |
| --- | --- |
| `provider` | `multi-copilot` |
| `methods[0].type` | `oauth` |
| `methods[0].label` | `Authorise with GitHub` |

### Auth method prompts

| Key | Prompt type | Validation or condition |
| --- | --- | --- |
| `alias` | `text` | `validateAlias()` using `AliasSchema` |
| `deploymentType` | `select` | Options: `github.com`, `enterprise` |
| `enterpriseUrl` | `text` | Required only when `deploymentType === "enterprise"` |

### `authorize(inputs): Promise<AuthOuathResult>`

#### Inputs

| Input key | Type | Description |
| --- | --- | --- |
| `alias` | `string` | Account alias for storage and routing |
| `deploymentType` | `string` | Public or enterprise GitHub selection |
| `enterpriseUrl` | `string` | Enterprise hostname or URL when applicable |

#### Success behaviour

Returns an auto-driven device flow object containing:

| Field | Description |
| --- | --- |
| `url` | Verification URL provided by GitHub |
| `instructions` | Device code prompt shown to the user |
| `method` | Always `auto` |
| `callback` | Polling function that completes the device flow |

#### Callback success shape

| Field | Type |
| --- | --- |
| `type` | `success` |
| `refresh` | `string` |
| `access` | `string` |
| `expires` | `number` |
| `enterpriseUrl` | `string` when enterprise mode is active |

#### Callback failure shape

| Field | Type |
| --- | --- |
| `type` | `failed` |

## Loader contract

### `loader(auth, provider)`

The loader optionally mirrors models and returns the fetch configuration that OpenCode uses for provider requests.

#### Returned object

| Field | Type | Description |
| --- | --- | --- |
| `baseURL` | `string` | Copilot API base URL resolved from the authenticated account |
| `apiKey` | `string` | Static placeholder value `copilot` |
| `fetch` | `function` | Wrapped fetch that resolves aliases and injects headers |

## Configuration helpers

### `ensureMappingConfig(): Promise<void>`

Creates `multi-copilot-mapping.json` if it does not already exist.

### `ensureAuthLedger(): Promise<void>`

Creates `multi-copilot-auth.json` if it does not already exist and applies secure permissions.

### `readMappingConfig(): Promise<MappingConfig>`

Reads and validates the mapping file. Throws if the JSON is invalid or the schema does not match.

### `resolveAliasForModel(modelId, authAliases, mapping): string | undefined`

Resolves a model to an alias based on explicit mapping, then `default_account` when it is non-empty, then the first authenticated alias.

## Ledger helpers

### `getTokenForAlias(alias): Promise<AccountData>`

Returns the stored account record for a specific alias.

#### Error behaviour

Throws:

```text
No authentication found for alias '<alias>'. Run 'opencode auth multi-copilot' to authenticate this account.
```

### `resolveAccountForModel(modelId): Promise<{ alias: string; account: AccountData }>`

Returns the resolved alias and corresponding account for a model request.

#### Error behaviour

Throws:

```text
No accounts authenticated. Run 'opencode auth multi-copilot' to set up your first account.
```

### `sanitiseLedger(ledger): Record<string, unknown>`

Returns a redacted representation of the ledger with both token fields replaced by `[REDACTED]`.

## Provider helpers

| Function | Signature | Behaviour |
| --- | --- | --- |
| `normaliseDomain` | `(url: string) => string` | Removes protocol and trailing slash |
| `constructBaseURL` | `(account) => string` | Chooses public or enterprise Copilot base URL |
| `detectVision` | `(body: unknown, url?: string) => boolean` | Detects image-bearing requests |
| `detectAgent` | `(body: unknown, url?: string) => boolean` | Detects agent-originated requests |

## Schema reference

### Alias pattern

```text
^[a-zA-Z0-9_-]+$
```

### Mapping schema summary

```ts
{
  default_account: string;
  model_mirroring?: "auto" | "skip";
  mappings: Record<`github-copilot/${string}`, string>;
}
```

`default_account` is required in the JSON shape, but it may be an empty string. An empty value means no explicit default alias is configured, so the plugin falls back to the first authenticated alias.

### Account schema summary

```ts
{
  access_token: string;
  refresh_token: string;
  expires: number;
  enterpriseUrl?: string;
}
```
