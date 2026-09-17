import type Anthropic from "@anthropic-ai/sdk";
import {
  AppError,
  badRequest,
  consumeCredit,
  getConcept,
  getHead,
  getUploads,
  insertConcepts,
  insertFeedbackFlag,
  insertVersion,
  markConceptSelected,
  paymentRequired,
  requireVersion,
  updateConceptFit,
  type Bucket,
} from "@menu-studio/server-core";
import {
  ARCHETYPE_IDS,
  ARCHETYPES,
  archetypeEligibility,
  canTranslate,
  canUseAiEdit,
  computeQuadrants,
  defaultBrief,
  diffEdit,
  engineeringEditViolations,
  findItem,
  LayoutSpec,
  OverflowReport,
  PLANS,
  specIntegrity,
  uuid,
  type ArchetypeId,
  type ConceptsResponse,
  type DescribeReferenceResponse,
  type Edit,
  type EditResponse,
  type EngineeringResponse,
  type ExtractResponse,
  type TranslateResponse,
} from "@menu-studio/shared";
import { Edit as EditSchema } from "@menu-studio/shared";
import { Hono } from "hono";
import { z } from "zod";
import { conceptsUserText, ConceptsWire, convertConcepts } from "../ai-wire/concepts.ts";
import { convertEdit, editUserText, EditWire } from "../ai-wire/edit.ts";
import { convertExtraction, ExtractWire, type ExtractResult } from "../ai-wire/extract.ts";
import { convertEngineering, convertTranslation, DescribeWire, engineeringUserText, EngineeringWire, fontWarningFor, translateUserText, TranslateWire } from "../ai-wire/others.ts";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody, param } from "../middleware/core.ts";
import { extractInstruction } from "../prompts/extract/v1.ts";
import { PROMPTS } from "../prompts/index.ts";
import { requireOrg, requireProject } from "../services/access.ts";
import { runStructured } from "../services/anthropic.ts";
import { usageSnapshot } from "../services/plan.ts";
import { commitEdits } from "../services/versions.ts";

type ContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;

