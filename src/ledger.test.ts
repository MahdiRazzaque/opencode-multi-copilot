import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { AccountData, AuthLedger } from "./schemas.js";

const mockReadFile = mock(() => Promise.resolve("{}"));
const mockWriteFile = mock(() => Promise.resolve());
const mockRename = mock(() => Promise.resolve());
const mockChmod = mock(() => Promise.resolve());

mock.module("node:fs/promises", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  rename: mockRename,
  chmod: mockChmod,
}));

const {
  clearLedgerCache,
  getAccount,
  loadLedger,
  removeAccount,
  sanitiseLedger,
  saveLedger,
  setAccount,
} = await import("./ledger.js");

const workAccount: AccountData = {
  access_token: "work-access-token",
  refresh_token: "work-refresh-token",
  expires: 1700000000,
  enterpriseUrl: "https://example.invalid/work",
};

const personalAccount: AccountData = {
  access_token: "personal-access-token",
  refresh_token: "personal-refresh-token",
  expires: 1800000000,
  enterpriseUrl: "https://example.invalid/personal",
};

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function waitForCallCount(fn: { mock: { calls: unknown[][] } }, expectedCount: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (fn.mock.calls.length === expectedCount) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for ${expectedCount} calls`);
}

describe("ledger state manager", () => {
  beforeEach(() => {
    clearLedgerCache();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockRename.mockReset();
    mockChmod.mockReset();

    mockReadFile.mockImplementation(() => Promise.resolve("{}"));
    mockWriteFile.mockImplementation(() => Promise.resolve());
    mockRename.mockImplementation(() => Promise.resolve());
    mockChmod.mockImplementation(() => Promise.resolve());
  });

  test("loads missing ledger as empty object", async () => {
    mockReadFile.mockImplementation(() => Promise.reject(new Error("ENOENT")));

    const ledger = await loadLedger();
    expect(ledger).toEqual({});
  });

  test("caches ledger after first read", async () => {
    const ledger: AuthLedger = { work: workAccount };
    mockReadFile.mockImplementation(() => Promise.resolve(JSON.stringify(ledger)));

    const first = await loadLedger();
    const second = await loadLedger();

    expect(first).toEqual(ledger);
    expect(second).toBe(first);
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  test("saves ledger with atomic write pattern and secure permissions", async () => {
    await saveLedger({ work: workAccount });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockRename).toHaveBeenCalledTimes(1);
    expect(mockChmod).toHaveBeenCalledTimes(1);

    const writeCall = mockWriteFile.mock.calls[0] as unknown as [string, string, string] | undefined;
    const renameCall = mockRename.mock.calls[0] as unknown as [string, string] | undefined;

    if (!writeCall || !renameCall) {
      throw new Error("Expected atomic write calls");
    }

    expect(writeCall[0]).toContain(".tmp");
    expect(renameCall[0]).toContain(".tmp");
    expect(renameCall[1]).not.toContain(".tmp");
    expect(mockChmod.mock.calls[0] as unknown as [string, number]).toEqual([
      renameCall[1],
      0o600,
    ]);
  });

  test("gets, sets, and removes accounts", async () => {
    await setAccount("work", workAccount);
    expect(await getAccount("work")).toEqual(workAccount);

    await removeAccount("work");
    expect(await getAccount("work")).toBeUndefined();
  });

  test("sanitises all tokens without mutating the source ledger", () => {
    const ledger: AuthLedger = {
      work: workAccount,
      personal: personalAccount,
    };

    const sanitised = sanitiseLedger(ledger);
    const serialised = JSON.stringify(sanitised);

    expect(serialised).toContain("[REDACTED]");
    expect(serialised).not.toContain(workAccount.access_token);
    expect(serialised).not.toContain(workAccount.refresh_token);
    expect(serialised).not.toContain(personalAccount.access_token);
    expect(serialised).not.toContain(personalAccount.refresh_token);
    expect(sanitised).toEqual({
      work: {
        ...workAccount,
        access_token: "[REDACTED]",
        refresh_token: "[REDACTED]",
      },
      personal: {
        ...personalAccount,
        access_token: "[REDACTED]",
        refresh_token: "[REDACTED]",
      },
    });
    expect(ledger.work.access_token).toBe("work-access-token");
    expect(ledger.personal.refresh_token).toBe("personal-refresh-token");
  });

  test("allows concurrent writes for different aliases", async () => {
    const firstWrite = createDeferred();
    const secondWrite = createDeferred();
    let writeCount = 0;

    mockWriteFile.mockImplementation(() => {
      writeCount += 1;
      return writeCount === 1 ? firstWrite.promise : secondWrite.promise;
    });

    const workPromise = setAccount("work", workAccount);
    const personalPromise = setAccount("personal", personalAccount);

    await waitForCallCount(mockWriteFile, 2);

    firstWrite.resolve();
    secondWrite.resolve();

    await Promise.all([workPromise, personalPromise]);

    expect(await getAccount("work")).toEqual(workAccount);
    expect(await getAccount("personal")).toEqual(personalAccount);
  });

  test("serialises concurrent writes for the same alias", async () => {
    const firstWrite = createDeferred();
    const secondWrite = createDeferred();
    let writeCount = 0;

    mockWriteFile.mockImplementation(() => {
      writeCount += 1;
      return writeCount === 1 ? firstWrite.promise : secondWrite.promise;
    });

    const firstUpdate = setAccount("work", workAccount);

    await waitForCallCount(mockWriteFile, 1);

    const secondUpdate = setAccount("work", personalAccount);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWriteFile.mock.calls.length).toBe(1);

    firstWrite.resolve();
    await waitForCallCount(mockWriteFile, 2);

    secondWrite.resolve();
    await Promise.all([firstUpdate, secondUpdate]);

    expect(await getAccount("work")).toEqual(personalAccount);
  });
});
