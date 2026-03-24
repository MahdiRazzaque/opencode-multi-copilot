# Authentication and Routing

## Authentication flow

The plugin exposes a single auth method of type `oauth` under the `multi-copilot` provider.

### Prompt sequence

| Step | Prompt key | Behaviour |
| --- | --- | --- |
| 1 | `alias` | Free-text alias validated against `AliasSchema` |
| 2 | `deploymentType` | Select between `github.com` and `enterprise` |
| 3 | `enterpriseUrl` | Requested only when enterprise mode is selected |

### OAuth endpoints

| Deployment type | Device code URL | Access token URL |
| --- | --- | --- |
| GitHub.com | `https://github.com/login/device/code` | `https://github.com/login/oauth/access_token` |
| GitHub Enterprise | `https://<enterprise-host>/login/device/code` | `https://<enterprise-host>/login/oauth/access_token` |

### Polling behaviour

The callback returned by `authorize()` polls for the access token until one of the following happens:

- An access token is returned and stored
- GitHub returns `authorization_pending`, in which case the plugin waits `interval + 3000ms`
- GitHub returns `slow_down`, in which case the plugin increases the wait interval before retrying
- GitHub returns a non-recoverable error, in which case OpenCode receives `{ type: "failed" }`

## Routing behaviour

### Request model extraction

The wrapped fetch implementation attempts to parse the JSON request body and read `model`. It accepts either of these incoming forms:

- `multi-copilot/[model]`
- `github-copilot/[model]`

The prefix is stripped before alias resolution.

### Alias resolution logic

| Priority | Source |
| --- | --- |
| 1 | Explicit mapping in `mappings` |
| 2 | `default_account` |
| 3 | First alias present in the auth ledger |

### Base URL selection

| Account type | Base URL |
| --- | --- |
| Personal GitHub Copilot | `https://api.githubcopilot.com` |
| GitHub Enterprise Copilot | `https://copilot-api.<enterprise-host>` |

### Header injection

For forwarded requests, the wrapper sets or adjusts these headers:

| Header | Behaviour |
| --- | --- |
| `Authorization` | Set to `Bearer <refresh_token or access_token>` |
| `User-Agent` | Set to `opencode-multi-copilot` |
| `Openai-Intent` | Set to `conversation-edits` |
| `x-initiator` | Set to `agent` or `user` based on payload analysis |
| `Copilot-Vision-Request` | Added only when image content is detected |

The wrapper removes lowercase `authorization` and `x-api-key` entries before sending the request.

## Agent and vision detection

`src/provider.ts` contains helper logic for distinguishing payload types.

### Vision detection

Vision mode is enabled when one of the following content types is present:

- `image_url` in chat completions payloads
- `input_image` in responses payloads
- `image` inside messages payloads
- `image` nested inside `tool_result` content

### Agent detection

The request is marked as agent-originated when the final message or input item is not a direct user turn.

## Failure modes

| Failure condition | Result |
| --- | --- |
| Alias missing from ledger | Error instructs the user to run `opencode auth multi-copilot` |
| No accounts authenticated | Error instructs the user to set up the first account |
| OAuth device initiation fails | `authorize()` throws `Failed to initiate device authorisation` |
| OAuth polling returns non-recoverable error | Callback returns `{ type: "failed" }` |
