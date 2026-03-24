function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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
