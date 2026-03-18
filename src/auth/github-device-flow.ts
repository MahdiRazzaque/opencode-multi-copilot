import { setTimeout as sleep } from "node:timers/promises";

import {
  DEFAULT_GITHUB_CLIENT_ID,
  DEVICE_CODE_GRANT_TYPE,
  OAUTH_SCOPE,
  REFRESH_TOKEN_GRANT_TYPE,
  USER_AGENT,
} from "../constants.js";
import { OAuthFlowError, RefreshTokenExpiredError } from "../errors.js";
import type { DeviceAuthorisationStart, OAuthTokenPayload } from "../types.js";

type TokenResponse = {
  access_token?: string;
  account_id?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  interval?: number;
  refresh_token?: string;
};

export class GitHubDeviceFlowClient {
  constructor(
    private readonly options: {
      clientId?: string;
      clock?: () => number;
      fetch?: typeof fetch;
      userAgent?: string;
    } = {},
  ) {}

  async startAuthorisation(enterpriseUrl: string | null): Promise<DeviceAuthorisationStart> {
    const response = await this.requestJson(this.getDeviceCodeUrl(enterpriseUrl), {
      body: JSON.stringify({
        client_id: this.options.clientId ?? DEFAULT_GITHUB_CLIENT_ID,
        scope: OAUTH_SCOPE,
      }),
      headers: this.headers(),
      method: "POST",
    });

    return {
      deviceCode: this.readRequiredString(response, "device_code"),
      expiresIn: this.readRequiredNumber(response, "expires_in"),
      interval: this.readRequiredNumber(response, "interval"),
      userCode: this.readRequiredString(response, "user_code"),
      verificationUri: this.readRequiredString(response, "verification_uri"),
    };
  }

  async pollForTokens(input: {
    deviceCode: string;
    enterpriseUrl: string | null;
    expiresIn: number;
    interval: number;
  }): Promise<OAuthTokenPayload> {
    const startedAt = (this.options.clock ?? Date.now)();
    let intervalMs = input.interval * 1000;

    while ((this.options.clock ?? Date.now)() < startedAt + input.expiresIn * 1000) {
      await sleep(intervalMs);

      const payload = await this.exchangeToken(
        input.enterpriseUrl,
        {
          client_id: this.options.clientId ?? DEFAULT_GITHUB_CLIENT_ID,
          device_code: input.deviceCode,
          grant_type: DEVICE_CODE_GRANT_TYPE,
        },
        false,
      );

      if (payload.access_token) {
        return this.toTokenPayload(payload);
      }

      switch (payload.error) {
        case "authorization_pending":
          continue;
        case "slow_down":
          intervalMs += 5_000;
          continue;
        case "expired_token":
          throw new OAuthFlowError("The device authorisation code has expired. Please authorise the account again.");
        case "access_denied":
          throw new OAuthFlowError("GitHub denied the device authorisation request.");
        default:
          throw new OAuthFlowError(
            payload.error_description || "GitHub returned an unexpected response while authorising the device.",
          );
      }
    }

    throw new OAuthFlowError("Timed out while waiting for device authorisation.");
  }

  async refreshAccessToken(input: {
    alias: string;
    enterpriseUrl: string | null;
    refreshToken: string;
  }): Promise<OAuthTokenPayload> {
    const payload = await this.exchangeToken(input.enterpriseUrl, {
      client_id: this.options.clientId ?? DEFAULT_GITHUB_CLIENT_ID,
      grant_type: REFRESH_TOKEN_GRANT_TYPE,
      refresh_token: input.refreshToken,
    });

    if (payload.error) {
      throw new RefreshTokenExpiredError(input.alias);
    }

    if (!payload.access_token) {
      throw new OAuthFlowError("GitHub did not return a refreshed access token.");
    }

    return this.toTokenPayload(payload);
  }

  private async exchangeToken(
    enterpriseUrl: string | null,
    body: Record<string, string>,
    throwOnFailure = true,
  ): Promise<TokenResponse> {
    const response = await (this.options.fetch ?? fetch)(this.getAccessTokenUrl(enterpriseUrl), {
      body: JSON.stringify(body),
      headers: this.headers(),
      method: "POST",
    });

    if (!response.ok) {
      if (!throwOnFailure) {
        return { error: await response.text() };
      }

      throw new OAuthFlowError(
        `GitHub token exchange failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as TokenResponse;
  }

  private async requestJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await (this.options.fetch ?? fetch)(url, init);

    if (!response.ok) {
      throw new OAuthFlowError(`GitHub request failed with status ${response.status}.`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private headers(): HeadersInit {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": this.options.userAgent ?? USER_AGENT,
    };
  }

  private getDeviceCodeUrl(enterpriseUrl: string | null): string {
    return enterpriseUrl
      ? `https://${normaliseEnterpriseHost(enterpriseUrl)}/login/device/code`
      : "https://github.com/login/device/code";
  }

  private getAccessTokenUrl(enterpriseUrl: string | null): string {
    return enterpriseUrl
      ? `https://${normaliseEnterpriseHost(enterpriseUrl)}/login/oauth/access_token`
      : "https://github.com/login/oauth/access_token";
  }

  private toTokenPayload(payload: TokenResponse): OAuthTokenPayload {
    const now = (this.options.clock ?? Date.now)();
    const expiresAt = payload.expires_in ? now + payload.expires_in * 1000 : 0;

    return {
      accessToken: payload.access_token ?? "",
      ...(payload.account_id ? { accountId: payload.account_id } : {}),
      expiresAt,
      refreshToken: payload.refresh_token ?? "",
    };
  }

  private readRequiredNumber(record: Record<string, unknown>, key: string): number {
    const value = record[key];

    if (typeof value !== "number") {
      throw new OAuthFlowError(`GitHub response is missing the numeric field \"${key}\".`);
    }

    return value;
  }

  private readRequiredString(record: Record<string, unknown>, key: string): string {
    const value = record[key];

    if (typeof value !== "string") {
      throw new OAuthFlowError(`GitHub response is missing the text field \"${key}\".`);
    }

    return value;
  }
}

export function normaliseEnterpriseHost(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  const candidate = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
  return candidate.hostname.replace(/\/$/, "");
}
