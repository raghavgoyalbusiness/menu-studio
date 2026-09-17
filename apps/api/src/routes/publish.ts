import {
  analyticsFor,
  getHead,
  getPublishedMenu,
  listPublishedMenus,
  notFound,
  paymentRequired,
  publishedMenusForProject,
  QUEUES,
  recordItemOpen,
  recordView,
  requireVersion,
  tooManyRequests,
  updateProject,
  upsertPublishedMenu,
} from "@menu-studio/server-core";
import { canPublishQr, findItem, type AnalyticsDto, type Edit, type JsonPatchOp } from "@menu-studio/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody, param } from "../middleware/core.ts";
import { requireProject, requireVenue } from "../services/access.ts";
import { usageSnapshot } from "../services/plan.ts";
import { commitEdits } from "../services/versions.ts";

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40);

export function publishRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post("/projects/:projectId/publish", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(
      c,
      z.object({
        versionId: z.string().uuid(),
        slug: Slug.default("main"),
        languages: z.array(z.string()).max(8).default([]),
        themeMode: z.enum(["match_print", "mobile_optimized"]).default("mobile_optimized"),
        isLive: z.boolean().default(true),
      }),
    );
    const user = c.get("user");
    const published = await deps.db.asUser(user, async (q) => {
      const ctx = await requireProject(q, projectId, "editor");
      const usage = await usageSnapshot(q, ctx.org.id);
      const check = canPublishQr(usage.plan);
      if (!check.allowed) throw paymentRequired(check.reason, check.upgradeTo);
      const version = await requireVersion(q, projectId, body.versionId);
      const languages = body.languages.filter((l) => l === version.document.primaryLanguage || version.document.additionalLanguages.includes(l));
      const row = await upsertPublishedMenu(
        q,
        { venueId: ctx.venue.id, projectId, versionId: version.id, slug: body.slug, languages, themeMode: body.themeMode, isLive: body.isLive },
        deps.env.MENU_URL,
      );
      await updateProject(q, projectId, { status: "published" });
      return row;
    });
    await deps.jobs.send(QUEUES.publish, { publishedMenuId: published.id, requestId: c.get("requestId") });
    return c.json(published, 202);
  });

  app.get("/projects/:projectId/published", async (c) => {
    const projectId = param(c, "projectId");
    const rows = await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "viewer");
      return publishedMenusForProject(q, projectId, deps.env.MENU_URL);
    });
    return c.json(rows);
  });

  app.get("/venues/:venueId/published", async (c) => {
    const venueId = param(c, "venueId");
    const rows = await deps.db.asUser(c.get("user"), async (q) => {
      await requireVenue(q, venueId, "viewer");
      return listPublishedMenus(q, { venueId }, deps.env.MENU_URL);
    });
    return c.json(rows);
  });

  app.patch("/published/:publishedId", async (c) => {
    const publishedId = param(c, "publishedId");
    const body = await jsonBody(c, z.object({ isLive: z.boolean() }));
    const row = await deps.db.asUser(c.get("user"), async (q) => {
      const current = await getPublishedMenu(q, publishedId, deps.env.MENU_URL);
      if (!current) throw notFound("Published menu");
      await requireVenue(q, current.venueId, "editor");
      await q.query(`update published_menus set is_live = $2 where id = $1`, [publishedId, body.isLive]);
      return { ...current, isLive: body.isLive };
    });
    await deps.jobs.send(QUEUES.publish, { publishedMenuId: publishedId, requestId: c.get("requestId") });
    return c.json(row);
  });

  app.get("/published/:publishedId/analytics", async (c) => {
    const publishedId = param(c, "publishedId");
    const days = Math.min(90, Math.max(1, Number(c.req.query("days") ?? 30) || 30));
    const result = await deps.db.asUser(c.get("user"), async (q): Promise<AnalyticsDto> => {
      const menu = await getPublishedMenu(q, publishedId, deps.env.MENU_URL);
      if (!menu) throw notFound("Published menu");
      const version = await requireVersion(q, menu.projectId, menu.versionId);
      const raw = await analyticsFor(q, publishedId, days);
      return { ...raw, topItems: raw.topItems.map((t) => ({ ...t, name: findItem(version.document, t.itemId)?.item.name ?? "Removed item" })) };
    });
    return c.json(result);
  });

  /** Price changes and 86'ing without opening the editor; republishes live menus immediately. */
  app.post("/projects/:projectId/quick-edit", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(
      c,
      z.object({
        baseVersionId: z.string().uuid(),
        changes: z
          .array(z.object({ itemId: z.string(), price: z.int().min(0).nullable().optional(), available: z.boolean().optional() }))
          .min(1)
          .max(200),
      }),
    );
    const user = c.get("user");
    const head = await deps.db.asUser(user, async (q) => {
      await requireProject(q, projectId, "editor");
      return getHead(q, projectId);
    });
    if (!head) throw notFound("Menu");
    const ops: JsonPatchOp[] = [];
    const described: string[] = [];
    for (const change of body.changes) {
      const found = findItem(head.document, change.itemId);
      if (!found) continue;
      const base = `/sections/${found.sectionIndex}/items/${found.itemIndex}`;
      ops.push({ op: "test", path: `${base}/id`, value: change.itemId });
      if (change.price !== undefined && found.item.priceVariants.length === 0) {
        ops.push({ op: "replace", path: `${base}/price`, value: change.price });
        described.push(`${found.item.name} price`);
      }
      if (change.available !== undefined) {
        ops.push({ op: "replace", path: `${base}/available`, value: change.available });
        described.push(`${found.item.name} ${change.available ? "back on" : "86'd"}`);
      }
    }
    if (!described.length) return c.json({ version: head, republished: [] });
    const edits: Edit[] = [{ target: "document", ops }];
    const version = await commitEdits(deps.db, user, {
      projectId,
      baseVersionId: body.baseVersionId,
      edits,
      source: "manual",
      summary: `Quick edit: ${described.slice(0, 4).join(", ")}${described.length > 4 ? ` and ${described.length - 4} more` : ""}`.slice(0, 200),
    });
    const republished = await deps.db.asUser(user, async (q) => {
      const live = (await publishedMenusForProject(q, projectId, deps.env.MENU_URL)).filter((p) => p.isLive);
      for (const p of live) await q.query(`update published_menus set version_id = $2, published_at = now() where id = $1`, [p.id, version.id]);
      return live.map((p) => ({ ...p, versionId: version.id }));
    });
    for (const p of republished) await deps.jobs.send(QUEUES.publish, { publishedMenuId: p.id, requestId: c.get("requestId") });
    return c.json({ version, republished });
  });

  return app;
}

