export const INVALID_ALIAS_MESSAGE =
  "Invalid alias. Use only alphanumeric characters, hyphens, and underscores.";

const ALIAS_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function assertValidAlias(alias: string): string {
  if (!ALIAS_PATTERN.test(alias)) {
    throw new Error(INVALID_ALIAS_MESSAGE);
  }

  return alias;
}

export function validateAliasPrompt(alias: string): string | undefined {
  return ALIAS_PATTERN.test(alias) ? undefined : INVALID_ALIAS_MESSAGE;
}