async function uploadBlocks(deps: AppDeps, orgId: string, uploadIds: string[], user: { sub: string; email: string | null }): Promise<{ blocks: ContentBlockParam[]; kind: "images" | "pdf" }> {
  const rows = await deps.db.asUser(user, (q) => getUploads(q, uploadIds));
  const blocks: ContentBlockParam[] = [];
  let kind: "images" | "pdf" = "images";
  for (const row of rows) {
    if (row.org_id !== orgId) throw badRequest("That upload belongs to another organization.");
    const [bucket, key] = row.storage_path.split(/:(.+)/) as [Bucket, string];
    const object = await deps.storage.get(bucket, key);
    if (!object) throw badRequest("An uploaded file is missing. Upload it again.");
    const data = Buffer.from(object.body).toString("base64");
    if (row.mime === "application/pdf") {
      kind = "pdf";
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else {
      blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
    }
  }
  return { blocks, kind };
}

function meter(c: { get(key: "user"): { sub: string }; get(key: "requestId"): string }, orgId: string, projectId: string | null) {
  return { orgId, projectId, userId: c.get("user").sub, requestId: c.get("requestId") };
}

const IMPLEMENTED_ARCHETYPES: readonly ArchetypeId[] = ARCHETYPE_IDS;

export function aiRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const ai = { ai: deps.ai, db: deps.db, logger: deps.logger };

  app.post("/extract", async (c) => {
    const body = await jsonBody(
      c,
      z
        .object({
          projectId: z.string().uuid(),
          uploadIds: z.array(z.string().uuid()).max(10).default([]),
          text: z.string().max(60_000).optional(),
        })
        .refine((b) => b.uploadIds.length > 0 || (b.text?.trim().length ?? 0) > 0, "Upload a menu or paste its text."),
    );
    const user = c.get("user");
    const logger = c.get("logger");
    const { ctx, head } = await deps.db.asUser(user, async (q) => ({ ctx: await requireProject(q, body.projectId, "editor"), head: await getHead(q, body.projectId) }));
    const source = body.uploadIds.length ? await uploadBlocks(deps, ctx.org.id, body.uploadIds, user) : null;
    const content: ContentBlockParam[] = [
      ...(source?.blocks ?? []),
      {
        type: "text",
        text: `${extractInstruction({ venueName: ctx.venue.name, venueType: ctx.venue.venueType, country: ctx.venue.country, currency: ctx.venue.currency }, source ? source.kind : "text")}${
          body.text ? `\n\nMenu text:\n${body.text}` : ""
        }`,
      },
    ];
    const result = await runStructured<ExtractWire, ExtractResult>(
      { ...ai, logger },
      {
        endpoint: "extract",
        prompt: PROMPTS.extract,
        content,
        wire: ExtractWire,
        convert: (wire) =>
          convertExtraction(wire, {
            projectId: body.projectId,
            venueName: ctx.venue.name,
            fallbackCurrency: ctx.venue.currency,
            locale: ctx.venue.locale,
            sourceText: source ? null : (body.text ?? null),
          }),
        meter: meter(c, ctx.org.id, body.projectId),
      },
    );
    const version = await deps.db.asUser(user, (q) =>
      insertVersion(q, {
        projectId: body.projectId,
        baseVersionId: head?.id ?? null,
        document: result.value.document,
        brief: head?.brief ?? defaultBrief({ format: ctx.venue.country === "US" ? "US_LETTER" : "A4" }),
        spec: null,
        source: "import",
        summary: `Imported ${result.value.document.sections.reduce((n, s) => n + s.items.length, 0)} items`,
        createdBy: user.sub,
      }),
    );
    const response: ExtractResponse = { version, warnings: result.value.warnings };
    return c.json(response, 201);
  });

  app.post("/describe-reference", async (c) => {
    const body = await jsonBody(c, z.object({ projectId: z.string().uuid(), uploadIds: z.array(z.string().uuid()).min(1).max(6) }));
    const user = c.get("user");
    const ctx = await deps.db.asUser(user, (q) => requireProject(q, body.projectId, "editor"));
    const source = await uploadBlocks(deps, ctx.org.id, body.uploadIds, user);
    const result = await runStructured(
      { ...ai, logger: c.get("logger") },
      {
        endpoint: "describe_reference",
        prompt: PROMPTS.describeReference,
        content: [...source.blocks, { type: "text", text: "Describe the style of these reference menus." }],
        wire: DescribeWire,
        convert: (wire) => ({ ok: true, value: wire }),
        meter: meter(c, ctx.org.id, body.projectId),
      },
    );
    const response: DescribeReferenceResponse = { descriptors: result.value };
    return c.json(response);
  });

  app.post("/concepts", async (c) => {
    const body = await jsonBody(c, z.object({ projectId: z.string().uuid(), referenceConceptId: z.string().uuid().optional() }));
    const user = c.get("user");
    const { ctx, head, reference } = await deps.db.asUser(user, async (q) => ({
      ctx: await requireProject(q, body.projectId, "editor"),
      head: await getHead(q, body.projectId),
      reference: body.referenceConceptId ? await getConcept(q, body.projectId, body.referenceConceptId) : null,
    }));
    if (!head) throw badRequest("Import a menu before generating concepts.");
    if (!head.document.sections.some((s) => s.items.length)) throw badRequest("Add at least one menu item before generating concepts.");
    const brief = head.brief ?? defaultBrief();

    const candidates = IMPLEMENTED_ARCHETYPES.filter((id) => (brief.format === "MOBILE") === (id === "mobile_stack"));
    const allowed: ArchetypeId[] = [];
    const excluded: { id: ArchetypeId; reason: string }[] = [];
    for (const id of candidates) {
      const e = archetypeEligibility(id, head.document, brief.format);
      if (e.eligible) allowed.push(id);
      else excluded.push({ id, reason: e.reason ?? "not suitable" });
    }
    if (!allowed.length) throw badRequest(`No layout suits ${brief.format} for this menu. Try a larger format.`);
    const refAllowed = reference ? allowed.filter((id) => id === reference.spec.archetype) : allowed;
    const effectiveAllowed = refAllowed.length ? refAllowed : allowed;

    const result = await runStructured(
      { ...ai, logger: c.get("logger") },
      {
        endpoint: "concepts",
        prompt: PROMPTS.concepts,
        content: [{ type: "text", text: conceptsUserText({ document: head.document, brief, allowed: effectiveAllowed, excluded, reference: reference?.spec ?? null }) }],
        wire: ConceptsWire,
        convert: (wire) => convertConcepts(wire, { document: head.document, brief, allowed: effectiveAllowed }),
        meter: meter(c, ctx.org.id, body.projectId),
      },
    );
    const batchId = uuid();
    const concepts = await deps.db.asUser(user, (q) =>
      insertConcepts(q, { projectId: body.projectId, batchId, baseVersionId: head.id, specs: result.value, promptVersion: PROMPTS.concepts.version }),
    );
    const response: ConceptsResponse = { batchId, concepts };
    return c.json(response, 201);
  });

  /** The gallery measures and auto-fits concepts in the browser, then stores the fitted spec. */
  app.post("/projects/:projectId/concepts/:conceptId/fit", async (c) => {
    const projectId = param(c, "projectId");
    const conceptId = param(c, "conceptId");
    const body = await jsonBody(c, z.object({ spec: LayoutSpec, report: OverflowReport }));
    await deps.db.asUser(c.get("user"), async (q) => {
      await requireProject(q, projectId, "editor");
      const concept = await getConcept(q, projectId, conceptId);
      const head = await getHead(q, projectId);
      const diff = diffEdit(concept.spec, body.spec, "spec");
      const allowed = /^\/(tokens\/(density|bodyScale)|pages(\/.*)?)$/;
      const disallowed = diff?.ops.filter((op) => !allowed.test(op.path)) ?? [];
      if (disallowed.length) throw badRequest("Fitting may only change density, type scale and pagination.", disallowed.slice(0, 5).map((op) => op.path));
      if (head) {
        const integrity = specIntegrity(body.spec, head.document);
        if (integrity.errors.length) throw badRequest("The fitted layout is inconsistent.", integrity.errors);
      }
      await updateConceptFit(q, conceptId, body.spec, body.report);
    });
    return c.body(null, 204);
  });

  app.post("/projects/:projectId/concepts/:conceptId/select", async (c) => {
    const projectId = param(c, "projectId");
    const conceptId = param(c, "conceptId");
    const body = await jsonBody(c, z.object({ baseVersionId: z.string().uuid() }));
    const user = c.get("user");
    const version = await deps.db.asUser(user, async (q) => {
      await requireProject(q, projectId, "editor");
      const concept = await getConcept(q, projectId, conceptId);
      const head = await getHead(q, projectId);
      if (!head) throw badRequest("This project has no menu yet.");
      const integrity = specIntegrity(concept.spec, head.document);
      if (integrity.errors.length) throw badRequest("This concept no longer matches the menu. Generate new concepts.", integrity.errors);
      const inserted = await insertVersion(q, {
        projectId,
        baseVersionId: body.baseVersionId,
        document: head.document,
        brief: head.brief,
        spec: concept.spec,
        source: "ai_concept",
        summary: `Chose the "${concept.spec.conceptName}" concept`,
        createdBy: user.sub,
      });
      await markConceptSelected(q, conceptId);
      return inserted;
    });
    return c.json(version, 201);
  });

  app.post("/edit", async (c) => {
    const body = await jsonBody(
      c,
      z.object({
        projectId: z.string().uuid(),
        versionId: z.string().uuid(),
        instruction: z.string().trim().min(2).max(1000),
        selection: z.object({ blockIds: z.array(z.string()).max(50).default([]), itemIds: z.array(z.string()).max(100).default([]) }).default({ blockIds: [], itemIds: [] }),
      }),
    );
    const user = c.get("user");
    const { ctx, head, usage } = await deps.db.asUser(user, async (q) => {
      const context = await requireProject(q, body.projectId, "editor");
      return { ctx: context, head: await requireVersion(q, body.projectId, body.versionId), usage: await usageSnapshot(q, context.org.id) };
    });
    if (ctx.project.currentVersionId !== head.id) throw new AppError(409, "stale_version", "This menu changed in another window. Reload to see the latest version.", { retryable: true });
    const check = canUseAiEdit(usage);
    if (!check.allowed) throw paymentRequired(check.reason, check.upgradeTo);
    const planLimit = PLANS[usage.plan].aiEditsPerMonth;
    const needsCredit = planLimit !== null && usage.aiEditsThisMonth >= planLimit;

    const docs = { document: head.document, spec: head.spec };
    const result = await runStructured(
      { ...ai, logger: c.get("logger") },
      {
        endpoint: "edit",
        prompt: PROMPTS.edit,
        content: [{ type: "text", text: editUserText({ document: head.document, spec: head.spec, instruction: body.instruction, selection: body.selection }) }],
        wire: EditWire,
        convert: (wire) => convertEdit(wire, { docs, instruction: body.instruction }),
        meter: meter(c, ctx.org.id, body.projectId),
      },
    );
    const outcome = result.value;
    if (outcome.kind === "clarify") return c.json({ kind: "clarify", question: outcome.question } satisfies EditResponse);
    if (outcome.kind === "unsupported") return c.json({ kind: "unsupported", message: outcome.message } satisfies EditResponse);

    const version = await commitEdits(deps.db, user, {
      projectId: body.projectId,
      baseVersionId: head.id,
      edits: outcome.edits,
      source: "ai_edit",
      instruction: body.instruction,
      summary: outcome.summary,
      strictRefs: true,
    });
    if (needsCredit) await deps.db.asService((q) => consumeCredit(q, ctx.org.id, "ai_edit"));
    const docEdits = outcome.edits.filter((e) => e.target === "document");
    const response: EditResponse = {
      kind: "applied",
      version,
      summary: outcome.summary,
      contentChanged: {
        prices: docEdits.some((e) => e.ops.some((op) => /\/(price|priceVariants)/.test(op.path) && op.op !== "test")),
        names: docEdits.some((e) => e.ops.some((op) => /\/items\/\d+\/name$/.test(op.path) && op.op !== "test")),
        descriptions: docEdits.some((e) => e.ops.some((op) => /\/description$/.test(op.path) && op.op !== "test")),
      },
    };
    return c.json(response);
  });

  app.post("/translate", async (c) => {
    const body = await jsonBody(
      c,
      z.object({ projectId: z.string().uuid(), versionId: z.string().uuid(), languages: z.array(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/)).min(1).max(5) }),
    );
    const user = c.get("user");
    const { ctx, head, usage } = await deps.db.asUser(user, async (q) => {
      const context = await requireProject(q, body.projectId, "editor");
      return { ctx: context, head: await requireVersion(q, body.projectId, body.versionId), usage: await usageSnapshot(q, context.org.id) };
    });
    const languages = [...new Set(body.languages)].filter((l) => l !== head.document.primaryLanguage);
    if (!languages.length) throw badRequest("Choose a language other than the menu's own.");
    const total = new Set([...head.document.additionalLanguages, ...languages]).size;
    const check = canTranslate(usage.plan, total);
    if (!check.allowed) throw paymentRequired(check.reason, check.upgradeTo);

    const result = await runStructured(
      { ...ai, logger: c.get("logger") },
      {
        endpoint: "translate",
        prompt: PROMPTS.translate,
        content: [{ type: "text", text: translateUserText(head.document, languages) }],
        wire: TranslateWire,
        convert: (wire) => convertTranslation(wire, { document: head.document, languages }),
        meter: meter(c, ctx.org.id, body.projectId),
      },
    );
    if (!result.value.edit) throw badRequest("Nothing changed.");
    const version = await commitEdits(deps.db, user, {
      projectId: body.projectId,
      baseVersionId: head.id,
      edits: [result.value.edit],
      source: "ai_edit",
      instruction: `Translate into ${languages.join(", ")}`,
      summary: `Added ${languages.join(", ")} translations`,
    });
    const response: TranslateResponse = { version, fontWarning: fontWarningFor(head.spec, languages) };
    return c.json(response);
  });

  app.post("/engineering/suggest", async (c) => {
    const body = await jsonBody(c, z.object({ projectId: z.string().uuid(), versionId: z.string().uuid() }));
    const user = c.get("user");
    const { ctx, head, usage } = await deps.db.asUser(user, async (q) => {
      const context = await requireProject(q, body.projectId, "editor");
      return { ctx: context, head: await requireVersion(q, body.projectId, body.versionId), usage: await usageSnapshot(q, context.org.id) };
    });
    if (!PLANS[usage.plan].menuEngineering) throw paymentRequired("Menu engineering is part of Pro.", "pro");
    const analysis = computeQuadrants(head.document);
    if (!analysis.results.length) throw badRequest("Add cost prices and popularity (or sales counts) to at least one item first.");

    const results = analysis.results.slice(0, 40);
    const wording = await runStructured(
      { ...ai, logger: c.get("logger") },
      {
        endpoint: "engineering",
        prompt: PROMPTS.engineering,
        content: [{ type: "text", text: engineeringUserText(results, head.document.currency) }],
        wire: EngineeringWire,
        convert: (wire) => convertEngineering(wire, results),
        meter: meter(c, ctx.org.id, body.projectId),
      },
    );
    const messages = new Map(wording.value.map((s) => [s.itemId, s.message]));
    const suggestions = results.map((r) => {
      const found = findItem(head.document, r.itemId);
      const edits: Edit[] = [];
      if (found && (r.quadrant === "star" || r.quadrant === "puzzle")) {
        const base = `/sections/${found.sectionIndex}/items/${found.itemIndex}`;
        edits.push({ target: "document", ops: [{ op: "test", path: `${base}/id`, value: r.itemId }, { op: "replace", path: `${base}/featured`, value: true }] });
        if (head.spec) edits.push({ target: "spec", ops: [{ op: "replace", path: "/engineeringApplied", value: true }] });
      }
      return { id: `${r.itemId}-${r.quadrant}`, itemId: r.itemId, itemName: r.name, quadrant: r.quadrant, message: messages.get(r.itemId) ?? "", edits };
    });
    const response: EngineeringResponse = { analysis, suggestions };
    return c.json(response);
  });

  app.post("/engineering/apply", async (c) => {
    const body = await jsonBody(c, z.object({ projectId: z.string().uuid(), baseVersionId: z.string().uuid(), edits: z.array(EditSchema).min(1).max(20), summary: z.string().max(200) }));
    const version = await commitEdits(deps.db, c.get("user"), {
      projectId: body.projectId,
      baseVersionId: body.baseVersionId,
      edits: body.edits,
      source: "manual",
      summary: body.summary,
      verify: (before, after) =>
        before.spec && after.spec ? engineeringEditViolations(body.edits, { document: before.document, spec: before.spec }, { document: after.document, spec: after.spec }) : [],
    });
    return c.json(version, 201);
  });

  app.post("/feedback", async (c) => {
    const body = await jsonBody(c, z.object({ orgId: z.string().uuid(), projectId: z.string().uuid().nullable().default(null), kind: z.enum(["extraction", "concept", "edit", "export", "other"]), message: z.string().trim().min(3).max(2000) }));
    const user = c.get("user");
    await deps.db.asUser(user, async (q) => {
      await requireOrg(q, body.orgId, "viewer");
      await insertFeedbackFlag(q, { ...body, createdBy: user.sub });
    });
    return c.body(null, 204);
  });

  app.get("/archetypes", (c) => c.json(Object.values(ARCHETYPES)));

  return app;
}
