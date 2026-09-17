import {
  DesignBrief,
  Edit,
  LayoutSpec,
  MenuDocument,
  OverflowReport,
  type ConceptDto,
  type ProjectDto,
  type VersionDto,
  type VersionSource,
  type VersionSummaryDto,
} from "@menu-studio/shared";
import { z } from "zod";
import { AppError, conflict, notFound } from "../../errors.ts";
import type { Queryable } from "../pool.ts";

const iso = (d: Date | string | null): string | null => (d instanceof Date ? d.toISOString() : d);

interface ProjectRow {
  id: string;
  venue_id: string;
  name: string;
  status: ProjectDto["status"];
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

const toProject = (r: ProjectRow): ProjectDto => ({
  id: r.id,
  venueId: r.venue_id,
  name: r.name,
  status: r.status,
  currentVersionId: r.current_version_id,
  createdAt: iso(r.created_at) ?? "",
  updatedAt: iso(r.updated_at) ?? "",
});

interface VersionRow {
  id: string;
  project_id: string;
  parent_version_id: string | null;
  seq: number;
  source: VersionSource;
  instruction: string | null;
  summary: string | null;
  created_by: string | null;
  created_at: Date;
  menu_document?: unknown;
  design_brief?: unknown;
  layout_spec?: unknown;
  edits?: unknown;
}

const toSummary = (r: VersionRow): VersionSummaryDto => ({
  id: r.id,
  projectId: r.project_id,
  parentVersionId: r.parent_version_id,
  seq: r.seq,
  source: r.source,
  instruction: r.instruction,
  summary: r.summary,
  createdBy: r.created_by,
  createdAt: iso(r.created_at) ?? "",
});

/** Stored JSON is re-validated on read, so a schema drift fails loudly instead of rendering garbage. */
function toVersion(r: VersionRow): VersionDto {
  return {
    ...toSummary(r),
    document: MenuDocument.parse(r.menu_document),
    brief: r.design_brief == null ? null : DesignBrief.parse(r.design_brief),
    spec: r.layout_spec == null ? null : LayoutSpec.parse(r.layout_spec),
    edits: r.edits == null ? null : z.array(Edit).parse(r.edits),
  };
}

export async function listProjects(q: Queryable, venueId?: string): Promise<ProjectDto[]> {
  const { rows } = venueId
    ? await q.query<ProjectRow>(`select * from projects where venue_id = $1 order by updated_at desc`, [venueId])
    : await q.query<ProjectRow>(`select * from projects order by updated_at desc limit 200`);
  return rows.map(toProject);
}

export async function getProject(q: Queryable, projectId: string): Promise<ProjectDto | null> {
  const { rows } = await q.query<ProjectRow>(`select * from projects where id = $1`, [projectId]);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function requireProject(q: Queryable, projectId: string): Promise<ProjectDto> {
  const project = await getProject(q, projectId);
  if (!project) throw notFound("Project");
  return project;
}

export async function createProject(q: Queryable, input: { venueId: string; name: string }): Promise<ProjectDto> {
  const { rows } = await q.query<ProjectRow>(`insert into projects (venue_id, name) values ($1, $2) returning *`, [input.venueId, input.name]);
  const row = rows[0];
  if (!row) throw new Error("project insert returned nothing");
  return toProject(row);
}

export async function updateProject(q: Queryable, projectId: string, patch: { name?: string; status?: ProjectDto["status"] }): Promise<ProjectDto | null> {
  const { rows } = await q.query<ProjectRow>(`update projects set name = coalesce($2, name), status = coalesce($3, status) where id = $1 returning *`, [
    projectId,
    patch.name ?? null,
    patch.status ?? null,
  ]);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function deleteProject(q: Queryable, projectId: string): Promise<boolean> {
  const { rowCount } = await q.query(`delete from projects where id = $1`, [projectId]);
  return (rowCount ?? 0) > 0;
}

export interface InsertVersionInput {
  projectId: string;
  /** The version the change was made against; must equal the current head. */
  baseVersionId: string | null;
  document: MenuDocument;
  brief: DesignBrief | null;
  spec: LayoutSpec | null;
  source: VersionSource;
  instruction?: string | null;
  edits?: Edit[] | null;
  summary?: string | null;
  createdBy: string;
  /** Keep the head where it is (used for concept rows that are not selected yet). */
  moveHead?: boolean;
}

/**
 * Insert an immutable version and move the project head, in the caller's transaction.
 * The project row is locked so two concurrent saves cannot both build on the same base.
 */
export async function insertVersion(q: Queryable, input: InsertVersionInput): Promise<VersionDto> {
  const { rows: locked } = await q.query<{ current_version_id: string | null }>(`select current_version_id from projects where id = $1 for update`, [input.projectId]);
  const project = locked[0];
  if (!project) throw notFound("Project");
  if ((project.current_version_id ?? null) !== (input.baseVersionId ?? null)) {
    throw conflict("stale_version", "This menu changed in another window. Reload to see the latest version.");
  }
  const { rows: seqRows } = await q.query<{ seq: number }>(`select coalesce(max(seq), 0) + 1 as seq from spec_versions where project_id = $1`, [input.projectId]);
  const { rows } = await q.query<VersionRow>(
    `insert into spec_versions (project_id, parent_version_id, seq, menu_document, design_brief, layout_spec, source, instruction, edits, summary, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [
      input.projectId,
      input.baseVersionId,
      seqRows[0]?.seq ?? 1,
      JSON.stringify(input.document),
      input.brief ? JSON.stringify(input.brief) : null,
      input.spec ? JSON.stringify(input.spec) : null,
      input.source,
      input.instruction ?? null,
      input.edits ? JSON.stringify(input.edits) : null,
      input.summary ?? null,
      input.createdBy,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("version insert returned nothing");
  if (input.moveHead !== false) {
    await q.query(`update projects set current_version_id = $2 where id = $1`, [input.projectId, row.id]);
  }
  return toVersion(row);
}

export async function getVersion(q: Queryable, versionId: string): Promise<VersionDto | null> {
  const { rows } = await q.query<VersionRow>(`select * from spec_versions where id = $1`, [versionId]);
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function requireVersion(q: Queryable, projectId: string, versionId: string): Promise<VersionDto> {
  const version = await getVersion(q, versionId);
  if (!version || version.projectId !== projectId) throw notFound("Version");
  return version;
}

export async function getHead(q: Queryable, projectId: string): Promise<VersionDto | null> {
  const { rows } = await q.query<VersionRow>(`select v.* from spec_versions v join projects p on p.current_version_id = v.id where p.id = $1`, [projectId]);
  return rows[0] ? toVersion(rows[0]) : null;
}

export async function listVersions(q: Queryable, projectId: string, limit = 100): Promise<VersionSummaryDto[]> {
  const { rows } = await q.query<VersionRow>(
    `select id, project_id, parent_version_id, seq, source, instruction, summary, created_by, created_at from spec_versions where project_id = $1 order by seq desc limit $2`,
    [projectId, limit],
  );
  return rows.map(toSummary);
}

/** Undo/redo: move the head to any version of the project without writing a new row. */
export async function setHead(q: Queryable, projectId: string, versionId: string): Promise<VersionDto> {
  const version = await requireVersion(q, projectId, versionId);
  await q.query(`update projects set current_version_id = $2 where id = $1`, [projectId, versionId]);
  return version;
}

interface ConceptRow {
  id: string;
  project_id: string;
  batch_id: string;
  layout_spec: unknown;
  selected: boolean;
  prompt_version: string | null;
  fit_report: unknown;
  created_at: Date;
}

const toConcept = (r: ConceptRow): ConceptDto => ({
  id: r.id,
  projectId: r.project_id,
  batchId: r.batch_id,
  spec: LayoutSpec.parse(r.layout_spec),
  selected: r.selected,
  promptVersion: r.prompt_version,
  fitReport: r.fit_report == null ? null : OverflowReport.parse(r.fit_report),
  createdAt: iso(r.created_at) ?? "",
});

export async function insertConcepts(
  q: Queryable,
  input: { projectId: string; batchId: string; baseVersionId: string | null; specs: LayoutSpec[]; promptVersion: string },
): Promise<ConceptDto[]> {
  const out: ConceptDto[] = [];
  for (const spec of input.specs) {
    const { rows } = await q.query<ConceptRow>(
      `insert into concepts (project_id, batch_id, base_version_id, layout_spec, prompt_version) values ($1, $2, $3, $4, $5) returning *`,
      [input.projectId, input.batchId, input.baseVersionId, JSON.stringify(spec), input.promptVersion],
    );
    if (rows[0]) out.push(toConcept(rows[0]));
  }
  return out;
}

export async function listConcepts(q: Queryable, projectId: string, batchId?: string): Promise<ConceptDto[]> {
  const { rows } = batchId
    ? await q.query<ConceptRow>(`select * from concepts where project_id = $1 and batch_id = $2 order by created_at`, [projectId, batchId])
    : await q.query<ConceptRow>(
        `select * from concepts where project_id = $1 and batch_id = (select batch_id from concepts where project_id = $1 order by created_at desc limit 1) order by created_at`,
        [projectId],
      );
  return rows.map(toConcept);
}

export async function getConcept(q: Queryable, projectId: string, conceptId: string): Promise<ConceptDto> {
  const { rows } = await q.query<ConceptRow>(`select * from concepts where id = $1 and project_id = $2`, [conceptId, projectId]);
  if (!rows[0]) throw notFound("Concept");
  return toConcept(rows[0]);
}

export async function updateConceptFit(q: Queryable, conceptId: string, spec: LayoutSpec, report: OverflowReport): Promise<void> {
  await q.query(`update concepts set layout_spec = $2, fit_report = $3 where id = $1`, [conceptId, JSON.stringify(spec), JSON.stringify(report)]);
}

export async function markConceptSelected(q: Queryable, conceptId: string): Promise<void> {
  const { rowCount } = await q.query(
    `update concepts set selected = (id = $1) where batch_id = (select batch_id from concepts where id = $1)`,
    [conceptId],
  );
  if (!rowCount) throw new AppError(404, "not_found", "Concept not found");
}
