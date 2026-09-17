-- Row level security. Access is decided by organization membership:
--   viewer  < editor  < owner
-- Helper functions are SECURITY DEFINER so policies can read memberships without
-- recursing into memberships' own policies.

create or replace function public.role_rank(p_role text) returns integer
language sql immutable as $$
  select case p_role when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end
$$;

create or replace function public.has_org_role(p_org uuid, p_min text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
      and public.role_rank(m.role) >= public.role_rank(p_min)
  )
$$;

create or replace function public.venue_org(p_venue uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.venues where id = p_venue
$$;

create or replace function public.project_org(p_project uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select v.org_id from public.projects p join public.venues v on v.id = p.venue_id where p.id = p_project
$$;

create or replace function public.published_menu_org(p_menu uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select v.org_id from public.published_menus pm join public.venues v on v.id = pm.venue_id where pm.id = p_menu
$$;

revoke all on function public.has_org_role(uuid, text) from public;
grant execute on function public.has_org_role(uuid, text) to authenticated, service_role;
grant execute on function public.venue_org(uuid) to authenticated, service_role;
grant execute on function public.project_org(uuid) to authenticated, service_role;
grant execute on function public.published_menu_org(uuid) to authenticated, service_role;

-- Creating an organization also makes the caller its owner, atomically.
create or replace function public.create_organization(p_name text, p_type text, p_country text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.organizations (name, type, country) values (p_name, p_type, p_country) returning * into org;
  insert into public.memberships (org_id, user_id, role) values (org.id, auth.uid(), 'owner');
  insert into public.credits (org_id) values (org.id);
  return org;
end $$;
revoke all on function public.create_organization(text, text, text) from public;
grant execute on function public.create_organization(text, text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.venues enable row level security;
alter table public.invites enable row level security;
alter table public.projects enable row level security;
alter table public.spec_versions enable row level security;
alter table public.concepts enable row level security;
alter table public.uploads enable row level security;
alter table public.exports enable row level security;
alter table public.published_menus enable row level security;
alter table public.menu_views enable row level security;
alter table public.menu_view_daily enable row level security;
alter table public.item_clicks enable row level security;
alter table public.ai_usage enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credits enable row level security;
alter table public.billing_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.feedback_flags enable row level security;
alter table public.app_admins enable row level security;

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (public.has_org_role(id, 'viewer'));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_org_role(id, 'owner')) with check (public.has_org_role(id, 'owner'));
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.has_org_role(id, 'owner'));

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (public.has_org_role(org_id, 'viewer'));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (public.has_org_role(org_id, 'owner'));
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_org_role(org_id, 'owner')) with check (public.has_org_role(org_id, 'owner'));
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_org_role(org_id, 'owner') or user_id = auth.uid());

-- venues
create policy venues_select on public.venues for select to authenticated
  using (public.has_org_role(org_id, 'viewer'));
create policy venues_insert on public.venues for insert to authenticated
  with check (public.has_org_role(org_id, 'owner'));
create policy venues_update on public.venues for update to authenticated
  using (public.has_org_role(org_id, 'editor')) with check (public.has_org_role(org_id, 'editor'));
create policy venues_delete on public.venues for delete to authenticated
  using (public.has_org_role(org_id, 'owner'));

-- invites
create policy invites_select on public.invites for select to authenticated
  using (public.has_org_role(org_id, 'owner'));
create policy invites_insert on public.invites for insert to authenticated
  with check (public.has_org_role(org_id, 'owner'));
create policy invites_delete on public.invites for delete to authenticated
  using (public.has_org_role(org_id, 'owner'));

-- projects
create policy projects_select on public.projects for select to authenticated
  using (public.has_org_role(public.venue_org(venue_id), 'viewer'));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.has_org_role(public.venue_org(venue_id), 'editor'));
create policy projects_update on public.projects for update to authenticated
  using (public.has_org_role(public.venue_org(venue_id), 'editor'))
  with check (public.has_org_role(public.venue_org(venue_id), 'editor'));
create policy projects_delete on public.projects for delete to authenticated
  using (public.has_org_role(public.venue_org(venue_id), 'owner'));

-- spec_versions are immutable: select and insert only.
create policy spec_versions_select on public.spec_versions for select to authenticated
  using (public.has_org_role(public.project_org(project_id), 'viewer'));
create policy spec_versions_insert on public.spec_versions for insert to authenticated
  with check (public.has_org_role(public.project_org(project_id), 'editor') and created_by = auth.uid());

-- concepts
create policy concepts_select on public.concepts for select to authenticated
  using (public.has_org_role(public.project_org(project_id), 'viewer'));
create policy concepts_insert on public.concepts for insert to authenticated
  with check (public.has_org_role(public.project_org(project_id), 'editor'));
create policy concepts_update on public.concepts for update to authenticated
  using (public.has_org_role(public.project_org(project_id), 'editor'))
  with check (public.has_org_role(public.project_org(project_id), 'editor'));

-- uploads
create policy uploads_select on public.uploads for select to authenticated
  using (public.has_org_role(org_id, 'viewer'));
create policy uploads_insert on public.uploads for insert to authenticated
  with check (public.has_org_role(org_id, 'editor') and (project_id is null or public.project_org(project_id) = org_id));

-- exports: the worker (service role) updates status.
create policy exports_select on public.exports for select to authenticated
  using (public.has_org_role(public.project_org(project_id), 'viewer'));
create policy exports_insert on public.exports for insert to authenticated
  with check (public.has_org_role(public.project_org(project_id), 'editor'));

-- published menus
create policy published_menus_select on public.published_menus for select to authenticated
  using (public.has_org_role(public.venue_org(venue_id), 'viewer'));
create policy published_menus_insert on public.published_menus for insert to authenticated
  with check (public.has_org_role(public.venue_org(venue_id), 'editor'));
create policy published_menus_update on public.published_menus for update to authenticated
  using (public.has_org_role(public.venue_org(venue_id), 'editor'))
  with check (public.has_org_role(public.venue_org(venue_id), 'editor'));

-- analytics: written by the API with the service role, readable by members.
create policy menu_views_select on public.menu_views for select to authenticated
  using (public.has_org_role(public.published_menu_org(published_menu_id), 'viewer'));
create policy menu_view_daily_select on public.menu_view_daily for select to authenticated
  using (public.has_org_role(public.published_menu_org(published_menu_id), 'viewer'));
create policy item_clicks_select on public.item_clicks for select to authenticated
  using (public.has_org_role(public.published_menu_org(published_menu_id), 'viewer'));

-- usage, billing: read-only to members, written by the service role.
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (public.has_org_role(org_id, 'viewer'));
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.has_org_role(org_id, 'viewer'));
create policy credits_select on public.credits for select to authenticated
  using (public.has_org_role(org_id, 'viewer'));
-- billing_events: no policies. Service role only.

create policy audit_log_select on public.audit_log for select to authenticated
  using (org_id is not null and public.has_org_role(org_id, 'owner'));

create policy feedback_flags_select on public.feedback_flags for select to authenticated
  using (public.has_org_role(org_id, 'editor'));
create policy feedback_flags_insert on public.feedback_flags for insert to authenticated
  with check (public.has_org_role(org_id, 'viewer') and created_by = auth.uid());

create policy app_admins_select on public.app_admins for select to authenticated
  using (user_id = auth.uid());
