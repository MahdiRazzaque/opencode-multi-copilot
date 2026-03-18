import { afterEach, describe, expect, mock, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AuthStateManager,
  type StoredAccount,
} from "../src/auth/auth-state-manager.js";
import {
  RefreshTokenExpiredError,
  TokenService,
} from "../src/auth/token-service.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  AuthStateManager.resetForTests();
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

const seedAccount = async (account: StoredAccount) => {
  const directory = await mkdtemp(join(tmpdir(), "multi-copilot-auth-"));
  cleanupPaths.push(directory);
  const manager = AuthStateManager.getInstance({
    filePath: join(directory, "multi-copilot-auth.json"),
  });
  await manager.upsertAccount(account);
  return { directory, manager };
};

describe("AuthStateManager", () => {
  test("writes the auth ledger with owner-only permissions", async () => {
    const { directory } = await seedAccount({
      accessToken: "access-token",
      alias: "work",
      enterpriseUrl: null,
      expiresAt: Date.now() + 3_600_000,
      refreshToken: "refresh-token",
    });

    const mode = (await stat(join(directory, "multi-copilot-auth.json"))).mode & 0o777;

    expect(mode).toBe(0o600);
  });

  test("redacts secrets from its JSON representation", async () => {
    const { manager } = await seedAccount({
      accessToken: "access-token",
      alias: "work",
      enterpriseUrl: null,
      expiresAt: Date.now() + 3_600_000,
      refreshToken: "refresh-token",
    });

    const redacted = JSON.parse(JSON.stringify(manager)) as Record<string, unknown>;

    expect(redacted).toEqual({
      work: {
        access_token: "[redacted]",
        alias: "work",
        enterprise_url: null,
        expires: expect.any(Number),
        refresh_token: "[redacted]",
      },
    });
  });

  test("recovers after a failed write instead of poisoning later writes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "multi-copilot-auth-"));
    cleanupPaths.push(directory);
    const manager = AuthStateManager.getInstance({
      filePath: join(directory, "multi-copilot-auth.json"),
    });

    await chmod(directory, 0o500);
    try {
      await manager.upsertAccount({
        accessToken: "first-token",
        alias: "work",
        enterpriseUrl: null,
        expiresAt: Date.now() + 3_600_000,
        refreshToken: "first-refresh-token",
      });
      throw new Error("Expected the first write to fail while the directory is read-only.");
    } catch {
    }

    await chmod(directory, 0o700);
    await manager.upsertAccount({
      accessToken: "second-token",
      alias: "work",
      enterpriseUrl: null,
      expiresAt: Date.now() + 3_600_000,
      refreshToken: "second-refresh-token",
    });

    const persisted = JSON.parse(
      await readFile(join(directory, "multi-copilot-auth.json"), "utf8"),
    ) as Record<string, { access_token: string }>;

    expect(persisted["work"]?.access_token).toBe("second-token");
  });
});

describe("TokenService", () => {
  test("refreshes an expired token and persists the updated account", async () => {
    const { directory, manager } = await seedAccount({
      accessToken: "expired-token",
      alias: "work",
      enterpriseUrl: null,
      expiresAt: Date.now() - 1_000,
      refreshToken: "refresh-token",
    });

    const refreshAccessToken = mock(async () => ({
      accessToken: "fresh-token",
      expiresAt: Date.now() + 7_200_000,
      refreshToken: "fresh-refresh-token",
    }));
    const service = new TokenService({
      clock: () => Date.now(),
      oauthClient: { refreshAccessToken },
      stateManager: manager,
    });

    const token = await service.getAccessToken("work");
    const persisted = JSON.parse(
      await readFile(join(directory, "multi-copilot-auth.json"), "utf8"),
    ) as Record<
      string,
      {
        access_token: string;
        alias: string;
        enterprise_url: string | null;
        expires: number;
        refresh_token: string;
      }
    >;
    const workAccount = persisted["work"];

    expect(token).toBe("fresh-token");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(workAccount).toBeDefined();
    expect(workAccount?.access_token).toBe("fresh-token");
    expect(workAccount?.refresh_token).toBe("fresh-refresh-token");
  });

  test("surfaces an explicit re-authentication error for expired refresh tokens", async () => {
    const { manager } = await seedAccount({
      accessToken: "expired-token",
      alias: "work",
      enterpriseUrl: null,
      expiresAt: Date.now() - 1_000,
      refreshToken: "refresh-token",
    });
    const service = new TokenService({
      clock: () => Date.now(),
      oauthClient: {
        refreshAccessToken: mock(async () => {
          throw new RefreshTokenExpiredError("work");
        }),
      },
      stateManager: manager,
    });

    try {
      await service.getAccessToken("work");
      throw new Error("Expected getAccessToken to throw for an expired refresh token.");
    } catch (error) {
      expect((error as Error).message).toBe(
        "The refresh token for alias \"work\" is expired or revoked. Run 'opencode auth multi-copilot' to authenticate again.",
      );
    }
  });
});
