import { forbidden, getOrg, getProject, getVenue, notFound, type Queryable } from "@menu-studio/server-core";
import type { MemberRole, OrgDto, ProjectDto, VenueDto } from "@menu-studio/shared";

const RANK: Record<MemberRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function hasRole(role: MemberRole, min: MemberRole): boolean {
  return RANK[role] >= RANK[min];
}

export async function requireOrg(q: Queryable, orgId: string, min: MemberRole): Promise<OrgDto> {
  const { rows } = await q.query<{ role: MemberRole }>(`select role from memberships where org_id = $1 and user_id = auth.uid()`, [orgId]);
  const role = rows[0]?.role;
  if (!role) throw notFound("Organization");
  if (!hasRole(role, min)) throw forbidden(`This needs the ${min} role.`);
  const org = await getOrg(q, orgId);
  if (!org) throw notFound("Organization");
  return org;
}

export interface ProjectContext {
  project: ProjectDto;
  venue: VenueDto;
  org: OrgDto;
}

/** Load a project the caller can see (RLS) and check their role in its organization. */
export async function requireProject(q: Queryable, projectId: string, min: MemberRole): Promise<ProjectContext> {
  const project = await getProject(q, projectId);
  if (!project) throw notFound("Project");
  const venue = await getVenue(q, project.venueId);
  if (!venue) throw notFound("Venue");
  const org = await requireOrg(q, venue.orgId, min);
  return { project, venue, org };
}

export async function requireVenue(q: Queryable, venueId: string, min: MemberRole): Promise<{ venue: VenueDto; org: OrgDto }> {
  const venue = await getVenue(q, venueId);
  if (!venue) throw notFound("Venue");
  const org = await requireOrg(q, venue.orgId, min);
  return { venue, org };
}
