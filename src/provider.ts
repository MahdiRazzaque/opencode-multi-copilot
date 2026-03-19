import { resolveAccountForModel } from "./ledger.js";
import type { AccountData } from "./schemas.js";

export const PERSONAL_BASE_URL = "https://api.github.com";

export function normaliseDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function constructBaseURL(account: Pick<AccountData, "enterpriseUrl">): string {
  if (!account.enterpriseUrl) {
    return PERSONAL_BASE_URL;
  }

  return `https://copilot-api.${normaliseDomain(account.enterpriseUrl)}`;
}

export function detectVision(body: unknown, url?: string): boolean {
  try {
    if ((body as any)?.messages && url?.includes("completions")) {
      return (body as any).messages.some(
        (message: any) =>
          Array.isArray(message?.content) && message.content.some((part: any) => part?.type === "image_url")
      );
    }

    if ((body as any)?.input) {
      return (body as any).input.some(
        (item: any) => Array.isArray(item?.content) && item.content.some((part: any) => part?.type === "input_image")
      );
    }

    if ((body as any)?.messages) {
      return (body as any).messages.some(
        (item: any) =>
          Array.isArray(item?.content) &&
          item.content.some(
            (part: any) =>
              part?.type === "image" ||
              (part?.type === "tool_result" &&
                Array.isArray(part?.content) &&
                part.content.some((nested: any) => nested?.type === "image"))
          )
      );
    }
  } catch {}

  return false;
}

export function detectAgent(body: unknown, url?: string): boolean {
  try {
    if ((body as any)?.messages && url?.includes("completions")) {
      const last = (body as any).messages[(body as any).messages.length - 1];
      return last?.role !== "user";
    }

    if ((body as any)?.input) {
      const last = (body as any).input[(body as any).input.length - 1];
      return last?.role !== "user";
    }

    if ((body as any)?.messages) {
      const last = (body as any).messages[(body as any).messages.length - 1];
      const hasNonToolCalls =
        Array.isArray(last?.content) && last.content.some((part: any) => part?.type !== "tool_result");
      return !(last?.role === "user" && hasNonToolCalls);
    }
  } catch {}

  return false;
}

export function createCustomFetch(modelId: string): (request: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (request: string | URL | Request, init?: RequestInit) => {
    const { account } = await resolveAccountForModel(modelId);
    const url = request instanceof URL ? request.href : request.toString();

    let body: unknown;
    try {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    } catch {}

    const isVision = detectVision(body, url);
    const isAgent = detectAgent(body, url);

    const headers: Record<string, string> = {
      "x-initiator": isAgent ? "agent" : "user",
      ...(init?.headers as Record<string, string>),
      "User-Agent": "opencode/multi-copilot",
      Authorization: `Bearer ${account.access_token}`,
      "Openai-Intent": "conversation-edits",
    };

    if (isVision) {
      headers["Copilot-Vision-Request"] = "true";
    }

    delete headers["x-api-key"];
    delete headers.authorization;

    return fetch(request, { ...init, headers });
  };
}
