# Overview

## Purpose

`opencode-multi-copilot` is an OpenCode plugin that introduces a provider named `multi-copilot`. Its purpose is to let one OpenCode installation route model requests across multiple GitHub Copilot accounts without restarting OpenCode between account changes.

## What the plugin does

- Registers a new provider named `multi-copilot`
- Persists multiple authenticated account aliases in a local ledger
- Reads a model-to-alias routing file on demand
- Selects the correct account for each request
- Rewrites the target Copilot API host for GitHub Enterprise accounts
- Mirrors native `github-copilot` models into the custom provider when configured to do so

## Repository scope

This repository is a single Bun and TypeScript package. It is not a monorepo.

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Plugin entry point and provider registration |
| `src/auth.ts` | OpenCode auth hook, device flow, model mirroring, and wrapped fetch |
| `src/config.ts` | Filesystem paths, config creation, mapping reads, and cache management |
| `src/ledger.ts` | Auth ledger loading, account lookup, write serialisation, and sanitisation |
| `src/provider.ts` | Enterprise URL handling plus agent and vision detection helpers |
| `src/schemas.ts` | Runtime validation schemas for aliases, mappings, and stored accounts |
| `src/*.test.ts` | Bun unit tests covering expected runtime behaviour |

## Runtime dependencies

| Dependency | Role |
| --- | --- |
| `@opencode-ai/plugin` | Plugin and auth hook types |
| `@opencode-ai/sdk` | OpenCode configuration types |
| `@ai-sdk/openai-compatible` | Provider metadata compatibility |
| `zod` | Runtime validation of config and ledger data |
| `bun` | Runtime, test runner, and build tool |

## Execution summary

At startup, the plugin ensures its local config files exist. During configuration, it registers the `multi-copilot` provider and exposes either mapped models or mirrored native models. During request execution, it inspects the request payload, resolves the correct alias, injects the correct bearer token, and forwards the request to the appropriate Copilot API host.

## Current implementation notes

- Mapping configuration is cached by file modification time, then reloaded automatically when the file changes.
- Auth ledger writes use a temporary file followed by rename to reduce partial-write risk.
- The current code stores the same device-flow token value in both `access_token` and `refresh_token`.
- The current code does not perform a dedicated refresh-token exchange before dispatching requests.

## Visual reference

![Repository structure](./images/repository-structure.svg)
