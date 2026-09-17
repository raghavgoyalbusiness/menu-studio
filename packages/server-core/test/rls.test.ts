import { SEEDS } from "@menu-studio/shared/seeds";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createOrg,
  createProject,
  createVenue,
  hardenPgBossSchema,
  insertVersion,
  pgErrorCode,
  tablesWithoutRls,
  type AuthClaims,
  type Db,
  type Queryable,
} from "../src/index.ts";
import { createBoss } from "../src/jobs.ts";
import { connectTestDb, createTestUser } from "../src/testing/index.ts";

let db: Db;
let owner: AuthClaims;
let editor: AuthClaims;
let viewer: AuthClaims;
let outsider: AuthClaims;
let orgId: string;
let venueId: string;
let projectId: string;
let versionId: string;
let publishedId: string;

async function expectDenied(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(pgErrorCode(error)).toBe("42501");
    return;
  }
  throw new Error("Expected the query to be denied by RLS");
}

const count = async (claims: AuthClaims, sql: string, params: unknown[] = []) =>
  db.asUser(claims, async (q: Queryable) => (await q.query(sql, params)).rowCount ?? 0);

beforeAll(async () => {
  db = connectTestDb(inject("databaseUrl"));
  [owner, editor, viewer, outsider] = await Promise.all([
    createTestUser(db, "owner"),
    createTestUser(db, "editor"),
    createTestUser(db, "viewer"),
    createTestUser(db, "outsider"),
  ]);

  const org = await db.asUser(owner, (q) => createOrg(q, { name: "Haveli Group", type: "venue", country: "IN" }));
  orgId = org.id;
  await db.asUser(owner, async (q) => {
    await q.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'editor'), ($1, $3, 'viewer')`, [orgId, editor.sub, viewer.sub]);
  });
  const venue = await db.asUser(owner, (q) =>
    createVenue(q, { orgId, name: "Haveli Rasoi", slug: `haveli-${Date.now()}`, venueType: "restaurant", city: "Delhi", country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata" }),
  );
  venueId = venue.id;
  const project = await db.asUser(editor, (q) => createProject(q, { venueId, name: "Dinner menu" }));
  projectId = project.id;
  const seed = SEEDS["restaurant-delhi"];
  const version = await db.asUser(editor, (q) =>
    insertVersion(q, { projectId, baseVersionId: null, document: { ...seed.document, projectId }, brief: seed.brief, spec: seed.spec, source: "import", createdBy: editor.sub }),
  );
  versionId = version.id;
  const published = await db.asUser(editor, async (q) => {
    const { rows } = await q.query<{ id: string }>(`insert into published_menus (venue_id, project_id, version_id) values ($1, $2, $3) returning id`, [venueId, projectId, versionId]);
    return rows[0]?.id ?? "";
  });
  publishedId = published;
  await db.asService(async (q) => {
    await q.query(`insert into menu_views (published_menu_id, lang) values ($1, 'en')`, [publishedId]);
    await q.query(`insert into item_clicks (published_menu_id, item_id, date, count) values ($1, 'itm_hr000001', current_date, 3)`, [publishedId]);
    await q.query(`insert into ai_usage (org_id, endpoint, status) values ($1, 'concepts', 'succeeded')`, [orgId]);
    await q.query(`insert into subscriptions (org_id, provider, plan, status) values ($1, 'razorpay', 'pro', 'active')`, [orgId]);
    await q.query(`insert into billing_events (provider, event_id, type, payload) values ('razorpay', 'evt_1', 'subscription.activated', '{}')`);
    await q.query(`insert into audit_log (org_id, user_id, action, entity) values ($1, $2, 'publish', 'project')`, [orgId, editor.sub]);
    await q.query(`insert into app_admins (user_id) values ($1)`, [outsider.sub]);
  });
});

afterAll(async () => {
  await db.close();
});

describe("RLS coverage", () => {
  it("enables RLS on every public table", async () => {
    expect(await tablesWithoutRls(db.pool, ["public"])).toEqual([]);
  });

  it("enables RLS on pg-boss tables after hardening", async () => {
    const boss = await createBoss(inject("databaseUrl"), () => undefined);
    await hardenPgBossSchema(db.pool);
    expect(await tablesWithoutRls(db.pool, ["pgboss"])).toEqual([]);
    await boss.stop({ graceful: false });
  });
});

describe("organizations and memberships", () => {
  it("members see their org; outsiders do not", async () => {
    for (const member of [owner, editor, viewer]) expect(await count(member, `select 1 from organizations where id = $1`, [orgId])).toBe(1);
    expect(await count(outsider, `select 1 from organizations where id = $1`, [orgId])).toBe(0);
  });

  it("only owners rename the org", async () => {
    expect(await count(editor, `update organizations set name = 'x' where id = $1`, [orgId])).toBe(0);
    expect(await count(owner, `update organizations set name = 'Haveli Hospitality' where id = $1`, [orgId])).toBe(1);
  });

  it("only owners add members", async () => {
    const newcomer = await createTestUser(db, "newcomer");
    await expectDenied(db.asUser(editor, (q) => q.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'viewer')`, [orgId, newcomer.sub])));
    expect(await count(owner, `insert into memberships (org_id, user_id, role) values ($1, $2, 'viewer')`, [orgId, newcomer.sub])).toBe(1);
    expect(await count(viewer, `select 1 from memberships where org_id = $1`, [orgId])).toBe(4);
    expect(await count(outsider, `select 1 from memberships where org_id = $1`, [orgId])).toBe(0);
  });
});

