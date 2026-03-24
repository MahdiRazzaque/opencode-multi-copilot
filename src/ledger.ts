import * as fs from "node:fs/promises";

import { AUTH_PATH, resolveAliasForModel } from "./config.js";
import { AuthLedgerSchema } from "./schemas.js";
import type { AccountData, AuthLedger } from "./schemas.js";
import { withFileLock, writeFileAtomically } from "./state-file.js";

let cachedLedger: AuthLedger | null = null;
let loadLedgerPromise: Promise<AuthLedger> | null = null;

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorWithCode = error as Error & { code?: string };
  return errorWithCode.code === "ENOENT" || error.message.includes("ENOENT");
}

export function clearLedgerCache(): void {
  cachedLedger = null;
  loadLedgerPromise = null;
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

async function saveLedgerUnlocked(data: AuthLedger): Promise<void> {
  const content = `${JSON.stringify(data, null, 2)}\n`;

  await writeFileAtomically(AUTH_PATH, content, { mode: 0o600 });
  cachedLedger = data;
}

export async function saveLedger(data: AuthLedger): Promise<void> {
  await withFileLock(AUTH_PATH, async () => {
    await saveLedgerUnlocked(data);
  });
}

export async function getAccount(alias: string): Promise<AccountData | undefined> {
  const ledger = await loadLedger();
  return ledger[alias];
}

async function resolveAlias(modelId: string, aliases: string[]): Promise<string> {
  const { readMappingConfig } = await import("./config.js");
  const mapping = await readMappingConfig();
  return resolveAliasForModel(modelId, aliases, mapping) ?? aliases[0];
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
  await withFileLock(AUTH_PATH, async () => {
    const ledger = await loadLedger();
    const nextLedger: AuthLedger = {
      ...ledger,
      [alias]: account,
    };
    await saveLedgerUnlocked(nextLedger);
  });
}

export async function removeAccount(alias: string): Promise<void> {
  await withFileLock(AUTH_PATH, async () => {
    const ledger = await loadLedger();
    const nextLedger: AuthLedger = { ...ledger };
    delete nextLedger[alias];
    await saveLedgerUnlocked(nextLedger);
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

export function toJSON(): Record<string, unknown> {
  return sanitiseLedger(cachedLedger ?? {});
}
