import type { MemberDto, MemberRole, OrgDto, PlanId, VenueDto, VenueType, WhiteLabel } from "@menu-studio/shared";
import type { Queryable } from "../pool.ts";

const iso = (d: Date | string | null): string => (d instanceof Date ? d.toISOString() : (d ?? ""));

interface OrgRow {
  id: string;
  name: string;
  type: "venue" | "agency";
  plan: PlanId;
  country: string;
  white_label: WhiteLabel;
  created_at: Date;
  role: MemberRole;
}

const toOrg = (r: OrgRow): OrgDto => ({
  id: r.id,
  name: r.name,
  type: r.type,
  plan: r.plan,
  country: r.country,
  role: r.role,
  whiteLabel: r.white_label ?? {},
  createdAt: iso(r.created_at),
});

interface VenueRow {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  venue_type: VenueType;
  city: string | null;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  logo_url: string | null;
  created_at: Date;
}

export const toVenue = (r: VenueRow): VenueDto => ({
  id: r.id,
  orgId: r.org_id,
  name: r.name,
  slug: r.slug,
  venueType: r.venue_type,
  city: r.city,
  country: r.country,
  currency: r.currency,
  locale: r.locale,
  timezone: r.timezone,
  logoUrl: r.logo_url,
  createdAt: iso(r.created_at),
});

/** Orgs the current user belongs to (RLS-scoped). */
export async function listOrgs(q: Queryable): Promise<OrgDto[]> {
  const { rows } = await q.query<OrgRow>(
    `select o.*, m.role from organizations o join memberships m on m.org_id = o.id and m.user_id = auth.uid() order by o.created_at`,
  );
  return rows.map(toOrg);
}

export async function getOrg(q: Queryable, orgId: string): Promise<OrgDto | null> {
  const { rows } = await q.query<OrgRow>(
    `select o.*, coalesce(m.role, 'viewer') as role from organizations o left join memberships m on m.org_id = o.id and m.user_id = auth.uid() where o.id = $1`,
    [orgId],
  );
  return rows[0] ? toOrg(rows[0]) : null;
}

export async function createOrg(q: Queryable, input: { name: string; type: "venue" | "agency"; country: string }): Promise<OrgDto> {
  const { rows } = await q.query<OrgRow>(`select o.*, 'owner' as role from create_organization($1, $2, $3) o`, [input.name, input.type, input.country]);
  const row = rows[0];
  if (!row) throw new Error("create_organization returned nothing");
  return toOrg(row);
}

export async function updateOrg(q: Queryable, orgId: string, patch: { name?: string; whiteLabel?: WhiteLabel }): Promise<void> {
  await q.query(
    `update organizations set name = coalesce($2, name), white_label = coalesce($3::jsonb, white_label) where id = $1`,
    [orgId, patch.name ?? null, patch.whiteLabel ? JSON.stringify(patch.whiteLabel) : null],
  );
}

export async function listMembers(q: Queryable, orgId: string): Promise<MemberDto[]> {
  const { rows } = await q.query<{ user_id: string; role: MemberRole; created_at: Date; email: string | null }>(
    `select m.user_id, m.role, m.created_at, u.email from memberships m left join auth.users u on u.id = m.user_id where m.org_id = $1 order by m.created_at`,
    [orgId],
  );
  return rows.map((r) => ({ userId: r.user_id, role: r.role, email: r.email, createdAt: iso(r.created_at) }));
}

export async function listVenues(q: Queryable, orgId?: string): Promise<VenueDto[]> {
  const { rows } = orgId
    ? await q.query<VenueRow>(`select * from venues where org_id = $1 order by created_at`, [orgId])
    : await q.query<VenueRow>(`select * from venues order by created_at`);
  return rows.map(toVenue);
}

export async function getVenue(q: Queryable, venueId: string): Promise<VenueDto | null> {
  const { rows } = await q.query<VenueRow>(`select * from venues where id = $1`, [venueId]);
  return rows[0] ? toVenue(rows[0]) : null;
}

export async function getVenueBySlug(q: Queryable, slug: string): Promise<VenueDto | null> {
  const { rows } = await q.query<VenueRow>(`select * from venues where slug = $1`, [slug]);
  return rows[0] ? toVenue(rows[0]) : null;
}

export interface CreateVenueInput {
  orgId: string;
  name: string;
  slug: string;
  venueType: VenueType;
  city: string | null;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
}

export async function createVenue(q: Queryable, input: CreateVenueInput): Promise<VenueDto> {
  const { rows } = await q.query<VenueRow>(
    `insert into venues (org_id, name, slug, venue_type, city, country, currency, locale, timezone)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
    [input.orgId, input.name, input.slug, input.venueType, input.city, input.country, input.currency, input.locale, input.timezone],
  );
  const row = rows[0];
  if (!row) throw new Error("venue insert returned nothing");
  return toVenue(row);
}

export async function updateVenue(q: Queryable, venueId: string, patch: Partial<Pick<VenueDto, "name" | "city" | "timezone" | "logoUrl" | "currency" | "locale">>): Promise<VenueDto | null> {
  const { rows } = await q.query<VenueRow>(
    `update venues set name = coalesce($2, name), city = coalesce($3, city), timezone = coalesce($4, timezone),
       logo_url = coalesce($5, logo_url), currency = coalesce($6, currency), locale = coalesce($7, locale)
     where id = $1 returning *`,
    [venueId, patch.name ?? null, patch.city ?? null, patch.timezone ?? null, patch.logoUrl ?? null, patch.currency ?? null, patch.locale ?? null],
  );
  return rows[0] ? toVenue(rows[0]) : null;
}

export async function slugTaken(q: Queryable, slug: string): Promise<boolean> {
  const { rows } = await q.query<{ taken: boolean }>(`select exists (select 1 from venues where slug = $1) as taken`, [slug]);
  return rows[0]?.taken ?? false;
}

export async function orgVenueCount(q: Queryable, orgId: string): Promise<number> {
  const { rows } = await q.query<{ n: string }>(`select count(*)::text as n from venues where org_id = $1`, [orgId]);
  return Number(rows[0]?.n ?? 0);
}

export async function isAppAdmin(q: Queryable, userId: string): Promise<boolean> {
  const { rows } = await q.query<{ ok: boolean }>(`select exists (select 1 from app_admins where user_id = $1) as ok`, [userId]);
  return rows[0]?.ok ?? false;
}

export async function writeAudit(q: Queryable, entry: { orgId: string | null; userId: string | null; action: string; entity: string; entityId?: string | null; meta?: Record<string, unknown> }): Promise<void> {
  await q.query(`insert into audit_log (org_id, user_id, action, entity, entity_id, meta) values ($1, $2, $3, $4, $5, $6)`, [
    entry.orgId,
    entry.userId,
    entry.action,
    entry.entity,
    entry.entityId ?? null,
    JSON.stringify(entry.meta ?? {}),
  ]);
}
