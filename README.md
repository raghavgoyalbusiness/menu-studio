# Menu Studio

An AI menu design platform for restaurants, cafes and bars. An owner brings the menu they already
have — a photo, a PDF, pasted text — or describes the place and gets one drafted. They answer a
short brief, pick one of three design concepts, refine it by chat and by dragging things around,
then export print-ready PDFs and publish a QR menu that stays in sync.

The rule the whole system is built around: **the model never writes HTML, CSS or SVG.** It returns
JSON, that JSON is validated with Zod, and a deterministic React renderer draws it. The same
renderer draws the editor canvas, the print PDF, the PNG exports and the published QR menu, so what
an owner sees is what gets printed.

## Quick start

```bash
pnpm install
pnpm fonts:mirror     # mirror the 12 curated font pairings (gitignored, ~15 MB)
cp .env.example .env  # every variable is documented in that file
pnpm db:start         # local PostgreSQL 18, no Docker required
pnpm db:seed          # a demo account with four sample menus
pnpm dev              # web :5223, QR site :5224, api :5323, worker
```

Then open http://127.0.0.1:5223 and sign in as `demo@menu-studio.local` — local auth is
passwordless and the sign-in page shows the link.

To look around without signing in: **http://127.0.0.1:5223/dev/renderer** is the renderer gallery
(any seed menu × any of the ten archetypes × any paper format), and a published QR menu is served
straight from http://127.0.0.1:5224.

Without `ANTHROPIC_API_KEY` everything works except the AI routes, which return a clear 503: the
sample menus, the editor, exports and publishing are all usable.

| Service | Port | What it is |
| --- | --- | --- |
| web | 5223 | The owner app (React SPA), including the `/print` route the worker screenshots |
| menu | 5224 | The published QR menus, served as static files |
| api | 5323 | Hono API |
| worker | 5324 (health) | pg-boss consumer: PDF/PNG export, publishing, analytics |
| postgres | 54329 | Embedded local database |

## Commands

```bash
pnpm check                    # typecheck + lint + every unit and RLS test
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e                      # Playwright: happy path, print geometry, QR menu, visuals
pnpm --filter @menu-studio/infra synth   # CDK templates, no AWS account needed
pnpm db:reset                 # drop, migrate and reseed the local database
node evals/extract-eval.ts    # extraction quality against your own fixtures
```

## Layout

```
apps/
  web        Owner app: routes, editor (canvas, chat, layers, inspector, content, history), stores
  menu       Public QR site: SSR HTML plus two small vanilla islands
  api        Hono API: auth, projects, versions, AI endpoints, billing, GDPR
  worker     pg-boss jobs: export (Playwright + pdf-lib), publish, bulk export, analytics
packages/
  shared     Zod schemas (the source of every type), money, patches, seeds, plans
  renderer   The only thing that draws a menu: archetypes, overflow engine, matrix placement
  design-system  12 font pairings, 12 palettes, ornaments, dietary marks, glassware icons
  server-core    Database access with RLS, storage, queue, publish targets, config
  i18n       Direction, script detection and country defaults
infra/       AWS CDK: Secrets, Menu, Web, Api and Worker stacks
e2e/         Playwright tests against the real local stack
evals/       Extraction eval harness (fixtures are private, see evals/fixtures/README.md)
docs/        ARCHITECTURE.md and RUNBOOK.md
supabase/    Migrations, the local shim and RLS policies
```

## Where to read next

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit, and why they are shaped that way.
- [docs/RUNBOOK.md](docs/RUNBOOK.md) — deploying, and what to do when something breaks.
- [PHASE_10_SUMMARY.md](PHASE_10_SUMMARY.md) — drafting a menu from a description, and brand colours.
- [CLAUDE.md](CLAUDE.md) — the working rules for changing this codebase.
- [PLAN.md](PLAN.md) — the build plan and the decisions taken along the way.
