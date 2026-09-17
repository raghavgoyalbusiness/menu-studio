import {
  consumeCredit,
  getExport,
  getVenue,
  insertExport,
  listExports,
  notFound,
  QUEUES,
  requireVersion,
  unauthorized,
  type Bucket,
} from "@menu-studio/server-core";
import { exportIsWatermarked, PLANS, verifyPrintToken, type ExportDto } from "@menu-studio/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody, param } from "../middleware/core.ts";
import { requireProject } from "../services/access.ts";
import { usageSnapshot } from "../services/plan.ts";
import { resolveAssetUrl } from "./uploads.ts";

export async function signExportFiles(deps: Pick<AppDeps, "storage">, row: ExportDto): Promise<ExportDto> {
  if (row.status !== "done") return row;
  const files = await Promise.all(
    row.files.map(async (f) => {
      const [bucket, key] = f.path.split(/:(.+)/) as [Bucket, string];
      return { ...f, url: await deps.storage.signedUrl(bucket, key, 3600, f.name) };
    }),
  );
  return { ...row, files };
}

export function exportRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post("/projects/:projectId/exports", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(c, z.object({ versionId: z.string().uuid(), kind: z.enum(["pdf", "pdf_crop_marks", "png", "print_pack"]) }));
    const user = c.get("user");
    const row = await deps.db.asUser(user, async (q) => {
      const ctx = await requireProject(q, projectId, "editor");
      const version = await requireVersion(q, projectId, body.versionId);
      if (!version.spec) throw notFound("Layout");
      const usage = await usageSnapshot(q, ctx.org.id);
      let watermarked = PLANS[usage.plan].watermark;
      if (exportIsWatermarked({ ...usage, exportCredits: 0 }) && usage.exportCredits > 0) {
        // A purchased print pack covers one clean export.
        const spent = await deps.db.asService((sq) => consumeCredit(sq, ctx.org.id, "export"));
        watermarked = !spent;
      }
      return insertExport(q, { projectId, versionId: body.versionId, kind: body.kind, watermarked, createdBy: user.sub });
    });
    await deps.jobs.send(QUEUES.export, { exportId: row.id, requestId: c.get("requestId") });
    return c.json(row, 202);
  });

  app.get("/projects/:projectId/exports", async (c) => {
    const projectId = param(c, "projectId");
    const rows = await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "viewer");
      return listExports(q, projectId);
    });
    return c.json(await Promise.all(rows.map((r) => signExportFiles(deps, r))));
  });

  app.get("/exports/:exportId", async (c) => {
    const exportId = param(c, "exportId");
    const row = await deps.db.asUser(c.get("user"), (q) => getExport(q, exportId));
    if (!row) throw notFound("Export");
    return c.json(await signExportFiles(deps, row));
  });

  return app;
}

/** Public: the print route fetches its data with a short-lived signed token issued to the worker. */
export function printDataRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.get("/print-data", async (c) => {
    const token = c.req.query("token") ?? "";
    const claims = await verifyPrintToken(token, deps.env.PRINT_TOKEN_SECRET);
    if (!claims) throw unauthorized("This print link has expired.");
    const data = await deps.db.asService(async (q) => {
      const version = await requireVersion(q, claims.projectId, claims.versionId);
      const { rows } = await q.query<{ venue_id: string }>(`select venue_id from projects where id = $1`, [claims.projectId]);
      const venue = rows[0] ? await getVenue(q, rows[0].venue_id) : null;
      return { version, venue };
    });
    if (!data.version.spec) throw notFound("Layout");
    c.header("cache-control", "no-store");
    return c.json({
      document: data.version.document,
      spec: data.version.spec,
      logoUrl: await resolveAssetUrl(deps, data.venue?.logoUrl ?? null),
      timezone: data.venue?.timezone ?? "UTC",
    });
  });
  return app;
}
