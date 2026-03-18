import { describe, expect, test } from "bun:test";

import {
  INVALID_ALIAS_MESSAGE,
  assertValidAlias,
} from "../src/auth/alias.js";

describe("assertValidAlias", () => {
  test("accepts alphanumeric aliases with hyphens and underscores", () => {
    expect(assertValidAlias("work-123_personal")).toBe("work-123_personal");
  });

  test("rejects aliases with unsupported characters", () => {
    expect(() => assertValidAlias("my alias!")).toThrow(INVALID_ALIAS_MESSAGE);
  });
});
