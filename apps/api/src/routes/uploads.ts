import { badRequest, insertUpload, LocalStorage, notFound, toUploadDto, type Bucket } from "@menu-studio/server-core";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { requireOrg, requireProject } from "../services/access.ts";
import { normalizeUpload } from "../services/media.ts";

/** Stored asset references look like "assets:logos/…". Resolve them to a short-lived URL. */
export async function resolveAssetUrl(deps: Pick<AppDeps, "storage">, ref: string | null): Promise<string | null> {
  if (!ref) return null;
  const match = /^(uploads|exports|assets):(.+)$/.exec(ref);
  if (!match) return ref;
  return deps.storage.signedUrl(match[1] as Bucket, match[2] ?? "", 60 * 60 * 24);
}

export function uploadRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post("/uploads", async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) throw badRequest("Attach the file as 'file'.");
    const meta = z
      .object({ orgId: z.string().uuid(), projectId: z.string().uuid().optional(), kind: z.enum(["menu_source", "logo", "reference"]) })
      .parse({ orgId: form.orgId, projectId: form.projectId || undefined, kind: form.kind });
    const user = c.get("user");
    await deps.db.asUser(user, async (q) => {
      if (meta.projectId) {
        const ctx = await requireProject(q, meta.projectId, "editor");
        if (ctx.org.id !== meta.orgId) throw badRequest("Project and organization do not match.");
      } else await requireOrg(q, meta.orgId, "editor");
    });
    const normalized = await normalizeUpload(new Uint8Array(await file.arrayBuffer()), file.type, meta.kind);
    const bucket: Bucket = meta.kind === "logo" ? "assets" : "uploads";
    const key = `${meta.orgId}/${randomUUID()}.${normalized.extension}`;
    await deps.storage.put(bucket, key, normalized.body, normalized.mime);
    const row = await deps.db.asUser(user, (q) =>
      insertUpload(q, {
        orgId: meta.orgId,
        projectId: meta.projectId ?? null,
        storagePath: `${bucket}:${key}`,
        mime: normalized.mime,
        kind: meta.kind,
        sizeBytes: normalized.body.byteLength,
        pageCount: normalized.pageCount,
        createdBy: user.sub,
      }),
    );
    return c.json(toUploadDto(row, await deps.storage.signedUrl(bucket, key, 3600)), 201);
  });

  return app;
}

/** Serves signed local-storage URLs. Only active when files are stored on disk. */
export function localFileRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.get("/files/:bucket/*", async (c) => {
    if (!(deps.storage instanceof LocalStorage)) throw notFound("File");
    const bucket = c.req.param("bucket");
    if (bucket !== "uploads" && bucket !== "exports" && bucket !== "assets") throw notFound("File");
    const key = decodeURIComponent(c.req.path.slice(`/files/${bucket}/`.length));
    const exp = Number(c.req.query("exp"));
    const sig = c.req.query("sig") ?? "";
    const download = c.req.query("download") ?? "";
    if (!deps.storage.verify(bucket, key, exp, sig, download)) throw notFound("File");
    const object = await deps.storage.get(bucket, key);
    if (!object) throw notFound("File");
    c.header("content-type", object.contentType);
    c.header("cache-control", "private, max-age=300");
    if (download) c.header("content-disposition", `attachment; filename="${download.replace(/"/g, "")}"`);
    return c.body(object.body as Uint8Array<ArrayBuffer>);
  });
  return app;
}
