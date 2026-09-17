import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { LocalPublishTarget, S3PublishTarget, type PublishTarget } from "./publish-target.ts";
import { LocalStorage, SupabaseStorage, type Storage } from "./storage.ts";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const DEV_SECRET = "dev-only-secret-change-me-0123456789";

/** Environment shared by the API and the worker. Parsed once at startup; never at import time. */
export const ServerEnv = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@127.0.0.1:54329/menu_studio"),
    AUTH_MODE: z.enum(["local", "supabase"]).default("local"),
    STORAGE_MODE: z.enum(["local", "supabase"]).default("local"),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    LOCAL_JWT_SECRET: z.string().min(16).default(DEV_SECRET),
    PRINT_TOKEN_SECRET: z.string().min(16).default(DEV_SECRET),
    WEB_URL: z.string().url().default("http://127.0.0.1:5223"),
    MENU_URL: z.string().url().default("http://127.0.0.1:5224"),
    API_URL: z.string().url().default("http://127.0.0.1:5323"),
    DATA_DIR: z.string().default(".data"),
    PUBLISH_TARGET: z.enum(["local", "s3"]).default("local"),
    S3_MENU_BUCKET: z.string().optional(),
    CLOUDFRONT_MENU_DISTRIBUTION_ID: z.string().optional(),
    AWS_REGION: z.string().default("eu-west-2"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (env.LOCAL_JWT_SECRET === DEV_SECRET && env.AUTH_MODE === "local") ctx.addIssue({ code: "custom", path: ["LOCAL_JWT_SECRET"], message: "Set a real secret in production" });
      if (env.PRINT_TOKEN_SECRET === DEV_SECRET) ctx.addIssue({ code: "custom", path: ["PRINT_TOKEN_SECRET"], message: "Set a real secret in production" });
    }
    if ((env.AUTH_MODE === "supabase" || env.STORAGE_MODE === "supabase") && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({ code: "custom", path: ["SUPABASE_URL"], message: "Supabase mode needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" });
    }
    if (env.PUBLISH_TARGET === "s3" && !env.S3_MENU_BUCKET) ctx.addIssue({ code: "custom", path: ["S3_MENU_BUCKET"], message: "S3 publishing needs S3_MENU_BUCKET" });
  });
export type ServerEnv = z.infer<typeof ServerEnv>;

export function parseServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const result = ServerEnv.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

export function dataDir(env: ServerEnv): string {
  return isAbsolute(env.DATA_DIR) ? env.DATA_DIR : join(REPO_ROOT, env.DATA_DIR);
}

export function createStorage(env: ServerEnv): Storage {
  if (env.STORAGE_MODE === "supabase" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return new LocalStorage(join(dataDir(env), "storage"), env.API_URL, env.PRINT_TOKEN_SECRET);
}

export function createPublishTarget(env: ServerEnv): PublishTarget {
  if (env.PUBLISH_TARGET === "s3" && env.S3_MENU_BUCKET) {
    return new S3PublishTarget({
      bucket: env.S3_MENU_BUCKET,
      region: env.AWS_REGION,
      ...(env.CLOUDFRONT_MENU_DISTRIBUTION_ID ? { distributionId: env.CLOUDFRONT_MENU_DISTRIBUTION_ID } : {}),
    });
  }
  return new LocalPublishTarget(join(dataDir(env), "published"));
}

export function localPublishDir(env: ServerEnv): string {
  return join(dataDir(env), "published");
}

export function hasMirroredFonts(): boolean {
  return existsSync(join(REPO_ROOT, "packages/design-system/fonts/files"));
}