describe("venues", () => {
  it("viewers read, editors update, only owners create", async () => {
    expect(await count(viewer, `select 1 from venues where id = $1`, [venueId])).toBe(1);
    expect(await count(outsider, `select 1 from venues where id = $1`, [venueId])).toBe(0);
    await expectDenied(
      db.asUser(editor, (q) =>
        q.query(`insert into venues (org_id, name, slug, venue_type, country, currency, locale) values ($1, 'x', $2, 'cafe', 'IN', 'INR', 'en-IN')`, [orgId, `x-${Date.now()}`]),
      ),
    );
    expect(await count(editor, `update venues set city = 'New Delhi' where id = $1`, [venueId])).toBe(1);
    expect(await count(viewer, `update venues set city = 'Nope' where id = $1`, [venueId])).toBe(0);
  });
});

describe("projects and versions", () => {
  it("editors create projects; viewers and outsiders cannot", async () => {
    await expectDenied(db.asUser(viewer, (q) => createProject(q, { venueId, name: "nope" })));
    await expectDenied(db.asUser(outsider, (q) => createProject(q, { venueId, name: "nope" })));
    expect(await count(outsider, `select 1 from projects where id = $1`, [projectId])).toBe(0);
    expect(await count(viewer, `select 1 from projects where id = $1`, [projectId])).toBe(1);
  });

  it("versions are readable by members, insertable by editors, and immutable", async () => {
    expect(await count(viewer, `select 1 from spec_versions where project_id = $1`, [projectId])).toBe(1);
    expect(await count(outsider, `select 1 from spec_versions where project_id = $1`, [projectId])).toBe(0);
    await expectDenied(
      db.asUser(viewer, (q) => q.query(`insert into spec_versions (project_id, seq, menu_document, source, created_by) values ($1, 99, '{}', 'manual', $2)`, [projectId, viewer.sub])),
    );
    expect(await count(owner, `update spec_versions set summary = 'rewritten' where id = $1`, [versionId])).toBe(0);
    expect(await count(owner, `delete from spec_versions where id = $1`, [versionId])).toBe(0);
  });

  it("an editor cannot forge created_by", async () => {
    await expectDenied(
      db.asUser(editor, (q) => q.query(`insert into spec_versions (project_id, seq, menu_document, source, created_by) values ($1, 98, '{}', 'manual', $2)`, [projectId, owner.sub])),
    );
  });

  it("rejects saves against a stale base version", async () => {
    const seed = SEEDS["restaurant-delhi"];
    await expect(
      db.asUser(editor, (q) => insertVersion(q, { projectId, baseVersionId: null, document: { ...seed.document, projectId }, brief: null, spec: seed.spec, source: "manual", createdBy: editor.sub })),
    ).rejects.toMatchObject({ code: "stale_version" });
  });
});

