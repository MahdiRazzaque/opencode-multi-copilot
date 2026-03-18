export const MULTI_COPILOT_PROVIDER = "multi-copilot";
export const DEFAULT_GITHUB_CLIENT_ID =
  process.env["MULTI_COPILOT_GITHUB_CLIENT_ID"] ?? "Iv1.b507a08c87ecfe98";
export const AUTH_COMMAND_HINT = "Run 'opencode auth multi-copilot' to authenticate";
export const AUTH_COMMAND_RETRY_HINT =
  "Run 'opencode auth multi-copilot' to authenticate again.";
export const USER_AGENT = "opencode-multi-copilot/0.1.0";
export const OAUTH_SCOPE = "read:user";
export const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
export const REFRESH_TOKEN_GRANT_TYPE = "refresh_token";
export const REFRESH_BUFFER_MS = 60_000;
export const DEFAULT_MAPPING_FILE = JSON.stringify(
  {
    default_account: null,
    mappings: {},
  },
  null,
  2,
) + "\n";
