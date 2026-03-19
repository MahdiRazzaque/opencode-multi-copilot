import {
  MissingAuthenticatedAccountError,
  MissingAuthenticatedAliasError,
} from "../errors.js";
import type { ModelMapping } from "../types.js";

type PayloadShape = {
  input?: unknown;
  messages?: unknown;
  model?: unknown;
  prompt?: unknown;
};

export function extractRequestedModel(body: string | null | undefined): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as PayloadShape;

    if (typeof parsed.model === "string") {
      return parsed.model;
    }

    return null;
  } catch (_e) {
    return null;
  }
}

export function resolveRoute(input: {
  authenticatedAliases: string[];
  mapping: ModelMapping;
  requestBody: string | null | undefined;
}): { alias: string; model: string | null } {
  const model = extractRequestedModel(input.requestBody);
  const mappedAlias = model ? input.mapping.mappings[model] : undefined;

  if (mappedAlias) {
    if (!input.authenticatedAliases.includes(mappedAlias)) {
      throw new MissingAuthenticatedAliasError(mappedAlias);
    }

    return { alias: mappedAlias, model };
  }

  if (input.mapping.defaultAccount) {
    if (!input.authenticatedAliases.includes(input.mapping.defaultAccount)) {
      throw new MissingAuthenticatedAliasError(input.mapping.defaultAccount);
    }

    return { alias: input.mapping.defaultAccount, model };
  }

  const [firstAlias] = input.authenticatedAliases;
  if (!firstAlias) {
    throw new MissingAuthenticatedAccountError();
  }

  return { alias: firstAlias, model };
}
