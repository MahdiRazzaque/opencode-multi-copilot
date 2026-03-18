import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MappingStore } from "../src/config/mapping-store.js";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

const createStore = async () => {
  const directory = await mkdtemp(join(tmpdir(), "multi-copilot-mapping-"));
  cleanupPaths.push(directory);
  return {
    directory,
    store: new MappingStore({
      filePath: join(directory, "multi-copilot-mapping.json"),
    }),
  };
};

describe("MappingStore", () => {
  test("seeds a default mapping file when none exists", async () => {
    const { directory, store } = await createStore();

    const mapping = await store.load();
    const content = JSON.parse(
      await readFile(join(directory, "multi-copilot-mapping.json"), "utf8"),
    ) as { default_account: string | null; mappings: Record<string, string> };

    expect(mapping).toEqual({ defaultAccount: null, mappings: {} });
    expect(content).toEqual({ default_account: null, mappings: {} });
  });

  test("reloads the mapping when the file changes on disk", async () => {
    const { directory, store } = await createStore();

    await store.load();
    await Bun.sleep(20);
    await writeFile(
      join(directory, "multi-copilot-mapping.json"),
      JSON.stringify({ default_account: "work", mappings: { "claude-opus-4.6": "work" } }, null, 2),
      "utf8",
    );

    const reloaded = await store.load();

    expect(reloaded).toEqual({
      defaultAccount: "work",
      mappings: { "claude-opus-4.6": "work" },
    });
  });
});
