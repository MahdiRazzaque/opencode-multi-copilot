# Development and Testing

## Local development workflow

Install dependencies:

```bash
bun install
```

Run the test suite:

```bash
bun run test
```

Run type-checking:

```bash
bun run typecheck
```

Build the plugin:

```bash
bun run build
```

## Toolchain

| Tool | Purpose |
| --- | --- |
| Bun | Runtime, package manager, build, and tests |
| TypeScript | Static typing and declaration output |
| Zod | Runtime validation of config and auth state |

## TypeScript configuration

The project extends `@tsconfig/node22` and enables strict type-checking.

| Setting | Value |
| --- | --- |
| `strict` | `true` |
| `moduleResolution` | `nodenext` |
| `module` | `nodenext` |
| `lib` | `ESNext`, `DOM` |
| `types` | `bun` |

Build-oriented settings are defined in `tsconfig.build.json`, including declaration maps and source maps.

## Test coverage by area

| Test file | Covered behaviour |
| --- | --- |
| `src/index.test.ts` | Hook registration and provider configuration |
| `src/auth.test.ts` | Auth prompts, device flow polling, model mirroring, and fetch wrapping |
| `src/config.test.ts` | Config file creation, caching, and alias resolution |
| `src/ledger.test.ts` | Ledger persistence, sanitisation, concurrency, and fail-fast errors |
| `src/provider.test.ts` | Vision detection, agent detection, and base URL selection |
| `src/schemas.test.ts` | Schema validation rules and defaults |

## Expected contributor workflow

1. Install dependencies with `bun install`.
2. Make the required code changes.
3. Run `bun run test`.
4. Run `bun run typecheck`.
5. Run `bun run build`.
6. Rebuild or relink the plugin before testing it inside OpenCode.

## Manual verification suggestions

- Authenticate at least one personal alias and, if available, one enterprise alias.
- Confirm that `multi-copilot-mapping.json` is created automatically.
- Confirm that invalid aliases are rejected during `opencode auth multi-copilot`.
- Send a request through a mapped `multi-copilot/...` model and verify that the correct alias is used.
- If `model_mirroring` is set to `auto`, verify that mirrored models appear under the provider.
