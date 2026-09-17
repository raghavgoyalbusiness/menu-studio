import type { Db, JobSender, Logger, Storage } from "@menu-studio/server-core";
import type { AuthVerifier, LocalMagicLinks } from "./auth/verifier.ts";
import type { ApiEnv } from "./config/env.ts";
import type { BillingProviders } from "./services/billing/provider.ts";
import type { AiClient } from "./services/anthropic.ts";

export interface AppDeps {
  env: ApiEnv;
  db: Db;
  storage: Storage;
  jobs: JobSender;
  /** Null when ANTHROPIC_API_KEY is not configured. */
  ai: AiClient | null;
  auth: AuthVerifier;
  magicLinks: LocalMagicLinks | null;
  billing: BillingProviders;
  logger: Logger;
}

export interface RequestUser {
  sub: string;
  email: string | null;
}

export type AppVariables = {
  requestId: string;
  logger: Logger;
  user: RequestUser;
};

export type AppEnv = { Variables: AppVariables };
