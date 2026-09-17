import { ServerEnv } from "@menu-studio/server-core";
import { z } from "zod";

export const ApiEnv = z.intersection(
  ServerEnv,
  z.object({
    PORT: z.coerce.number().int().default(5323),
    ANTHROPIC_API_KEY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    SENTRY_DSN_API: z.string().optional(),
    /** Comma-separated extra origins allowed by CORS. WEB_URL is always allowed. */
    CORS_ORIGINS: z.string().default(""),
  }),
);
export type ApiEnv = z.infer<typeof ApiEnv>;

export function parseApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const result = ApiEnv.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid API environment:\n${result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return result.data;
}
