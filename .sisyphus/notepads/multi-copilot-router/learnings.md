# Learnings — multi-copilot-router

## Project Conventions

### Key Reference Files
- `/home/mahdi/Tools/opencode/packages/opencode/src/plugin/copilot.ts` — Auth hook, OAuth flow, model registration, custom fetch/header injection
- `/home/mahdi/Tools/opencode/packages/opencode/src/provider/sdk/copilot/copilot-provider.ts` — Provider factory setup
- `/home/mahdi/Tools/opencode/packages/plugin/src/index.ts` — Hooks interface with `config` hook
- Copilot Client ID: `"Ov23li8tweQw6odWQebz"` (NOT `"Iv1.b507a08c87ecfe98"`)

### Critical Architecture
- Plugin SDK: `export async function MyPlugin(input: PluginInput): Promise<Hooks>`
- Auth hook: `{ provider, loader, methods: [{ type: "oauth", label, prompts, authorize }] }`
- `authorize()` returns `{ url, instructions, method: "auto", callback }` — NOT the token directly. The callback polls
- Provider registered via `config` hook: seeds `config.provider["multi-copilot"]` BEFORE provider init
- Model mirroring: loader receives `database["multi-copilot"]` (OWN provider). Use `input.client.provider.list()` to get github-copilot models
- No token refresh — store access_token as both refresh and access with expires: 0

### British English Rules
- Use "authorise" not "authorize" **EXCEPT** the `authorize` method name on auth hook (API contract)
- Use "initialise" not "initialize"
- Use "behaviour" not "behavior"
- HTTP header `Authorization` stays as-is (protocol standard)

### Dependencies
- `@opencode-ai/plugin`, `@opencode-ai/sdk`, `zod`, `@ai-sdk/openai-compatible` (if available)
- devDeps: `@tsconfig/node22`, `@types/bun`, `typescript`
- NO linting config, prettier, or other tooling
- NO logging framework — console.error for errors only
- NO fs.watch — use fs.stat mtime check per-request

### File Paths
- CONFIG_DIR: `~/.config/opencode`
- MAPPING_PATH: `~/.config/opencode/multi-copilot-mapping.json`
- AUTH_PATH: `~/.config/opencode/multi-copilot-auth.json`
- Auth file: chmod 600, atomic write (temp + rename)

### Testing
- Framework: `bun:test` (describe/expect/test/spyOn/mock)
- TDD: RED (failing test) → GREEN (minimal impl) → REFACTOR
- Co-locate tests: `src/*.test.ts`
- Evidence: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

### Task 5 Auth Learnings
- `src/auth.test.ts` can safely mock the unfinished ledger module with `mock.module("../src/ledger.js", ...)` before `await import("./auth.js")`
- The auth loader can keep ledger access dynamic with `await import("./ledger.js")`, which avoids a static dependency on Task 6 while still letting tests intercept the module
- The auth loader should mirror `github-copilot` models from `input.client.provider.list()` first, then resolve per-request tokens from the ledger when the request body contains a `multi-copilot/*` model id
- Strict diagnostics are cleaner if the loader fetch wrapper uses a plain `Record<string, string>` header object rather than a `Headers` instance, because the tests inspect injected `Authorization` values directly
- Enterprise auth state can flow through `enterpriseUrl` on OAuth auth records, and the loader should derive `baseURL` as `https://copilot-api.${domain}` while personal auth stays on `https://api.github.com`

## Task 6 Learnings

- `src/ledger.ts` uses module-level `cachedLedger` state plus a `loadLedgerPromise` guard so concurrent reads share one parsed ledger object instead of racing separate loads
- Per-alias serialisation works cleanly with `Map<string, Promise<void>>`; same-alias writes queue, while different aliases can both reach `writeFile` before either resolves
- `sanitiseLedger()` should return a deep copied record shape with every `access_token` and `refresh_token` replaced by `"[REDACTED]"`; the original ledger object remains unchanged
- Atomic persistence for the auth ledger follows the repo convention: write `${AUTH_PATH}.tmp`, rename to `AUTH_PATH`, then chmod `0o600`

## Task 9 Learnings

- `src/provider.ts` already matched the T8 enterprise URL contract, so Task 9 only needed tests for protocol-only normalisation, path preservation, and explicit personal-versus-enterprise base URL routing
- Enterprise URL normalisation must stay identical to the upstream copilot helper logic: strip only the protocol and a single trailing slash, while preserving any path suffixes

## Task 10 Learnings

## [2026-03-19] Task: T10

- `src/index.ts` wires all modules: calls ensureMappingConfig(), ensureAuthLedger() on init, then returns { config, auth } hooks
- Config hook only mutates config object (no I/O) — seeds config.provider["multi-copilot"] = { name: "Multi Copilot", env: [] }
- createAuthHook(input) from auth.ts already handles model mirroring — index.ts just wires it in
- Test pattern: mock.module("./config.js", ...) and mock.module("./auth.js", ...) BEFORE await import("./index.js")
- The config hook must handle undefined config.provider (use `config.provider ?? {}`)
