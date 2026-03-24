import type { AccountData } from "./schemas.js";

export const PERSONAL_BASE_URL = "https://api.githubcopilot.com";

type ContentPart = {
  type: string;
  content?: ContentPart[];
  [key: string]: unknown;
};

type RequestItem = {
  role?: string;
  content?: ContentPart[] | string;
  [key: string]: unknown;
};

type RequestBody = {
  messages?: RequestItem[];
  input?: RequestItem[];
  [key: string]: unknown;
};

function isRequestBody(value: unknown): value is RequestBody {
  return typeof value === "object" && value !== null;
}

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
    if (!isRequestBody(body)) {
      return false;
    }

    if (body.messages && url?.includes("completions")) {
      return body.messages.some(
        (message) =>
          Array.isArray(message.content) &&
          (message.content as ContentPart[]).some((part) => part.type === "image_url")
      );
    }

    if (body.input) {
      return body.input.some(
        (item) =>
          Array.isArray(item.content) &&
          (item.content as ContentPart[]).some((part) => part.type === "input_image")
      );
    }

    if (body.messages) {
      return body.messages.some(
        (item) =>
          Array.isArray(item.content) &&
          (item.content as ContentPart[]).some(
            (part) =>
              part.type === "image" ||
              (part.type === "tool_result" &&
                Array.isArray(part.content) &&
                part.content.some((nested) => nested.type === "image"))
          )
      );
    }
  } catch (_e) {}

  return false;
}

export function detectAgent(body: unknown, url?: string): boolean {
  try {
    if (!isRequestBody(body)) {
      return false;
    }

    if (body.messages && url?.includes("completions")) {
      const last = body.messages[body.messages.length - 1];
      return last?.role !== "user";
    }

    if (body.input) {
      const last = body.input[body.input.length - 1];
      return last?.role !== "user";
    }

    if (body.messages) {
      const last = body.messages[body.messages.length - 1];
      const hasNonToolCalls =
        Array.isArray(last?.content) &&
        (last.content as ContentPart[]).some((part) => part.type !== "tool_result");
      return !(last?.role === "user" && hasNonToolCalls);
    }
  } catch (_e) {}

  return false;
}

