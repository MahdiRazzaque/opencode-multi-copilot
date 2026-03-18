import type { AccountCredentials } from "../types.js";

export type BaseUrlStrategy = {
  resolveApiUrl(account: AccountCredentials, originalUrl: string): URL;
};

export class CopilotBaseUrlStrategy implements BaseUrlStrategy {
  resolveApiUrl(account: AccountCredentials, originalUrl: string): URL {
    const url = new URL(originalUrl);

    if (!account.enterpriseUrl || url.hostname !== "api.github.com") {
      return url;
    }

    return new URL(`${url.protocol}//copilot-api.${account.enterpriseUrl}${url.pathname}${url.search}`);
  }
}