/** Anonymous QR analytics beacons: no cookies, no IP or user agent stored. */
export function analyticsBeaconRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const buckets = new Map<string, { tokens: number; at: number }>();
  const allow = (key: string) => {
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: 60, at: now };
    bucket.tokens = Math.min(60, bucket.tokens + ((now - bucket.at) / 1000) * 10);
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    if (buckets.size > 10_000) buckets.clear();
    return true;
  };
  const Beacon = z.object({
    m: z.string().uuid(),
    lang: z.string().max(12).nullable().optional(),
    device: z.enum(["mobile", "tablet", "desktop"]).nullable().optional(),
    ref: z.enum(["qr", "direct", "search", "social", "other"]).nullable().optional(),
    item: z.string().max(20).optional(),
  });

  const parse = async (raw: string) => Beacon.parse(JSON.parse(raw || "{}"));

  app.post("/analytics/view", async (c) => {
    const beacon = await parse(await c.req.text());
    if (!allow(beacon.m)) throw tooManyRequests("Slow down");
    await deps.db.asService((q) => recordView(q, { publishedMenuId: beacon.m, lang: beacon.lang ?? null, device: beacon.device ?? null, referrer: beacon.ref ?? null })).catch(() => undefined);
    return c.body(null, 204);
  });

  app.post("/analytics/item", async (c) => {
    const beacon = await parse(await c.req.text());
    if (!beacon.item || !allow(beacon.m)) return c.body(null, 204);
    await deps.db.asService((q) => recordItemOpen(q, beacon.m, beacon.item ?? "")).catch(() => undefined);
    return c.body(null, 204);
  });

  return app;
}
