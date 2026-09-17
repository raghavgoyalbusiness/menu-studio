# Phase 1B: Database, auth, onboarding, versions, CI

## Built

- **Schema** (`supabase/migrations/20260917000001_core.sql`): organizations, memberships, venues,
  projects, spec_versions, concepts, uploads, exports, published_menus, menu_views, ai_usage,
  audit_log, invites, subscriptions.
- **RLS** (`..._rls.sql`): a policy set on **every** table plus a `create_organization` RPC. The
  `pgboss` schema is locked down with no policies at all.
- **`packages/server-core`**: `Db` with `asUser` (which issues `SET LOCAL ROLE authenticated` and
  `request.jwt.claims`, so the same policies that protect Supabase protect direct SQL) and
  `asService`; storage (local filesystem and Supabase Storage); pg-boss queue; publish targets;
  Zod-parsed config; and `local-postgres.ts`, which runs a real PostgreSQL 18 through
  `embedded-postgres` — **no Docker needed on this machine** (PLAN D3).
- **`apps/api`**: Hono app, request-id and JSON logging, typed error middleware, auth middleware with
  two modes (local passwordless magic link for development, Supabase JWT verification in production),
  and routes for onboarding, projects, versions and history.
- **`apps/web`**: auth screens, two-step onboarding (currency, locale and time zone suggested from
  country), dashboard, and an editor where every edit is a version, with ⌘Z / ⇧⌘Z undo and redo.
- **CI**: `.github/workflows/ci.yml` runs typecheck, lint, every unit and RLS test, `cdk synth`, and
  the Playwright suite in the Linux Playwright image.

## Deviations from the plan

- The plan's `supabase start` step was replaced with `embedded-postgres`, because Docker is not
  available here and the RLS tests are the thing that most needs to run locally. The migrations and
  policies are unchanged Supabase SQL; a local shim recreates the roles and `auth.uid()`.
- Google OAuth is configured for Supabase mode but was never exercised — magic link covers sign-in.

## Known issues

- The Supabase auth path has only been exercised through its unit tests; every end-to-end run here
  used local mode.

## Verified

17 RLS tests cover owner, editor, viewer and outsider on each table, and one of them fails if a new
table ever ships without RLS. `e2e/happy-path.spec.ts` signs in, opens a seeded menu, renames an
item, confirms the version counter advanced, then undoes it and confirms the name came back.
