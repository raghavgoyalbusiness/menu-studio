import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppDeps, AppEnv } from "./deps.ts";
import { errorHandler, requestContext, requireUser } from "./middleware/core.ts";
import { accountRoutes, adminRoutes, agencyRoutes } from "./routes/account.ts";
import { aiRoutes } from "./routes/ai.ts";
import { meRoutes, publicAuthRoutes } from "./routes/auth.ts";
import { billingRoutes, webhookRoutes } from "./routes/billing.ts";
import { exportRoutes, printDataRoutes } from "./routes/exports.ts";
import { orgRoutes } from "./routes/orgs.ts";
import { projectRoutes } from "./routes/projects.ts";
import { analyticsBeaconRoutes, publishRoutes } from "./routes/publish.ts";
import { localFileRoutes, uploadRoutes } from "./routes/uploads.ts";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const origins = new Set([deps.env.WEB_URL, ...deps.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)]);

  app.use("*", requestContext(deps));
  app.onError(errorHandler());
  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

  // Public, cross-origin beacons from QR menus.
  app.use("/analytics/*", cors({ origin: "*", allowMethods: ["POST"], maxAge: 86400 }));
  app.route("/", analyticsBeaconRoutes(deps));

  app.use(
    "*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : null),
      allowHeaders: ["authorization", "content-type", "x-request-id"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      exposeHeaders: ["x-request-id"],
      maxAge: 600,
    }),
  );

  app.get("/health", (c) => c.json({ ok: true, ai: Boolean(deps.ai), auth: deps.auth.mode }));
  app.route("/", publicAuthRoutes(deps));
  app.route("/", printDataRoutes(deps));
  app.route("/", localFileRoutes(deps));
  app.route("/", webhookRoutes(deps));
  app.get("/billing/plans", (c) => billingRoutes(deps).fetch(c.req.raw));

  const authed = new Hono<AppEnv>();
  authed.use("*", requireUser(deps));
  authed.route("/", meRoutes(deps));
  authed.route("/", orgRoutes(deps));
  authed.route("/", projectRoutes(deps));
  authed.route("/", uploadRoutes(deps));
  authed.route("/", aiRoutes(deps));
  authed.route("/", exportRoutes(deps));
  authed.route("/", publishRoutes(deps));
  authed.route("/", billingRoutes(deps));
  authed.route("/", agencyRoutes(deps));
  authed.route("/", adminRoutes(deps));
  authed.route("/", accountRoutes(deps));
  app.route("/", authed);

  return app;
}
