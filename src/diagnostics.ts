function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isTempLoggingEnabled(): boolean {
  const value =
    process.env.MULTI_COPILOT_TEMP_LOGS ?? process.env.OPENCODE_MULTI_COPILOT_TEMP_LOGS ?? "";

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function warnFallback(event: string, fallback: string, error?: unknown): void {
  const payload: {
    level: "warn";
    event: string;
    fallback: string;
    error?: string;
  } = {
    level: "warn",
    event,
    fallback,
  };

  if (error !== undefined) {
    payload.error = describeError(error);
  }

  console.warn("[multi-copilot]", payload);
}

export function tempLog(event: string, details: Record<string, unknown> = {}): void {
  if (!isTempLoggingEnabled()) {
    return;
  }

  console.warn("[multi-copilot]", {
    level: "warn",
    event: `temp-${event}`,
    ...details,
  });
}
