import { z } from "zod";

export const AliasSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Invalid alias. Use only alphanumeric characters, hyphens, and underscores."
  );

export const AccountDataSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires: z.number(),
  enterpriseUrl: z.string().default(""),
});

export const MappingConfigSchema = z.object({
  default_account: z.string(),
  mappings: z.record(z.string().startsWith("github-copilot/"), AliasSchema),
});

export const AuthLedgerSchema = z.record(AliasSchema, AccountDataSchema);

export const EMPTY_MAPPING_CONFIG = {
  default_account: "",
  mappings: {},
} as const;

export type MappingConfig = z.infer<typeof MappingConfigSchema>;
export type AuthLedger = z.infer<typeof AuthLedgerSchema>;
export type AccountData = z.infer<typeof AccountDataSchema>;
