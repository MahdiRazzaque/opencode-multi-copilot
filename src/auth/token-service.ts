import { REFRESH_BUFFER_MS } from "../constants.js";
import { MissingAuthenticatedAliasError, RefreshTokenExpiredError } from "../errors.js";
import type { AccountCredentials, OAuthTokenPayload, StoredAccount } from "../types.js";
import type { AuthStateManager } from "./auth-state-manager.js";

export { RefreshTokenExpiredError } from "../errors.js";

export type OAuthClient = {
  refreshAccessToken(input: {
    alias: string;
    enterpriseUrl: string | null;
    refreshToken: string;
  }): Promise<OAuthTokenPayload>;
};

export class TokenService {
  constructor(
    private readonly options: {
      clock: () => number;
      oauthClient: OAuthClient;
      stateManager: AuthStateManager;
    },
  ) {}

  async listAuthenticatedAliases(): Promise<string[]> {
    return this.options.stateManager.listAliases();
  }

  async getAccessToken(alias: string): Promise<string> {
    const credentials = await this.getAccountCredentials(alias);
    return credentials.accessToken;
  }

  async getAccountCredentials(alias: string): Promise<AccountCredentials> {
    const account = await this.loadAccount(alias);
    const freshAccount = this.requiresRefresh(account)
      ? await this.refreshAccount(account)
      : account;

    return {
      accessToken: freshAccount.accessToken,
      alias: freshAccount.alias,
      enterpriseUrl: freshAccount.enterpriseUrl,
    };
  }

  async forceRefresh(alias: string): Promise<AccountCredentials> {
    const account = await this.loadAccount(alias);
    const refreshed = await this.refreshAccount(account);

    return {
      accessToken: refreshed.accessToken,
      alias: refreshed.alias,
      enterpriseUrl: refreshed.enterpriseUrl,
    };
  }

  private async loadAccount(alias: string): Promise<StoredAccount> {
    const account = await this.options.stateManager.getAccount(alias);

    if (!account) {
      throw new MissingAuthenticatedAliasError(alias);
    }

    return account;
  }

  private requiresRefresh(account: StoredAccount): boolean {
    if (account.expiresAt <= 0) {
      return false;
    }

    return account.expiresAt <= this.options.clock() + REFRESH_BUFFER_MS;
  }

  private async refreshAccount(account: StoredAccount): Promise<StoredAccount> {
    if (!account.refreshToken) {
      throw new RefreshTokenExpiredError(account.alias);
    }

    const refreshed = await this.options.oauthClient.refreshAccessToken({
      alias: account.alias,
      enterpriseUrl: account.enterpriseUrl,
      refreshToken: account.refreshToken,
    });
    const nextAccount: StoredAccount = {
      accessToken: refreshed.accessToken,
      alias: account.alias,
      enterpriseUrl: account.enterpriseUrl,
      expiresAt: refreshed.expiresAt,
      refreshToken: refreshed.refreshToken || account.refreshToken,
      ...(refreshed.accountId ? { accountId: refreshed.accountId } : {}),
    };

    await this.options.stateManager.upsertAccount(nextAccount);

    return nextAccount;
  }
}
