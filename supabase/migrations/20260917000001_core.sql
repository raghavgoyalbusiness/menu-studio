-- Menu Studio core schema. Runs unchanged on Supabase and on the local embedded Postgres.
-- Every table has row level security enabled; see 20260917000002_rls.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  type text not null default 'venue' check (type in ('venue', 'agency')),
  plan text not null default 'free' check (plan in ('free', 'pay_per_export', 'pro', 'multi_venue', 'agency')),
  country text not null default 'GB' check (country ~ '^[A-Z]{2}$'),
  billing_customer_ids jsonb not null default '{}'::jsonb,
  -- Agency white-label settings: {brandName, logoUrl, qrSubdomain}
  white_label jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  venue_type text not null check (venue_type in ('restaurant', 'cafe', 'bar', 'bakery', 'cloud_kitchen')),
  city text,
  country text not null check (country ~ '^[A-Z]{2}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  locale text not null,
  timezone text not null default 'UTC',
  logo_url text,
  created_at timestamptz not null default now()
);
create index venues_org_idx on public.venues (org_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null default 'member' check (kind in ('member', 'venue_handoff')),
  venue_id uuid references public.venues (id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'member' or venue_id is not null)
);

-- ---------------------------------------------------------------------------
-- Projects and versions
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_venue_idx on public.projects (venue_id);

create table public.spec_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_version_id uuid references public.spec_versions (id) on delete set null,
  seq integer not null,
  menu_document jsonb not null,
  design_brief jsonb,
  layout_spec jsonb,
  source text not null check (source in ('manual', 'ai_concept', 'ai_edit', 'import', 'restore')),
  instruction text,
  -- The JSON Patch edits that produced this version (null for imports and restores).
  edits jsonb,
  summary text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, seq)
);
create index spec_versions_project_idx on public.spec_versions (project_id, seq desc);

alter table public.projects
  add constraint projects_current_version_fk
  foreign key (current_version_id) references public.spec_versions (id) on delete set null
  deferrable initially deferred;

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  batch_id uuid not null,
  base_version_id uuid references public.spec_versions (id) on delete set null,
  layout_spec jsonb not null,
  selected boolean not null default false,
  prompt_version text,
  fit_report jsonb,
  created_at timestamptz not null default now()
);
create index concepts_project_idx on public.concepts (project_id, created_at desc);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  storage_path text not null,
  mime text not null,
  kind text not null check (kind in ('menu_source', 'logo', 'reference')),
  size_bytes integer not null check (size_bytes >= 0),
  page_count integer,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index uploads_project_idx on public.uploads (project_id);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version_id uuid not null references public.spec_versions (id) on delete cascade,
  kind text not null check (kind in ('pdf', 'pdf_crop_marks', 'png', 'print_pack')),
  status text not null default 'queued' check (status in ('queued', 'rendering', 'done', 'failed')),
  storage_path text,
  files jsonb not null default '[]'::jsonb,
  watermarked boolean not null default false,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index exports_project_idx on public.exports (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- QR menus and analytics
-- ---------------------------------------------------------------------------

create table public.published_menus (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  version_id uuid not null references public.spec_versions (id) on delete restrict,
  slug text not null default 'main' check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_live boolean not null default true,
  languages text[] not null default '{}',
  theme_mode text not null default 'mobile_optimized' check (theme_mode in ('match_print', 'mobile_optimized')),
  published_at timestamptz not null default now(),
  unique (venue_id, slug)
);

create table public.menu_views (
  id bigint generated always as identity primary key,
  published_menu_id uuid not null references public.published_menus (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  lang text,
  device text check (device in ('mobile', 'tablet', 'desktop')),
  referrer text check (referrer in ('qr', 'direct', 'search', 'social', 'other'))
);
create index menu_views_menu_idx on public.menu_views (published_menu_id, viewed_at);

create table public.menu_view_daily (
  published_menu_id uuid not null references public.published_menus (id) on delete cascade,
  date date not null,
  lang text not null default '',
  device text not null default '',
  views integer not null default 0,
  primary key (published_menu_id, date, lang, device)
);

create table public.item_clicks (
  published_menu_id uuid not null references public.published_menus (id) on delete cascade,
  item_id text not null,
  date date not null,
  count integer not null default 0,
  primary key (published_menu_id, item_id, date)
);

-- ---------------------------------------------------------------------------
-- AI usage, billing, audit
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  request_id text,
  endpoint text not null,
  prompt_name text,
  prompt_version text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd_micros bigint not null default 0,
  attempt integer not null default 1,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  stop_reason text,
  error_code text,
  latency_ms integer,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_usage_org_idx on public.ai_usage (org_id, endpoint, created_at desc);

create table public.subscriptions (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'razorpay')),
  plan text not null,
  status text not null,
  provider_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.credits (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  export_credits integer not null default 0 check (export_credits >= 0),
  ai_edit_credits integer not null default 0 check (ai_edit_credits >= 0),
  updated_at timestamptz not null default now()
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'razorpay')),
  event_id text not null,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (org_id, created_at desc);

create table public.feedback_flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null check (kind in ('extraction', 'concept', 'edit', 'export', 'other')),
  message text not null check (char_length(message) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
