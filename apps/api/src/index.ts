import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";
import { bossSender, createBoss, createDb, createLogger, createStorage, hardenPgBossSchema, waitForDatabase } from "@menu-studio/server-core";
import { createApp } from "./app.ts";
import { LocalMagicLinks, localVerifier, supabaseVerifier } from "./auth/verifier.ts";
import { AI_MODEL } from "./config/ai.ts";
import { parseApiEnv } from "./config/env.ts";
import { AnthropicAiClient } from "./services/anthropic.ts";
import { NotConfiguredProvider } from "./services/billing/provider.ts";
import { RazorpayProvider } from "./services/billing/razorpay.ts";
import { StripeProvider } from "./services/billing/stripe.ts";

const env = parseApiEnv();
const logger = createLogger("api");
if (env.SENTRY_DSN_API) Sentry.init({ dsn: env.SENTRY_DSN_API, environment: env.NODE_ENV, tracesSampleRate: 0.1 });

const db = createDb(env.DATABASE_URL);
await waitForDatabase(db);
const boss = await createBoss(env.DATABASE_URL, (error) => logger.error("pg-boss", { error }));
await hardenPgBossSchema(db.pool);

const app = createApp({
  env,
  db,
  storage: createStorage(env),
  jobs: bossSender(boss),
  ai: env.ANTHROPIC_API_KEY ? new AnthropicAiClient(env.ANTHROPIC_API_KEY) : null,
  auth: env.AUTH_MODE === "supabase" && env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? supabaseVerifier(env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : localVerifier(env.LOCAL_JWT_SECRET),
  magicLinks: env.AUTH_MODE === "local" ? new LocalMagicLinks(env.LOCAL_JWT_SECRET) : null,
  billing: {
    stripe: env.STRIPE_SECRET_KEY ? new StripeProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET) : new NotConfiguredProvider("stripe"),
    razorpay: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? new RazorpayProvider(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET) : new NotConfiguredProvider("razorpay"),
  },
  logger,
});

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  logger.info("api listening", { port: info.port, auth: env.AUTH_MODE, storage: env.STORAGE_MODE, ai: env.ANTHROPIC_API_KEY ? AI_MODEL : "not configured" });
});

const shutdown = async () => {
  logger.info("shutting down");
  server.close();
  await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => undefined);
  await db.close().catch(() => undefined);
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
