# Configuration Reference

## Config directory

All plugin-managed files live under:

```text
~/.config/opencode
```

## Mapping file

Path:

```text
~/.config/opencode/multi-copilot-mapping.json
```

### Schema

| Key | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `default_account` | `string` | Yes | `""` | Fallback alias when populated. If left empty, the plugin falls back to the first authenticated alias. |
| `model_mirroring` | `"auto" \| "skip"` | No | `"skip"` | Controls whether native Copilot models are mirrored into `multi-copilot` |
| `mappings` | `Record<string, string>` | Yes | `{}` | Maps `github-copilot/[model]` keys to alias names |

### Valid example

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

### Validation rules

- Every mapping key must start with `github-copilot/`
- Every alias value must satisfy `^[a-zA-Z0-9_-]+$`
- Missing or invalid JSON causes `readMappingConfig()` to throw

### Resolution order

When the plugin resolves a model request, it checks aliases in this order:

1. Explicit entry in `mappings`
2. `default_account`, if it is a non-empty string
3. The first authenticated alias found in the auth ledger

## Auth ledger file

Path:

```text
~/.config/opencode/multi-copilot-auth.json
```

### Schema

The file is a JSON object keyed by alias.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `access_token` | `string` | Yes | Token value used by the current implementation |
| `refresh_token` | `string` | Yes | Stored alongside the access token |
| `expires` | `number` | Yes | Expiry timestamp field retained in the account record |
| `enterpriseUrl` | `string` | No | Enterprise hostname or URL; defaults to an empty string |

### Example

```json
{
  "work": {
    "access_token": "ghu_example",
    "refresh_token": "ghu_example",
    "expires": 0,
    "enterpriseUrl": "github.example.com"
  },
  "personal": {
    "access_token": "ghu_example",
    "refresh_token": "ghu_example",
    "expires": 0,
    "enterpriseUrl": ""
  }
}
```

### Security properties

- Created automatically if missing
- Written using a temporary file followed by rename
- `chmod 0600` is applied after write where the platform supports it
- Internal sanitisation helpers redact token values before JSON serialisation for diagnostics

## Model cache file

Path:

```text
~/.config/opencode/multi-copilot-models-cache.json
```

This file stores an array of mirrored model IDs discovered from the native `github-copilot` provider. The plugin treats it as a best-effort cache rather than a source of truth.

## OpenCode config reference

At minimum, OpenCode must load the plugin. A typical configuration is:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/opencode-multi-copilot/dist/index.js"],
  "model": "multi-copilot/claude-opus-4.6"
}
```

## Common configuration failures

| Condition | Observed behaviour |
| --- | --- |
| Invalid mapping JSON | `readMappingConfig()` throws an invalid JSON error |
| Invalid mapping schema | `readMappingConfig()` throws a validation error |
| Mapped alias not in auth ledger | Request fails fast with an auth guidance error |
| No authenticated aliases | Request fails fast and instructs the user to set up an account |