describe("concepts, uploads, exports, published menus", () => {
  it("follows viewer read / editor write", async () => {
    const seed = SEEDS["restaurant-delhi"];
    const insertConcept = (claims: AuthClaims) =>
      db.asUser(claims, (q) => q.query(`insert into concepts (project_id, batch_id, layout_spec) values ($1, gen_random_uuid(), $2)`, [projectId, JSON.stringify(seed.spec)]));
    await expectDenied(insertConcept(viewer));
    await insertConcept(editor);
    expect(await count(viewer, `select 1 from concepts where project_id = $1`, [projectId])).toBe(1);
    expect(await count(outsider, `select 1 from concepts where project_id = $1`, [projectId])).toBe(0);

    const insertUpload = (claims: AuthClaims) =>
      db.asUser(claims, (q) => q.query(`insert into uploads (org_id, project_id, storage_path, mime, kind, size_bytes) values ($1, $2, 'a/b.jpg', 'image/jpeg', 'menu_source', 10)`, [orgId, projectId]));
    await expectDenied(insertUpload(viewer));
    await expectDenied(insertUpload(outsider));
    await insertUpload(editor);

    const insertExport = (claims: AuthClaims) =>
      db.asUser(claims, (q) => q.query(`insert into exports (project_id, version_id, kind) values ($1, $2, 'pdf')`, [projectId, versionId]));
    await expectDenied(insertExport(viewer));
    await insertExport(editor);
    expect(await count(editor, `update exports set status = 'done' where project_id = $1`, [projectId])).toBe(0);
    expect(await count(viewer, `select 1 from exports where project_id = $1`, [projectId])).toBe(1);

    expect(await count(viewer, `select 1 from published_menus where id = $1`, [publishedId])).toBe(1);
    expect(await count(viewer, `update published_menus set is_live = false where id = $1`, [publishedId])).toBe(0);
    expect(await count(outsider, `select 1 from published_menus where id = $1`, [publishedId])).toBe(0);
  });
});

describe("analytics, usage and billing", () => {
  it("members read analytics; nobody writes it directly", async () => {
    expect(await count(viewer, `select 1 from menu_views where published_menu_id = $1`, [publishedId])).toBe(1);
    expect(await count(viewer, `select 1 from item_clicks where published_menu_id = $1`, [publishedId])).toBe(1);
    expect(await count(outsider, `select 1 from menu_views where published_menu_id = $1`, [publishedId])).toBe(0);
    await expectDenied(db.asUser(owner, (q) => q.query(`insert into menu_views (published_menu_id) values ($1)`, [publishedId])));
    await expectDenied(db.asUser(owner, (q) => q.query(`insert into menu_view_daily (published_menu_id, date, views) values ($1, current_date, 1)`, [publishedId])));
  });

  it("usage, subscriptions and credits are read-only to members", async () => {
    for (const table of ["ai_usage", "subscriptions", "credits"]) {
      expect(await count(viewer, `select 1 from ${table} where org_id = $1`, [orgId])).toBe(1);
      expect(await count(outsider, `select 1 from ${table} where org_id = $1`, [orgId])).toBe(0);
    }
    await expectDenied(db.asUser(owner, (q) => q.query(`insert into ai_usage (org_id, endpoint) values ($1, 'edit')`, [orgId])));
    expect(await count(owner, `update credits set export_credits = 999 where org_id = $1`, [orgId])).toBe(0);
    expect(await count(owner, `update subscriptions set plan = 'agency' where org_id = $1`, [orgId])).toBe(0);
  });

  it("billing events are service-only", async () => {
    expect(await count(owner, `select 1 from billing_events`)).toBe(0);
    await expectDenied(db.asUser(owner, (q) => q.query(`insert into billing_events (provider, event_id, type, payload) values ('stripe', 'x', 'y', '{}')`)));
  });
});

describe("audit, feedback, admins", () => {
  it("audit log is owner-only", async () => {
    expect(await count(owner, `select 1 from audit_log where org_id = $1`, [orgId])).toBe(1);
    expect(await count(editor, `select 1 from audit_log where org_id = $1`, [orgId])).toBe(0);
    expect(await count(outsider, `select 1 from audit_log where org_id = $1`, [orgId])).toBe(0);
  });

  it("viewers can flag problems; editors read flags", async () => {
    expect(await count(viewer, `insert into feedback_flags (org_id, kind, message, created_by) values ($1, 'extraction', 'Missed a price', $2)`, [orgId, viewer.sub])).toBe(1);
    expect(await count(viewer, `select 1 from feedback_flags where org_id = $1`, [orgId])).toBe(0);
    expect(await count(editor, `select 1 from feedback_flags where org_id = $1`, [orgId])).toBe(1);
    await expectDenied(db.asUser(outsider, (q) => q.query(`insert into feedback_flags (org_id, kind, message, created_by) values ($1, 'other', 'x', $2)`, [orgId, outsider.sub])));
  });

  it("users only see their own admin row", async () => {
    expect(await count(outsider, `select 1 from app_admins`)).toBe(1);
    expect(await count(owner, `select 1 from app_admins`)).toBe(0);
  });
});
