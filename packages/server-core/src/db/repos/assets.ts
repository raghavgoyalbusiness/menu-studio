import type { ExportDto, ExportFileDto, ExportKind, ExportStatus, PublishedMenuDto, UploadDto } from "@menu-studio/shared";
import { notFound } from "../../errors.ts";
import type { Queryable } from "../pool.ts";

const iso = (d: Date | string | null): string | null => (d instanceof Date ? d.toISOString() : d);

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export interface UploadRow {
  id: string;
  org_id: string;
  project_id: string | null;
  storage_path: string;
  mime: string;
  kind: UploadDto["kind"];
  size_bytes: number;
  page_count: number | null;
  created_at: Date;
}

export async function insertUpload(
  q: Queryable,
  input: { orgId: string; projectId: string | null; storagePath: string; mime: string; kind: UploadDto["kind"]; sizeBytes: number; pageCount: number | null; createdBy: string },
): Promise<UploadRow> {
  const { rows } = await q.query<UploadRow>(
    `insert into uploads (org_id, project_id, storage_path, mime, kind, size_bytes, page_count, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [input.orgId, input.projectId, input.storagePath, input.mime, input.kind, input.sizeBytes, input.pageCount, input.createdBy],
  );
  if (!rows[0]) throw new Error("upload insert returned nothing");
  return rows[0];
}

export async function getUploads(q: Queryable, ids: string[]): Promise<UploadRow[]> {
  const { rows } = await q.query<UploadRow>(`select * from uploads where id = any($1::uuid[])`, [ids]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw notFound("Upload");
    return row;
  });
}

export function toUploadDto(row: UploadRow, url: string): UploadDto {
  return { id: row.id, kind: row.kind, mime: row.mime, sizeBytes: row.size_bytes, pageCount: row.page_count, url, createdAt: iso(row.created_at) ?? "" };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

interface ExportRow {
  id: string;
  project_id: string;
  version_id: string;
  kind: ExportKind;
  status: ExportStatus;
  storage_path: string | null;
  files: ExportFileDto[];
  watermarked: boolean;
  error: string | null;
  created_by: string | null;
  created_at: Date;
  completed_at: Date | null;
}

export const toExport = (r: ExportRow): ExportDto => ({
  id: r.id,
  projectId: r.project_id,
  versionId: r.version_id,
  kind: r.kind,
  status: r.status,
  files: r.files ?? [],
  watermarked: r.watermarked,
  error: r.error,
  createdAt: iso(r.created_at) ?? "",
  completedAt: iso(r.completed_at),
});

export async function insertExport(q: Queryable, input: { projectId: string; versionId: string; kind: ExportKind; watermarked: boolean; createdBy: string }): Promise<ExportDto> {
  const { rows } = await q.query<ExportRow>(
    `insert into exports (project_id, version_id, kind, watermarked, created_by) values ($1, $2, $3, $4, $5) returning *`,
    [input.projectId, input.versionId, input.kind, input.watermarked, input.createdBy],
  );
  if (!rows[0]) throw new Error("export insert returned nothing");
  return toExport(rows[0]);
}

export async function getExport(q: Queryable, exportId: string): Promise<ExportDto | null> {
  const { rows } = await q.query<ExportRow>(`select * from exports where id = $1`, [exportId]);
  return rows[0] ? toExport(rows[0]) : null;
}

export async function listExports(q: Queryable, projectId: string, limit = 20): Promise<ExportDto[]> {
  const { rows } = await q.query<ExportRow>(`select * from exports where project_id = $1 order by created_at desc limit $2`, [projectId, limit]);
  return rows.map(toExport);
}

export async function recentExportsForOrgs(q: Queryable, limit = 10): Promise<(ExportDto & { projectName: string })[]> {
  const { rows } = await q.query<ExportRow & { project_name: string }>(
    `select e.*, p.name as project_name from exports e join projects p on p.id = e.project_id order by e.created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ ...toExport(r), projectName: r.project_name }));
}

