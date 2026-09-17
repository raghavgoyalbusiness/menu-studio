import { createClient } from "@supabase/supabase-js";
import {
  AppError,
  adminOverview,
  badRequest,
  forbidden,
  isAppAdmin,
  listProjects,
  listPublishedMenus,
  listVenues,
  paymentRequired,
  QUEUES,
  writeAudit,
} from "@menu-studio/server-core";
import { PLANS } from "@menu-studio/shared";
import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody, param } from "../middleware/core.ts";
import { requireOrg } from "../services/access.ts";

export function agencyRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get("/agency/:orgId/clients", async (c) => {
    const orgId = param(c, "orgId");
    const clients = await deps.db.asUser(c.get("user"), async (q) => {
      const org = await requireOrg(q, orgId, "viewer");
      if (org.type !== "agency") throw badRequest("This is not an agency account.");
      const venues = await listVenues(q, orgId);
      return Promise.all(
        venues.map(async (venue) => ({
          venue,
          projects: await listProjects(q, venue.id),
          published: await listPublishedMenus(q, { venueId: venue.id }, deps.env.MENU_URL),
        })),
      );
    });
    return c.json(clients);
  });

  app.post("/agency/:orgId/bulk-export", async (c) => {
    const orgId = param(c, "orgId");
    const body = await jsonBody(c, z.object({ venueIds: z.array(z.string().uuid()).min(1).max(200), kind: z.enum(["pdf", "pdf_crop_marks", "png", "print_pack"]) }));
    const user = c.get("user");
    await deps.db.asUser(user, async (q) => {
      const org = await requireOrg(q, orgId, "editor");
      if (!PLANS[org.plan].bulkExport) throw paymentRequired("Bulk export is part of the Agency plan.", "agency");
      const { rows } = await q.query<{ id: string }>(`select id from venues where org_id = $1 and id = any($2::uuid[])`, [orgId, body.venueIds]);
      if (rows.length !== body.venueIds.length) throw badRequest("Some venues do not belong to this agency.");
    });
    await deps.jobs.send(QUEUES.bulkExport, { orgId, userId: user.sub, venueIds: body.venueIds, kind: body.kind, requestId: c.get("requestId") });
    return c.json({ queued: body.venueIds.length }, 202);
  });

  app.post("/agency/:orgId/handoff", async (c) => {
    const orgId = param(c, "orgId");
    const body = await jsonBody(c, z.object({ venueId: z.string().uuid(), email: z.string().trim().toLowerCase().email() }));
    const token = randomBytes(24).toString("base64url");
    const user = c.get("user");
    await deps.db.asUser(user, async (q) => {
      const org = await requireOrg(q, orgId, "owner");
      if (org.type !== "agency") throw badRequest("Handoff is for agency accounts.");
      const { rows } = await q.query(`select 1 from venues where id = $1 and org_id = $2`, [body.venueId, orgId]);
      if (!rows.length) throw badRequest("That venue does not belong to this agency.");
      await q.query(
        `insert into invites (org_id, kind, venue_id, email, role, token_hash, expires_at, created_by) values ($1, 'venue_handoff', $2, $3, 'owner', $4, now() + interval '30 days', auth.uid())`,
        [orgId, body.venueId, body.email, createHash("sha256").update(token).digest("hex")],
      );
    });
    return c.json({ inviteUrl: `${deps.env.WEB_URL}/invite?token=${token}&handoff=1` }, 201);
  });

  return app;
}

export function adminRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.get("/admin/overview", async (c) => {
    const user = c.get("user");
    const admin = await deps.db.asService((q) => isAppAdmin(q, user.sub));
    if (!admin) throw forbidden("Internal admins only.");
    return c.json(await deps.db.asService((q) => adminOverview(q)));
  });
  return app;
}

/** GDPR: data export and account deletion. */
export function accountRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get("/account/export", async (c) => {
    const user = c.get("user");
    const data = await deps.db.asService(async (q) => {
      const orgs = await q.query(`select o.*, m.role from organizations o join memberships m on m.org_id = o.id where m.user_id = $1`, [user.sub]);
      const orgIds = orgs.rows.map((o: { id: string }) => o.id);
      const venues = await q.query(`select * from venues where org_id = any($1::uuid[])`, [orgIds]);
      const projects = await q.query(`select p.* from projects p join venues v on v.id = p.venue_id where v.org_id = any($1::uuid[])`, [orgIds]);
      const projectIds = projects.rows.map((p: { id: string }) => p.id);
      const versions = await q.query(`select * from spec_versions where project_id = any($1::uuid[]) order by project_id, seq`, [projectIds]);
      const published = await q.query(`select * from published_menus where project_id = any($1::uuid[])`, [projectIds]);
      const flags = await q.query(`select * from feedback_flags where created_by = $1`, [user.sub]);
      return { user: { id: user.sub, email: user.email }, organizations: orgs.rows, venues: venues.rows, projects: projects.rows, versions: versions.rows, publishedMenus: published.rows, feedback: flags.rows };
    });
    c.header("content-disposition", `attachment; filename="menu-studio-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(data);
  });

  app.delete("/account", async (c) => {
    const { confirm } = await jsonBody(c, z.object({ confirm: z.literal("DELETE") }));
    if (confirm !== "DELETE") throw badRequest("Type DELETE to confirm.");
    const user = c.get("user");
    await deps.db.asService(async (q) => {
      const { rows } = await q.query<{ org_id: string; owners: string }>(
        `select m.org_id, (select count(*) from memberships x where x.org_id = m.org_id and x.role = 'owner')::text as owners
           from memberships m where m.user_id = $1 and m.role = 'owner'`,
        [user.sub],
      );
      for (const row of rows) {
        if (Number(row.owners) <= 1) {
          await writeAudit(q, { orgId: null, userId: null, action: "delete", entity: "organization", entityId: row.org_id, meta: { reason: "account_deletion" } });
          await q.query(`delete from organizations where id = $1`, [row.org_id]);
        }
      }
      await q.query(`delete from memberships where user_id = $1`, [user.sub]);
      if (deps.auth.mode === "local") await q.query(`delete from auth.users where id = $1`, [user.sub]);
    });
    if (deps.auth.mode === "supabase") {
      if (!deps.env.SUPABASE_URL || !deps.env.SUPABASE_SERVICE_ROLE_KEY) throw new AppError(503, "not_configured", "Account deletion needs the Supabase service key.");
      const admin = createClient(deps.env.SUPABASE_URL, deps.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { error } = await admin.auth.admin.deleteUser(user.sub);
      if (error) throw new AppError(502, "delete_failed", "Your data was deleted but the login could not be removed. Contact support.");
    }
    return c.body(null, 204);
  });

  return app;
}
