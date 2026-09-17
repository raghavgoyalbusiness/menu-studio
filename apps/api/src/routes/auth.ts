import { AppError, isAppAdmin, listOrgs, listVenues, unauthorized } from "@menu-studio/server-core";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody } from "../middleware/core.ts";

export function publicAuthRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get("/auth/config", (c) =>
    c.json({
      mode: deps.auth.mode,
      supabaseUrl: deps.auth.mode === "supabase" ? (deps.env.SUPABASE_URL ?? null) : null,
      supabaseAnonKey: deps.auth.mode === "supabase" ? (deps.env.SUPABASE_ANON_KEY ?? null) : null,
    }),
  );

  app.post("/auth/local/magic-link", async (c) => {
    if (!deps.magicLinks) throw new AppError(404, "not_found", "Local sign-in is disabled; this server uses Supabase Auth.");
    const { email } = await jsonBody(c, z.object({ email: z.string().trim().toLowerCase().email().max(200) }));
    const token = deps.magicLinks.create(email);
    const link = `${deps.env.WEB_URL}/auth/callback?token=${encodeURIComponent(token)}`;
    c.get("logger").info("local magic link issued", { email, link });
    // Local development has no mail server, so the link is returned for the dev UI to show.
    return c.json({ sent: true, devLink: link });
  });

  app.post("/auth/local/verify", async (c) => {
    if (!deps.magicLinks) throw new AppError(404, "not_found", "Local sign-in is disabled.");
    const { token } = await jsonBody(c, z.object({ token: z.string().min(10).max(200) }));
    const email = deps.magicLinks.consume(token);
    if (!email) throw unauthorized("This sign-in link has expired or was already used. Request a new one.");
    const user = await deps.db.asService(async (q) => {
      const { rows } = await q.query<{ id: string; email: string }>(
        `insert into auth.users (email, last_sign_in_at) values ($1, now())
         on conflict (email) do update set last_sign_in_at = now() returning id, email`,
        [email],
      );
      const row = rows[0];
      if (!row) throw new Error("user upsert returned nothing");
      return row;
    });
    return c.json({ accessToken: deps.magicLinks.issue(user), user: { id: user.id, email: user.email } });
  });

  return app;
}

export function meRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.get("/me", async (c) => {
    const user = c.get("user");
    const [orgs, venues, admin] = await Promise.all([
      deps.db.asUser(user, (q) => listOrgs(q)),
      deps.db.asUser(user, (q) => listVenues(q)),
      deps.db.asService((q) => isAppAdmin(q, user.sub)),
    ]);
    return c.json({ user: { id: user.sub, email: user.email, isAdmin: admin }, orgs, venues });
  });
  return app;
}
