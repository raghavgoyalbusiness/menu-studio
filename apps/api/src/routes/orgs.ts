import { countryDefaults, isValidTimeZone } from "@menu-studio/i18n";
import {
  AppError,
  badRequest,
  createOrg,
  createVenue,
  listMembers,
  listVenues,
  paymentRequired,
  slugTaken,
  updateOrg,
  updateVenue,
  writeAudit,
} from "@menu-studio/server-core";
import { canCreateVenue, VenueType } from "@menu-studio/shared";
import { Hono } from "hono";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody, param } from "../middleware/core.ts";
import { requireOrg, requireVenue } from "../services/access.ts";
import { usageDto, usageSnapshot } from "../services/plan.ts";
import { normalizeUpload } from "../services/media.ts";

const Country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "venue"
  );
}

export function orgRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post("/orgs", async (c) => {
    const body = await jsonBody(c, z.object({ name: z.string().trim().min(1).max(120), type: z.enum(["venue", "agency"]), country: Country }));
    const user = c.get("user");
    const org = await deps.db.asUser(user, (q) => createOrg(q, body));
    await deps.db.asService((q) => writeAudit(q, { orgId: org.id, userId: user.sub, action: "create", entity: "organization", entityId: org.id }));
    return c.json(org, 201);
  });

  app.patch("/orgs/:orgId", async (c) => {
    const orgId = param(c, "orgId");
    const body = await jsonBody(
      c,
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        whiteLabel: z.object({ brandName: z.string().max(80).optional(), logoUrl: z.string().max(500).optional(), qrSubdomain: z.string().regex(/^[a-z0-9-]{3,40}$/).optional() }).optional(),
      }),
    );
    const org = await deps.db.asUser(c.get("user"), async (q) => {
      const current = await requireOrg(q, orgId, "owner");
      if (body.whiteLabel && current.type !== "agency") throw badRequest("White-label settings are for agency accounts.");
      await updateOrg(q, orgId, body);
      return requireOrg(q, orgId, "owner");
    });
    return c.json(org);
  });

  app.get("/orgs/:orgId/members", async (c) => {
    const orgId = param(c, "orgId");
    const members = await deps.db.asUser(c.get("user"), async (q) => {
      await requireOrg(q, orgId, "viewer");
      return listMembers(q, orgId);
    });
    return c.json(members);
  });

  app.post("/orgs/:orgId/invites", async (c) => {
    const orgId = param(c, "orgId");
    const body = await jsonBody(c, z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["owner", "editor", "viewer"]) }));
    const token = randomBytes(24).toString("base64url");
    await deps.db.asUser(c.get("user"), async (q) => {
      await requireOrg(q, orgId, "owner");
      await q.query(
        `insert into invites (org_id, kind, email, role, token_hash, expires_at, created_by) values ($1, 'member', $2, $3, $4, now() + interval '14 days', auth.uid())`,
        [orgId, body.email, body.role, createHash("sha256").update(token).digest("hex")],
      );
    });
    return c.json({ inviteUrl: `${deps.env.WEB_URL}/invite?token=${token}` }, 201);
  });

  app.post("/invites/accept", async (c) => {
    const body = await jsonBody(c, z.object({ token: z.string().min(10), targetOrgId: z.string().uuid().optional() }));
    const user = c.get("user");
    const result = await deps.db.asService(async (q) => {
      const { rows } = await q.query<{ id: string; org_id: string; kind: string; venue_id: string | null; role: string; email: string }>(
        `select * from invites where token_hash = $1 and accepted_at is null and expires_at > now() for update`,
        [createHash("sha256").update(body.token).digest("hex")],
      );
      const invite = rows[0];
      if (!invite) throw new AppError(404, "invite_invalid", "This invite has expired or was already used.");
      if (user.email && invite.email !== user.email.toLowerCase()) throw new AppError(403, "invite_email", `This invite was sent to ${invite.email}.`);
      if (invite.kind === "member") {
        await q.query(`insert into memberships (org_id, user_id, role) values ($1, $2, $3) on conflict (org_id, user_id) do update set role = excluded.role`, [
          invite.org_id,
          user.sub,
          invite.role,
        ]);
      } else {
        if (!body.targetOrgId) throw badRequest("Choose which of your organizations should receive this venue.");
        const { rows: owners } = await q.query(`select 1 from memberships where org_id = $1 and user_id = $2 and role = 'owner'`, [body.targetOrgId, user.sub]);
        if (!owners.length) throw new AppError(403, "forbidden", "You must own the receiving organization.");
        await q.query(`update venues set org_id = $2 where id = $1`, [invite.venue_id, body.targetOrgId]);
        await writeAudit(q, { orgId: invite.org_id, userId: user.sub, action: "handoff", entity: "venue", entityId: invite.venue_id, meta: { to: body.targetOrgId } });
      }
      await q.query(`update invites set accepted_at = now() where id = $1`, [invite.id]);
      return { kind: invite.kind, orgId: invite.kind === "member" ? invite.org_id : body.targetOrgId };
    });
    return c.json(result);
  });

  app.get("/orgs/:orgId/usage", async (c) => {
    const orgId = param(c, "orgId");
    const usage = await deps.db.asUser(c.get("user"), async (q) => {
      await requireOrg(q, orgId, "viewer");
      return usageDto(q, orgId);
    });
    return c.json(usage);
  });

  app.get("/venues", async (c) => {
    const orgId = c.req.query("orgId");
    const venues = await deps.db.asUser(c.get("user"), (q) => listVenues(q, orgId && z.string().uuid().safeParse(orgId).success ? orgId : undefined));
    return c.json(venues);
  });

  app.post("/venues", async (c) => {
    const body = await jsonBody(
      c,
      z.object({
        orgId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        venueType: VenueType,
        city: z.string().trim().max(80).nullable().default(null),
        country: Country,
        currency: z.string().regex(/^[A-Z]{3}$/).optional(),
        locale: z.string().min(2).max(35).optional(),
        timezone: z.string().optional(),
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60).optional(),
      }),
    );
    const defaults = countryDefaults(body.country);
    const timezone = body.timezone && isValidTimeZone(body.timezone) ? body.timezone : defaults.timezone;
    const user = c.get("user");
    const venue = await deps.db.asUser(user, async (q) => {
      const org = await requireOrg(q, body.orgId, "owner");
      if (org.type !== "agency") {
        const check = canCreateVenue(await usageSnapshot(q, body.orgId));
        if (!check.allowed) throw paymentRequired(check.reason, check.upgradeTo);
      }
      let slug = body.slug ?? slugify(`${body.name}${body.city ? `-${body.city}` : ""}`);
      for (let i = 2; await slugTaken(q, slug); i++) slug = `${slugify(body.slug ?? body.name)}-${i}`;
      return createVenue(q, {
        orgId: body.orgId,
        name: body.name,
        slug,
        venueType: body.venueType,
        city: body.city,
        country: body.country,
        currency: body.currency ?? defaults.currency,
        locale: body.locale ?? defaults.locale,
        timezone,
      });
    });
    return c.json(venue, 201);
  });

  app.patch("/venues/:venueId", async (c) => {
    const venueId = param(c, "venueId");
    const body = await jsonBody(
      c,
      z.object({
        name: z.string().trim().min(1).max(80).optional(),
        city: z.string().trim().max(80).optional(),
        timezone: z.string().refine(isValidTimeZone, "Unknown time zone").optional(),
        currency: z.string().regex(/^[A-Z]{3}$/).optional(),
        locale: z.string().min(2).max(35).optional(),
      }),
    );
    const venue = await deps.db.asUser(c.get("user"), async (q) => {
      await requireVenue(q, venueId, "editor");
      return updateVenue(q, venueId, body);
    });
    return c.json(venue);
  });

  app.post("/venues/:venueId/logo", async (c) => {
    const venueId = param(c, "venueId");
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) throw badRequest("Attach a logo image as 'file'.");
    const normalized = await normalizeUpload(new Uint8Array(await file.arrayBuffer()), file.type, "logo");
    const key = `logos/${venueId}/${randomBytes(8).toString("hex")}.${normalized.extension}`;
    const venue = await deps.db.asUser(c.get("user"), async (q) => {
      await requireVenue(q, venueId, "editor");
      await deps.storage.put("assets", key, normalized.body, normalized.mime);
      return updateVenue(q, venueId, { logoUrl: `assets:${key}` });
    });
    return c.json(venue);
  });

  return app;
}
