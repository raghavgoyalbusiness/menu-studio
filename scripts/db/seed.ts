/**
 * Seed a demo account with one organization, four venues and the four sample menus.
 * Sign in locally as demo@menu-studio.local (the dev sign-in page prints the link).
 *
 *   pnpm db:seed
 */
import { SEED_IDS, SEEDS } from "../../packages/shared/src/seeds/index.ts";
import { createDb } from "../../packages/server-core/src/db/pool.ts";
import { countryDefaults } from "../../packages/i18n/src/index.ts";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/menu_studio";
const email = process.env.SEED_EMAIL ?? "demo@menu-studio.local";
const db = createDb(url);

const result = await db.asService(async (q) => {
  const { rows: users } = await q.query<{ id: string }>(
    `insert into auth.users (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email],
  );
  const userId = users[0]?.id;
  if (!userId) throw new Error("Could not create the demo user");
  const { rows: existing } = await q.query<{ id: string }>(`select o.id from organizations o join memberships m on m.org_id = o.id where m.user_id = $1 and o.name = 'Demo Hospitality'`, [userId]);
  if (existing[0]) return { userId, orgId: existing[0].id, created: false };

  const { rows: orgs } = await q.query<{ id: string }>(`insert into organizations (name, type, plan, country) values ('Demo Hospitality', 'agency', 'agency', 'GB') returning id`);
  const orgId = orgs[0]?.id ?? "";
  await q.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'owner')`, [orgId, userId]);
  await q.query(`insert into credits (org_id, export_credits, ai_edit_credits) values ($1, 5, 50)`, [orgId]);

  for (const seedId of SEED_IDS) {
    const seed = SEEDS[seedId];
    const defaults = countryDefaults(seed.country);
    const slug = `${seed.document.venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-demo`;
    const { rows: venues } = await q.query<{ id: string }>(
      `insert into venues (org_id, name, slug, venue_type, city, country, currency, locale, timezone)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (slug) do update set name = excluded.name returning id`,
      [orgId, seed.document.venueName, slug, seed.document.venueType, seed.city, seed.country, seed.document.currency, seed.document.locale, seed.timezone ?? defaults.timezone],
    );
    const venueId = venues[0]?.id ?? "";
    const { rows: projects } = await q.query<{ id: string }>(`insert into projects (venue_id, name) values ($1, $2) returning id`, [venueId, seed.label]);
    const projectId = projects[0]?.id ?? "";
    const document = { ...seed.document, id: `doc-${projectId}`, projectId };
    const { rows: versions } = await q.query<{ id: string }>(
      `insert into spec_versions (project_id, seq, menu_document, design_brief, layout_spec, source, summary, created_by)
       values ($1, 1, $2, $3, $4, 'import', 'Started from a sample menu', $5) returning id`,
      [projectId, JSON.stringify(document), JSON.stringify(seed.brief), JSON.stringify({ ...seed.spec, id: crypto.randomUUID() }), userId],
    );
    await q.query(`update projects set current_version_id = $2 where id = $1`, [projectId, versions[0]?.id]);
  }
  return { userId, orgId, created: true };
});

process.stdout.write(result.created ? `Seeded demo data for ${email}.\n` : `Demo data already exists for ${email}.\n`);
await db.close();
