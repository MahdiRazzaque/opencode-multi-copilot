export type ModelMapping = {
  defaultAccount: string | null;
  mappings: Record<string, string>;
};

export type StoredAccount = {
  alias: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  enterpriseUrl: string | null;
  accountId?: string;
};

export type AccountCredentials = {
  alias: string;
  accessToken: string;
  enterpriseUrl: string | null;
};

export type DeviceAuthorisationStart = {
  deviceCode: string;
  expiresIn: number;
  interval: number;
  userCode: string;
  verificationUri: string;
};

export type OAuthTokenPayload = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
};
