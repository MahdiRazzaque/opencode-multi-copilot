import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { assertValidAlias } from "./alias.js";
import type { StoredAccount } from "../types.js";

const serialisedAccountSchema = z.object({
  access_token: z.string(),
  alias: z.string(),
  enterprise_url: z.string().nullable(),
  expires: z.number(),
  refresh_token: z.string(),
  account_id: z.string().optional(),
});

const authLedgerSchema = z.record(z.string(), serialisedAccountSchema);

type SerialisedAccount = z.infer<typeof serialisedAccountSchema>;

export { type StoredAccount } from "../types.js";

export class AuthStateManager {
  private static instance: AuthStateManager | undefined;
  private ledgerSnapshot: Record<string, SerialisedAccount> = {};
  private writeQueue: Promise<void> = Promise.resolve();

  static getInstance(options: { filePath: string }): AuthStateManager {
    if (!AuthStateManager.instance) {
      AuthStateManager.instance = new AuthStateManager(options);
    }

    return AuthStateManager.instance;
  }

  static resetForTests(): void {
    AuthStateManager.instance = undefined;
  }

  private constructor(private readonly options: { filePath: string }) {}

  async upsertAccount(account: StoredAccount): Promise<void> {
    assertValidAlias(account.alias);

    const nextWrite = this.writeQueue.catch(() => undefined).then(async () => {
      const ledger = await this.readLedger();
      ledger[account.alias] = this.serialiseAccount(account);
      await this.writeLedger(ledger);
    });
    this.writeQueue = nextWrite;

    await nextWrite;
  }

  async getAccount(alias: string): Promise<StoredAccount | undefined> {
    const ledger = await this.readLedger();
    const entry = ledger[alias];

    return entry ? this.deserialiseAccount(entry) : undefined;
  }

  async listAliases(): Promise<string[]> {
    return Object.keys(await this.readLedger());
  }

  async toRedactedRecord(): Promise<Record<string, SerialisedAccount>> {
    const ledger = await this.readLedger();
    return this.redactLedger(ledger);
  }

  toJSON(): Record<string, SerialisedAccount> {
    return this.redactLedger(this.ledgerSnapshot);
  }

  private async readLedger(): Promise<Record<string, SerialisedAccount>> {
    try {
      const raw = await readFile(this.options.filePath, "utf8");
      const parsed = authLedgerSchema.parse(JSON.parse(raw));
      this.ledgerSnapshot = parsed;
      return parsed;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        this.ledgerSnapshot = {};
        return {};
      }

      throw error;
    }
  }

  private async writeLedger(ledger: Record<string, SerialisedAccount>): Promise<void> {
    const tempPath = `${this.options.filePath}.tmp`;
    const serialised = JSON.stringify(ledger, null, 2) + "\n";

    await mkdir(dirname(this.options.filePath), { recursive: true });
    await writeFile(tempPath, serialised, "utf8");
    await chmod(tempPath, 0o600);
    await rename(tempPath, this.options.filePath);
    await chmod(this.options.filePath, 0o600);
    this.ledgerSnapshot = ledger;
  }

  private redactLedger(
    ledger: Record<string, SerialisedAccount>,
  ): Record<string, SerialisedAccount> {
    const redactedEntries = Object.entries(ledger).map(([alias, account]) => [
      alias,
      {
        ...account,
        access_token: "[redacted]",
        refresh_token: "[redacted]",
      },
    ]);

    return Object.fromEntries(redactedEntries);
  }

  private serialiseAccount(account: StoredAccount): SerialisedAccount {
    return {
      access_token: account.accessToken,
      alias: account.alias,
      enterprise_url: account.enterpriseUrl,
      expires: account.expiresAt,
      refresh_token: account.refreshToken,
      ...(account.accountId ? { account_id: account.accountId } : {}),
    };
  }

  private deserialiseAccount(account: SerialisedAccount): StoredAccount {
    return {
      accessToken: account.access_token,
      alias: account.alias,
      enterpriseUrl: account.enterprise_url,
      expiresAt: account.expires,
      refreshToken: account.refresh_token,
      ...(account.account_id ? { accountId: account.account_id } : {}),
    };
  }
}
