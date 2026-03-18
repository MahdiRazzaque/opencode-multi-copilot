import {
  AUTH_COMMAND_HINT,
  AUTH_COMMAND_RETRY_HINT,
} from "./constants.js";

export class MultiCopilotError extends Error {
  override name = "MultiCopilotError";
}

export class MissingAuthenticatedAliasError extends MultiCopilotError {
  constructor(alias: string) {
    super(
      `No authenticated account found for alias \"${alias}\". ${AUTH_COMMAND_HINT}.`,
    );
  }
}

export class MissingAuthenticatedAccountError extends MultiCopilotError {
  constructor() {
    super(`No authenticated account is available. ${AUTH_COMMAND_HINT}.`);
  }
}

export class InvalidRequestBodyError extends MultiCopilotError {
  constructor() {
    super("Unable to determine the requested model from the outbound payload.");
  }
}

export class RefreshTokenExpiredError extends MultiCopilotError {
  constructor(alias: string) {
    super(
      `The refresh token for alias \"${alias}\" is expired or revoked. ${AUTH_COMMAND_RETRY_HINT}`,
    );
  }
}

export class OAuthFlowError extends MultiCopilotError {
  constructor(message: string) {
    super(message);
  }
}
