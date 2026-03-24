import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

const fileLocks = new Map<string, Promise<void>>();

export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const existing = fileLocks.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = existing.then(() => current);
  fileLocks.set(filePath, queued);

  try {
    await existing;
    return await fn();
  } finally {
    release();
    if (fileLocks.get(filePath) === queued) {
      fileLocks.delete(filePath);
    }
  }
}

export async function writeFileAtomically(
  filePath: string,
  content: string,
  options?: { mode?: number }
): Promise<void> {
  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`
  );

  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, filePath);

  if (options?.mode !== undefined) {
    await fs.chmod(filePath, options.mode);
  }
}
