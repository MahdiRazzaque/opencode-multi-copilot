# Installation and Setup

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Bun 1.x | Required for install, build, and test commands |
| OpenCode with plugin support | Required to load the built plugin |
| GitHub Copilot account | At least one account is required |
| Optional GitHub Enterprise host | Required only for enterprise routing |

## Install the project locally

```bash
git clone https://github.com/MahdiRazzaque/opencode-multi-copilot.git
cd opencode-multi-copilot
bun install
bun run build
```

The build output is written to `dist/index.js`.

## Register the plugin with OpenCode

### Option 1: Absolute path in `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/opencode-multi-copilot/dist/index.js"]
}
```

### Option 2: Copy into the OpenCode plugins directory

```bash
cp dist/index.js ~/.config/opencode/plugins/opencode-multi-copilot.js
```

### Option 3: Symlink into the OpenCode plugins directory

```bash
ln -s "$(pwd)/dist/index.js" ~/.config/opencode/plugins/opencode-multi-copilot.js
```

This option avoids repeated copy operations after each rebuild.

## Authorise the first account

Run:

```bash
opencode auth login --provider multi-copilot
```

The plugin prompts for:

| Prompt key | Type | Required | Behaviour |
| --- | --- | --- | --- |
| `alias` | Text | Yes | Must match `^[a-zA-Z0-9_-]+$` |
| `deploymentType` | Select | Yes | Accepts `github.com` or `enterprise` |
| `enterpriseUrl` | Text | Conditionally | Required only when `deploymentType` is `enterprise` |

## Device authorisation flow

When authorisation starts, the plugin:

1. Requests a device code from GitHub or GitHub Enterprise
2. Returns a verification URL and user code to OpenCode
3. Polls the access token endpoint until authorisation completes or fails
4. Stores the resulting token data under the chosen alias
5. Sets `default_account` if it is currently empty

## Resulting local files

| File | Created by | Purpose |
| --- | --- | --- |
| `~/.config/opencode/multi-copilot-mapping.json` | Startup initialisation | Stores routing and model mirroring settings |
| `~/.config/opencode/multi-copilot-auth.json` | Startup initialisation and auth flow | Stores per-alias account records |
| `~/.config/opencode/multi-copilot-models-cache.json` | Model mirroring | Stores mirrored model IDs discovered from OpenCode |

## Minimum verification checklist

- `bun run build` succeeds
- OpenCode loads the plugin without error
- `opencode auth multi-copilot` prompts for alias and deployment type
- `~/.config/opencode/multi-copilot-auth.json` contains the newly created alias
