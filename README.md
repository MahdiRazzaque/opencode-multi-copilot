# Opencode Multi-Copilot

`opencode-multi-copilot` is an OpenCode plugin that registers a `multi-copilot` provider for routing requests across multiple GitHub Copilot accounts.

The plugin maintains a local ledger of authenticated account aliases, resolves each requested model against a routing file, and forwards requests to either the public Copilot API or a GitHub Enterprise Copilot host.

Additional project documentation lives in `docs/README.md`.

## Capabilities

- Registers a new OpenCode provider named `multi-copilot`
- Supports multiple authenticated GitHub Copilot aliases on the same machine
- Stores authentication state in `~/.config/opencode/multi-copilot-auth.json`
- Seeds and reloads routing rules from `~/.config/opencode/multi-copilot-mapping.json`
- Resolves requests by requested model ID and configured alias mapping
- Falls back to `default_account` or the first authenticated alias when a model is not mapped
- Supports GitHub Enterprise device authorisation and request routing
- Optionally mirrors the native `github-copilot` model catalogue when `model_mirroring` is set to `auto`

## Requirements

- Bun 1.x
- OpenCode with plugin support
- One or more GitHub Copilot accounts

## Installation

```bash
git clone https://github.com/MahdiRazzaque/opencode-multi-copilot.git
cd opencode-multi-copilot
bun install
bun run build
```

Register the built plugin with OpenCode using one of the following approaches.

### Absolute path in OpenCode config

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/opencode-multi-copilot/dist/index.js"]
}
```

### Copy into the plugins directory

```bash
cp dist/index.js ~/.config/opencode/plugins/opencode-multi-copilot.js
```

### Symlink into the plugins directory

```bash
ln -s "$(pwd)/dist/index.js" ~/.config/opencode/plugins/opencode-multi-copilot.js
```

The `multi-copilot` provider exposes model IDs without the `github-copilot/` prefix, so a mapping entry such as `github-copilot/claude-opus-4.6` is selected in OpenCode as `multi-copilot/claude-opus-4.6`.

## First-time authorisation

Authenticate each alias with:

```bash
opencode auth login --provider multi-copilot
```

The auth flow prompts for:

1. An alias such as `work` or `personal`
2. A deployment type: `GitHub.com` or `GitHub Enterprise`
3. An enterprise URL or domain when enterprise mode is selected

Aliases must satisfy:

```text
/^[a-zA-Z0-9_-]+$/
```

Invalid aliases return:

```text
Invalid alias. Use only alphanumeric characters, hyphens, and underscores.
```

## Routing configuration

If the mapping file does not exist, the plugin creates `~/.config/opencode/multi-copilot-mapping.json` with this default shape:

```json
{
  "default_account": "",
  "model_mirroring": "skip",
  "mappings": {}
}
```

Example populated configuration:

```json
{
  "default_account": "personal",
  "model_mirroring": "auto",
  "mappings": {
    "github-copilot/claude-opus-4.6": "work",
    "github-copilot/gpt-5": "personal"
  }
}
```

Rules:

- `mappings` keys must use the `github-copilot/[model-name]` format
- `default_account` is used when a model is not explicitly mapped
- if `default_account` is empty, the first authenticated alias is used
- routing changes are picked up on subsequent requests without restarting OpenCode
- `model_mirroring` accepts `skip` or `auto`

## Runtime behaviour

When OpenCode sends a request through `multi-copilot`, the plugin:

1. Extracts the requested model from the JSON request body
2. Resolves the target alias from the routing file
3. Loads the account record from the local auth ledger
4. Rewrites the base URL for GitHub Enterprise accounts when required
5. Adds request headers such as `Authorization`, `x-initiator`, `User-Agent`, and `Openai-Intent`
6. Adds `Copilot-Vision-Request: true` when image input is detected

If a mapped alias has not been authenticated, the plugin fails fast and instructs the user to run `opencode auth multi-copilot`.

## GitHub Enterprise support

For enterprise accounts, the plugin uses:

- `https://<enterprise-host>/login/device/code`
- `https://<enterprise-host>/login/oauth/access_token`
- `https://copilot-api.<enterprise-host>`

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

## Implementation notes

- Auth state is written with `0600` permissions where supported
- Mapping reads are cached by file modification time to minimise repeat I/O
- The current implementation stores the device-flow token as both `access_token` and `refresh_token`
- The current implementation resolves and injects stored tokens, but does not yet implement a separate refresh-token exchange flow
