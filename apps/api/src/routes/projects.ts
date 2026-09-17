import {
  AppError,
  badRequest,
  createProject,
  deleteProject,
  getHead,
  insertVersion,
  listConcepts,
  listProjects,
  listVersions,
  requireVersion,
  setHead,
  updateProject,
} from "@menu-studio/server-core";
import {
  buildDefaultSpec,
  defaultBrief,
  DesignBrief,
  Edit,
  inverseEdit,
  uuid,
  type Edit as EditType,
  type MenuDocument,
  type ProjectDetailDto,
} from "@menu-studio/shared";
import { SEED_IDS, SEEDS } from "@menu-studio/shared/seeds";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody, param } from "../middleware/core.ts";
import { requireProject, requireVenue } from "../services/access.ts";
import { commitEdits } from "../services/versions.ts";
import { resolveAssetUrl } from "./uploads.ts";

export function projectRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get("/seeds", (c) =>
    c.json(
      SEED_IDS.map((id) => ({
        id,
        label: SEEDS[id].label,
        venueName: SEEDS[id].document.venueName,
        venueType: SEEDS[id].document.venueType,
        city: SEEDS[id].city,
        currency: SEEDS[id].document.currency,
        archetype: SEEDS[id].spec.archetype,
      })),
    ),
  );

  app.get("/projects", async (c) => {
    const venueId = c.req.query("venueId");
    const projects = await deps.db.asUser(c.get("user"), (q) => listProjects(q, venueId && z.string().uuid().safeParse(venueId).success ? venueId : undefined));
    return c.json(projects);
  });

  app.post("/projects", async (c) => {
    const body = await jsonBody(
      c,
      z.object({
        venueId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        start: z.discriminatedUnion("kind", [z.object({ kind: z.literal("seed"), seedId: z.enum(SEED_IDS) }), z.object({ kind: z.literal("blank") }), z.object({ kind: z.literal("import") })]),
      }),
    );
    const user = c.get("user");
    const detail = await deps.db.asUser(user, async (q): Promise<ProjectDetailDto> => {
      const { venue, org } = await requireVenue(q, body.venueId, "editor");
      const project = await createProject(q, { venueId: venue.id, name: body.name });
      if (body.start.kind === "import") return { project, venue, org, head: null };

      let document: MenuDocument;
      let brief: DesignBrief;
      if (body.start.kind === "seed") {
        const seed = SEEDS[body.start.seedId];
        document = { ...structuredClone(seed.document), id: `doc-${project.id}`, projectId: project.id };
        brief = structuredClone(seed.brief);
      } else {
        document = {
          schemaVersion: 1,
          id: `doc-${project.id}`,
          projectId: project.id,
          venueName: venue.name,
          venueType: venue.venueType,
          currency: venue.currency,
          locale: venue.locale,
          primaryLanguage: venue.locale.split("-")[0] ?? "en",
          additionalLanguages: [],
          footerNotes: [],
          sections: [],
        };
        brief = defaultBrief({ format: venue.country === "US" ? "US_LETTER" : "A4" });
      }
      const spec =
        body.start.kind === "seed"
          ? { ...structuredClone(SEEDS[body.start.seedId].spec), id: uuid() }
          : buildDefaultSpec({ archetype: "classic_list", document, format: brief.format, orientation: brief.orientation });
      const head = await insertVersion(q, { projectId: project.id, baseVersionId: null, document, brief, spec, source: "import", summary: body.start.kind === "seed" ? "Started from a sample menu" : "Started a blank menu", createdBy: user.sub });
      return { project: { ...project, currentVersionId: head.id }, venue, org, head };
    });
    return c.json(detail, 201);
  });

  app.get("/projects/:projectId", async (c) => {
    const projectId = param(c, "projectId");
    const detail = await deps.db.asUser(c.get("user"), async (q): Promise<ProjectDetailDto> => {
      const ctx = await requireProject(q, projectId, "viewer");
      const head = await getHead(q, projectId);
      return { ...ctx, venue: { ...ctx.venue, logoUrl: await resolveAssetUrl(deps, ctx.venue.logoUrl) }, head };
    });
    return c.json(detail);
  });

  app.patch("/projects/:projectId", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(c, z.object({ name: z.string().trim().min(1).max(120).optional(), status: z.enum(["draft", "published", "archived"]).optional() }));
    const project = await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "editor");
      return updateProject(q, projectId, body);
    });
    return c.json(project);
  });

  app.delete("/projects/:projectId", async (c) => {
    const projectId = param(c, "projectId");
    await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "owner");
      await deleteProject(q, projectId);
    });
    return c.body(null, 204);
  });

  app.get("/projects/:projectId/versions", async (c) => {
    const projectId = param(c, "projectId");
    const versions = await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "viewer");
      return listVersions(q, projectId);
    });
    return c.json(versions);
  });

  app.get("/projects/:projectId/versions/:versionId", async (c) => {
    const projectId = param(c, "projectId");
    const versionId = param(c, "versionId");
    const version = await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "viewer");
      return requireVersion(q, projectId, versionId);
    });
    return c.json(version);
  });

  app.post("/projects/:projectId/versions", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(c, z.object({ baseVersionId: z.string().uuid(), edits: z.array(Edit).min(1).max(50), summary: z.string().max(200).optional() }));
    const version = await commitEdits(deps.db, c.get("user"), {
      projectId,
      baseVersionId: body.baseVersionId,
      edits: body.edits,
      source: "manual",
      summary: body.summary ?? null,
    });
    return c.json(version, 201);
  });

  app.put("/projects/:projectId/brief", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(c, z.object({ baseVersionId: z.string().uuid(), brief: DesignBrief }));
    const user = c.get("user");
    const version = await deps.db.asUser(user, async (q) => {
      await requireProject(q, projectId, "editor");
      const head = await getHead(q, projectId);
      if (!head) throw badRequest("Import or start a menu first.");
      return insertVersion(q, {
        projectId,
        baseVersionId: body.baseVersionId,
        document: head.document,
        brief: body.brief,
        spec: head.spec,
        source: "manual",
        summary: "Updated the design brief",
        createdBy: user.sub,
      });
    });
    return c.json(version, 201);
  });

  app.post("/projects/:projectId/head", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(c, z.object({ versionId: z.string().uuid() }));
    const version = await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "editor");
      return setHead(q, projectId, body.versionId);
    });
    return c.json(version);
  });

  app.post("/projects/:projectId/restore", async (c) => {
    const projectId = param(c, "projectId");
    const body = await jsonBody(c, z.object({ versionId: z.string().uuid(), baseVersionId: z.string().uuid() }));
    const user = c.get("user");
    const version = await deps.db.asUser(user, async (q) => {
      await requireProject(q, projectId, "editor");
      const old = await requireVersion(q, projectId, body.versionId);
      return insertVersion(q, {
        projectId,
        baseVersionId: body.baseVersionId,
        document: old.document,
        brief: old.brief,
        spec: old.spec,
        source: "restore",
        summary: `Restored version ${old.seq}`,
        createdBy: user.sub,
      });
    });
    return c.json(version, 201);
  });

  /** Per-edit undo: revert what one version changed, on top of the current head. */
  app.post("/projects/:projectId/versions/:versionId/revert", async (c) => {
    const projectId = param(c, "projectId");
    const versionId = param(c, "versionId");
    const body = await jsonBody(c, z.object({ baseVersionId: z.string().uuid() }));
    const user = c.get("user");
    const { edits, summary } = await deps.db.asUser(user, async (q) => {
      await requireProject(q, projectId, "editor");
      const target = await requireVersion(q, projectId, versionId);
      if (!target.parentVersionId) throw badRequest("The first version cannot be undone.");
      const parent = await requireVersion(q, projectId, target.parentVersionId);
      const out: EditType[] = [];
      const doc = inverseEdit(parent.document, target.document, "document");
      if (doc) out.push(doc);
      if (parent.spec && target.spec) {
        const spec = inverseEdit(parent.spec, target.spec, "spec");
        if (spec) out.push(spec);
      }
      return { edits: out, summary: `Undid: ${target.summary ?? target.instruction ?? `version ${target.seq}`}`.slice(0, 200) };
    });
    if (!edits.length) throw badRequest("That version did not change anything.");
    try {
      const version = await commitEdits(deps.db, user, { projectId, baseVersionId: body.baseVersionId, edits, source: "manual", summary });
      return c.json(version, 201);
    } catch (error) {
      if (error instanceof AppError && error.code === "invalid_edit") {
        throw new AppError(409, "revert_conflict", "Later changes touched the same parts of the menu, so this edit can't be undone on its own. Restore an earlier version instead.");
      }
      throw error;
    }
  });

  app.get("/projects/:projectId/concepts", async (c) => {
    const projectId = param(c, "projectId");
    const batchId = c.req.query("batchId");
    const concepts = await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "viewer");
      return listConcepts(q, projectId, batchId && z.string().uuid().safeParse(batchId).success ? batchId : undefined);
    });
    return c.json(concepts);
  });

  return app;
}
