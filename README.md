# Opencode Multi-Copilot

`opencode-multi-copilot` is an OpenCode plugin that adds a `multi-copilot` provider for routing requests across multiple GitHub Copilot accounts.

It keeps more than one Copilot account authenticated at the same time, maps model IDs to account aliases, reloads routing changes without restarting OpenCode, and refreshes tokens when GitHub rotates them.

## What it does

- Registers a new OpenCode provider called `multi-copilot`
- Authenticates multiple GitHub Copilot accounts with the GitHub Device Code flow
- Stores account tokens in `~/.config/opencode/multi-copilot-auth.json`
- Seeds and reloads routing rules from `~/.config/opencode/multi-copilot-mapping.json`
- Routes requests by requested model ID
- Falls back to `default_account` or the first authenticated alias when a model is not mapped
- Supports GitHub Enterprise hostnames and rewrites requests to `copilot-api.<enterprise-domain>` when needed

## Requirements

- Bun 1.x
- OpenCode with plugin support
- One or more GitHub Copilot accounts

## Installation

### Option 1: Install as an npm plugin

When this package is published, add it to your OpenCode config. OpenCode installs npm plugins through Bun at startup.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-multi-copilot"]
}
```

### Option 2: Install locally from source

Clone this repository, install dependencies, and build it:

```bash
bun install
bun run build
```

OpenCode also supports local plugins from these directories:

- `.opencode/plugins/`
- `~/.config/opencode/plugins/`

Files in those directories are auto-loaded. If you load the plugin from local files and it needs external dependencies, keep a `package.json` alongside your OpenCode config so OpenCode can install them with Bun.

## OpenCode configuration

OpenCode merges config from `~/.config/opencode/opencode.json` and your project `opencode.json`, with the project config taking precedence.

Add the plugin and optionally set the default model to the new provider:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-multi-copilot"],
  "model": "multi-copilot/claude-opus-4.6"
}
```

`multi-copilot` uses the GitHub Copilot model catalogue, so model IDs should match the GitHub Copilot models available in your OpenCode installation.

## First-time setup

Authenticate each account alias you want to use:

```bash
opencode auth multi-copilot
```

During authentication the plugin will:

1. Ask for an alias such as `work` or `personal`
2. Optionally ask for a GitHub Enterprise hostname
3. Start the GitHub Device Code flow
4. Persist the resulting token set to `~/.config/opencode/multi-copilot-auth.json`

Aliases must match this rule:

```text
/^[a-zA-Z0-9_-]+$/
```

Invalid aliases return this validation message:

```text
Invalid alias. Use only alphanumeric characters, hyphens, and underscores.
```

## Routing configuration

The plugin seeds `~/.config/opencode/multi-copilot-mapping.json` if it does not exist.

Example:

```json
{
  "default_account": "personal",
  "mappings": {
    "claude-opus-4.6": "work",
    "gpt-5": "personal"
  }
}
```

Rules:

- `mappings` routes specific model IDs to account aliases
- `default_account` is used when a model is not mapped
- if `default_account` is unset, the first authenticated alias is used
- mapping changes are reloaded on each intercepted request, so you do not need to restart OpenCode

## How to use it

1. Install and enable the plugin
2. Run `opencode auth multi-copilot` once per alias
3. Update `~/.config/opencode/multi-copilot-mapping.json`
4. Choose a `multi-copilot/...` model in OpenCode
5. Use OpenCode normally

When a request is sent, the plugin reads the request body, extracts the requested model, resolves the correct alias, loads or refreshes the token, and injects the matching `Authorization: Bearer ...` header before forwarding the request.

If a model points to an alias that has not been authenticated, the plugin fails fast with guidance to run:

```bash
opencode auth multi-copilot
```

## GitHub Enterprise support

If an account is authenticated against GitHub Enterprise, the plugin uses these OAuth endpoints:

- `https://<enterprise-host>/login/device/code`
- `https://<enterprise-host>/login/oauth/access_token`

Copilot API requests for that account are routed to:

- `https://copilot-api.<enterprise-host>`

## Development

Install dependencies:

```bash
bun install
```

Run the test suite:

```bash
bun test
```

Run the typecheck:

```bash
bun run typecheck
```

Build the plugin:

```bash
bun run build
```

## Notes

- Auth state is written with owner-only permissions where the platform supports `0600`
- Token refresh uses the stored refresh token and fails explicitly if the token is expired or revoked
- You can override the GitHub OAuth client ID with `MULTI_COPILOT_GITHUB_CLIENT_ID` if you need to test against a different OAuth application