export async function updateExportStatus(
  q: Queryable,
  exportId: string,
  patch: { status: ExportStatus; files?: ExportFileDto[]; storagePath?: string | null; error?: string | null },
): Promise<void> {
  await q.query(
    `update exports set status = $2, files = coalesce($3::jsonb, files), storage_path = coalesce($4, storage_path), error = $5,
       completed_at = case when $2 in ('done', 'failed') then now() else completed_at end
     where id = $1`,
    [exportId, patch.status, patch.files ? JSON.stringify(patch.files) : null, patch.storagePath ?? null, patch.error ?? null],
  );
}

// ---------------------------------------------------------------------------
// Published menus
// ---------------------------------------------------------------------------

interface PublishedRow {
  id: string;
  venue_id: string;
  project_id: string;
  version_id: string;
  slug: string;
  is_live: boolean;
  languages: string[];
  theme_mode: PublishedMenuDto["themeMode"];
  published_at: Date;
  venue_slug?: string;
}

export function publishedPath(venueSlug: string, slug: string): string {
  return slug === "main" ? venueSlug : `${venueSlug}/${slug}`;
}

const toPublished = (r: PublishedRow & { venue_slug: string }, menuBaseUrl: string): PublishedMenuDto => ({
  id: r.id,
  venueId: r.venue_id,
  projectId: r.project_id,
  versionId: r.version_id,
  slug: r.slug,
  isLive: r.is_live,
  languages: r.languages,
  themeMode: r.theme_mode,
  publishedAt: iso(r.published_at) ?? "",
  url: `${menuBaseUrl.replace(/\/$/, "")}/${publishedPath(r.venue_slug, r.slug)}`,
});

export async function upsertPublishedMenu(
  q: Queryable,
  input: { venueId: string; projectId: string; versionId: string; slug: string; languages: string[]; themeMode: PublishedMenuDto["themeMode"]; isLive: boolean },
  menuBaseUrl: string,
): Promise<PublishedMenuDto> {
  const { rows } = await q.query<PublishedRow & { venue_slug: string }>(
    `with up as (
       insert into published_menus (venue_id, project_id, version_id, slug, languages, theme_mode, is_live, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (venue_id, slug) do update set project_id = excluded.project_id, version_id = excluded.version_id,
         languages = excluded.languages, theme_mode = excluded.theme_mode, is_live = excluded.is_live, published_at = now()
       returning *
     )
     select up.*, v.slug as venue_slug from up join venues v on v.id = up.venue_id`,
    [input.venueId, input.projectId, input.versionId, input.slug, input.languages, input.themeMode, input.isLive],
  );
  if (!rows[0]) throw new Error("publish upsert returned nothing");
  return toPublished(rows[0], menuBaseUrl);
}

export async function getPublishedMenu(q: Queryable, id: string, menuBaseUrl: string): Promise<PublishedMenuDto | null> {
  const { rows } = await q.query<PublishedRow & { venue_slug: string }>(
    `select pm.*, v.slug as venue_slug from published_menus pm join venues v on v.id = pm.venue_id where pm.id = $1`,
    [id],
  );
  return rows[0] ? toPublished(rows[0], menuBaseUrl) : null;
}

export async function listPublishedMenus(q: Queryable, filter: { venueId?: string; projectId?: string }, menuBaseUrl: string): Promise<PublishedMenuDto[]> {
  const { rows } = await q.query<PublishedRow & { venue_slug: string }>(
    `select pm.*, v.slug as venue_slug from published_menus pm join venues v on v.id = pm.venue_id
      where ($1::uuid is null or pm.venue_id = $1) and ($2::uuid is null or pm.project_id = $2) order by pm.published_at desc`,
    [filter.venueId ?? null, filter.projectId ?? null],
  );
  return rows.map((r) => toPublished(r, menuBaseUrl));
}

export async function publishedMenusForProject(q: Queryable, projectId: string, menuBaseUrl: string): Promise<PublishedMenuDto[]> {
  return listPublishedMenus(q, { projectId }, menuBaseUrl);
}
