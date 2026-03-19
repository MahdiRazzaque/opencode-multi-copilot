import * as fs from "node:fs/promises";

import { AUTH_PATH, resolveAliasForModel } from "./config.js";
import { AuthLedgerSchema } from "./schemas.js";
import type { AccountData, AuthLedger } from "./schemas.js";

let cachedLedger: AuthLedger | null = null;
let loadLedgerPromise: Promise<AuthLedger> | null = null;
const aliasLocks = new Map<string, Promise<void>>();

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string };
  return errorWithCode.code === "ENOENT" || error.message.includes("ENOENT");
}

async function withAliasLock<T>(alias: string, fn: () => Promise<T>): Promise<T> {
  const existing = aliasLocks.get(alias) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = existing.then(() => current);
  aliasLocks.set(alias, queued);

  try {
    await existing;
    return await fn();
  } finally {
    release();
    if (aliasLocks.get(alias) === queued) {
      aliasLocks.delete(alias);
    }
  }
}

export function clearLedgerCache(): void {
  cachedLedger = null;
  loadLedgerPromise = null;
  aliasLocks.clear();
}

export async function loadLedger(): Promise<AuthLedger> {
  if (cachedLedger !== null) {
    return cachedLedger;
  }

  if (loadLedgerPromise !== null) {
    return loadLedgerPromise;
  }

  loadLedgerPromise = (async () => {
    try {
      const raw = await fs.readFile(AUTH_PATH, "utf-8");
      const parsed = AuthLedgerSchema.parse(JSON.parse(raw));
      cachedLedger = parsed;
      return parsed;
    } catch (error) {
      if (isMissingFileError(error)) {
        cachedLedger = {};
        return cachedLedger;
      }

      throw error;
    } finally {
      loadLedgerPromise = null;
    }
  })();

  return loadLedgerPromise;
}

export async function saveLedger(data: AuthLedger): Promise<void> {
  const tempPath = `${AUTH_PATH}.tmp`;
  const content = `${JSON.stringify(data, null, 2)}\n`;

  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, AUTH_PATH);
  await fs.chmod(AUTH_PATH, 0o600);

  cachedLedger = data;
}

export async function getAccount(alias: string): Promise<AccountData | undefined> {
  const ledger = await loadLedger();
  return ledger[alias];
}

async function resolveAlias(modelId: string, aliases: string[]): Promise<string> {
  if (resolveAliasForModel.length > 2) {
    const { readMappingConfig } = await import("./config.js");
    const mapping = await readMappingConfig();
    const legacyResolveAliasForModel = resolveAliasForModel as unknown as (
      requestedModelId: string,
      authAliases: string[],
      currentMapping: Awaited<ReturnType<typeof readMappingConfig>>
    ) => string | undefined;

    return legacyResolveAliasForModel(modelId, aliases, mapping) ?? aliases[0];
  }

  const currentResolveAliasForModel = resolveAliasForModel as unknown as (
    requestedModelId: string,
    authAliases: string[]
  ) => Promise<string | undefined> | string | undefined;

  return (await currentResolveAliasForModel(modelId, aliases)) ?? aliases[0];
}

export async function getTokenForAlias(alias: string): Promise<AccountData> {
  const ledger = await loadLedger();
  const account = ledger[alias];

  if (!account) {
    throw new Error(
      `No authentication found for alias '${alias}'. Run 'opencode auth multi-copilot' to authenticate this account.`
    );
  }

  return account;
}

export async function resolveAccountForModel(
  modelId: string
): Promise<{ alias: string; account: AccountData }> {
  const ledger = await loadLedger();
  const aliases = Object.keys(ledger);

  if (aliases.length === 0) {
    throw new Error(
      "No accounts authenticated. Run 'opencode auth multi-copilot' to set up your first account."
    );
  }

  const alias = await resolveAlias(modelId, aliases);
  const account = await getTokenForAlias(alias);
  return { alias, account };
}

export async function setAccount(alias: string, account: AccountData): Promise<void> {
  await withAliasLock(alias, async () => {
    const ledger = await loadLedger();
    ledger[alias] = account;
    await saveLedger(ledger);
  });
}

export async function removeAccount(alias: string): Promise<void> {
  await withAliasLock(alias, async () => {
    const ledger = await loadLedger();
    delete ledger[alias];
    await saveLedger(ledger);
  });
}

export function sanitiseLedger(ledger: AuthLedger): Record<string, unknown> {
  const sanitised: Record<string, unknown> = {};

  for (const [alias, account] of Object.entries(ledger)) {
    sanitised[alias] = {
      ...account,
      access_token: "[REDACTED]",
      refresh_token: "[REDACTED]",
    };
  }

  return sanitised;
}
