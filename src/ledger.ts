import * as fs from "node:fs/promises";

import { AUTH_PATH } from "./config.js";
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
