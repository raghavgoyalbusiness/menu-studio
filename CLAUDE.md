# CLAUDE.md: Menu Studio

Menu Studio is an AI menu design platform for restaurants, cafes and bars:
1. Owners upload a menu, which is extracted into structured JSON.
2. They answer a brief and get 3 design concepts.
3. They refine through chat and direct manipulation.
4. They export print-ready files and publish a QR menu that stays in sync.

Full spec: the Full Build Spec (in conversation). Plan: [PLAN.md](PLAN.md).

## Status

All nine phases are built. `pnpm check` and `pnpm e2e` are green: 201 unit and RLS tests, and 14 e2e
tests (1 skipped — the visual project runs only on Linux, and only once baselines exist).

| Phase | State | Summary |
|---|---|---|
| 1A: Tooling, schemas, design system, renderer | done | [PHASE_1A_SUMMARY.md](PHASE_1A_SUMMARY.md) |
| 1B: Database, auth, onboarding, versions, CI | done | [PHASE_1B_SUMMARY.md](PHASE_1B_SUMMARY.md) |
| 2: AI ingestion and concepts | done | [PHASE_2_SUMMARY.md](PHASE_2_SUMMARY.md) |
| 3: Signature archetypes | done | [PHASE_3_SUMMARY.md](PHASE_3_SUMMARY.md) |
| 4: AI editing | done | [PHASE_4_SUMMARY.md](PHASE_4_SUMMARY.md) |
| 5: Export | done | [PHASE_5_SUMMARY.md](PHASE_5_SUMMARY.md) |
| 6: QR menu | done | [PHASE_6_SUMMARY.md](PHASE_6_SUMMARY.md) |
| 7: Multi-language and menu engineering | done | [PHASE_7_SUMMARY.md](PHASE_7_SUMMARY.md) |
| 8: Billing and agency | done | [PHASE_8_SUMMARY.md](PHASE_8_SUMMARY.md) |
| 9: Hardening and deploy | done | [PHASE_9_SUMMARY.md](PHASE_9_SUMMARY.md) |

**Written but never proven on this machine** (no Docker, no AWS credentials, no API keys): the two
Dockerfiles have never been built, the CDK stacks have never been deployed, the GitHub workflows have
never run, the AI endpoints have never called the live model, and billing has never reached Stripe or
Razorpay. Everything else in the table was exercised end to end against the local stack.

When changing anything:
1. Run `pnpm check` plus the relevant Playwright specs, and fix failures.
2. Update this file and the phase summary the change belongs to.

**Ask before adding any dependency not in spec §1 or approved in PLAN.md §1 (D4).**

## Commands

```bash
pnpm install
pnpm fonts:mirror             # mirror curated Google Fonts into design-system (gitignored)
pnpm db:start                 # embedded PostgreSQL 18 on 54329, no Docker (PLAN D3)
pnpm db:seed                  # demo account with the four sample menus
pnpm dev                      # turbo: web :5223, menu :5224, api :5323, worker
pnpm check                    # typecheck + lint + test, the gate for every change
pnpm e2e                      # Playwright: happy path, print geometry, QR menu, visuals
pnpm --filter @menu-studio/renderer test
pnpm --filter @menu-studio/infra synth     # CDK templates, no AWS account needed
pnpm db:reset                 # drop, migrate, reseed
pnpm --filter @menu-studio/api smoke:concepts   # live Claude call; needs ANTHROPIC_API_KEY
node evals/extract-eval.ts    # extraction quality against private fixtures
```

Lint is a single root-level ESLint run (`pnpm lint`), not a Turbo task — `turbo run lint` does not
exist.

| Service | Port |
|---|---|
| web (owner app) | 5223 |
| menu (public QR) | 5224 |
| api | 5323 |
| worker health | 5324 |
| local postgres | 54329 |

Env: every variable is documented in `.env.example`. Each app parses its env with Zod at startup (`config/env.ts`) and fails fast.

## Repo map

- `apps/web`: owner SPA. `routes/`, `editor/` (canvas, chat, layers, inspector, content, history, matrix), `stores/`. The `/print/:projectId/:versionId` route lives here.
- `apps/menu`: public QR site. Pre-rendered HTML plus small hydrating islands. `entry-server.tsx` is built with Vite SSR for the worker.
- `apps/api`: Hono.
  - `config/ai.ts`: the **only** place the model id lives
  - `services/anthropic.ts`: `runStructured()`
  - `prompts/<name>/vN.ts`: versioned prompts
  - `ai-wire/`: structured-output wire schemas ⇄ domain
- `apps/worker`: pg-boss consumer with jobs `export`, `publish`, `bulk_export`. Runs Playwright.
- `packages/shared`: Zod schemas (source of truth for types), `money.ts`, `formats.ts`, `archetypes.ts` (registry metadata), `patch/` (`applyEdit`), `engineering/`, `billing/plans.ts`, `seeds/`.
- `packages/renderer`: `MenuRenderer`, archetypes, overflow engine, matrix collision, ready signal.
- `packages/design-system`: font pairings (+ mirrored files), palettes, ornaments, icons, dietary marks, textures.
- `packages/i18n`: direction and script detection helpers.
- `supabase/`: migrations, seed, RLS tests.
- `infra/`: CDK stacks.
- `e2e/`, `evals/`, `docs/`.

## Architecture rules

1. **The LLM outputs JSON only.** Every response is parsed with Zod before use. The model never produces HTML, CSS, SVG or anything CSS-shaped: `styleOverrides` is a closed enum object.
2. **`packages/renderer` is the single visual truth** for editor, print, PNG and QR. Nothing else draws menus.
3. **Content and design are separate documents.** An `Edit` is `{target: "document" | "spec", ops}` with exactly one target. A price change cannot touch LayoutSpec, and a font change cannot touch MenuDocument.
4. **One mutation pipeline.** Inline edits, drags, inspector, quick edit, AI edits, auto-fit and engineering suggestions all:
   - apply through `shared/patch/applyEdit` on the client (optimistic)
   - `POST /projects/:id/versions` with `baseVersionId`
   - get re-applied, Zod-validated and integrity-checked on the server, which inserts a `spec_versions` row and moves `current_version_id` in one transaction (409 on a stale base)
5. **Versions.** Every mutation inserts a version row.
   - Undo/redo moves `current_version_id` along the chain.
   - Restore inserts a copy.
   - Text commits on blur/Enter, drags commit on drop, and arrow nudges are debounced into one version.
6. **AI calls go through `runStructured()` only.** It runs these steps in order:
   1. Reserve an `ai_usage` row (rate limit + credits).
   2. Stream with `output_config.format` from the *wire* schema.
   3. Convert wire → domain and validate with Zod plus semantic validators.
   4. On failure, retry **once** with the Zod issues appended.
   5. On a second failure, throw a typed error (422 `ai_invalid_output`, `retryable: true`).
   6. Finalize usage with tokens, cost and prompt version.
7. **Wire schemas exist because structured outputs forbid records, `any` and numeric bounds.** Records travel as arrays and JSON Patch `value` travels as `valueJson`. Convert in `ai-wire/`; nothing outside the API sees wire shapes.
8. **AI edits carry guards.** Every op that mutates an array element is preceded by a `test` op on that element's `id`. The prompt includes an index map.
9. **Rules the prompt asks for are also enforced in code:**
   - flavor_matrix needs ≥ 6 eligible drinks; poster needs ≤ 15 items
   - concepts must be distinct
   - catalog ids must exist
   - rationale is capped at 2 sentences (truncated in code)
   - engineering patches may change emphasis only
10. **Renderer purity.** No `Date.now`, `Math.random`, network access or app CSS. `now` and `locale` are props. The renderer uses plain CSS with an `ms-` prefix and **logical properties** (RTL).
11. **Ready signal before any capture.** The ready signal fires after `document.fonts.ready`, every pairing family passing `document.fonts.check`, and the overflow pass completing. The export fails if fonts didn't load; never fall back silently.
12. **Overflow engine = `measure` (DOM) + `plan` (pure).** Steps, in order: density → body font (min 8.5 pt print / 14 px mobile) → rebalance columns → add a page if `pageCountPreference` allows, else flag. Plan with 1.5 % headroom (macOS vs Linux text metrics).
13. **Physical units.** Pages are sized in mm with 3 mm bleed and a 5 mm safe zone. The bleed PDF page is trim + 6 mm. The crop-mark PDF adds a 10 mm slug each side, and pdf-lib sets TrimBox/BleedBox.
14. **Money is integer minor units** everywhere, using the ISO 4217 exponent table in `shared/money.ts`. Parse from strings; never through floats. `ai_usage` cost is `cost_usd_micros`.
15. **Security.**
    - RLS on every table, including the `pgboss` schema (no policies).
    - The API queries Postgres with the **user's JWT**. The service-role key is used only by worker, webhooks and metering.
    - The print route requires an HMAC token (5 min, scoped to project + version).
16. **Fonts:** menus use only curated pairing ids from `design-system`, self-hosted (no Google Fonts CDN at runtime). App chrome uses its own two fonts.
17. **Unconfirmed inferred allergens and dietary tags are excluded from print and QR output** until the owner confirms them (PLAN D9).
18. **Node services run TypeScript directly** (Node 24 type stripping). Use erasable syntax only: no `enum`, `namespace` or parameter properties; use `as const` unions. Server-side React goes through the Vite SSR build of `apps/menu`.

## Conventions

- **TypeScript:**
  - `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`. No `any` (ESLint error); use `unknown` and narrow.
  - Types come from `z.infer`; never hand-write an interface that duplicates a schema.
- **Imports:** relative imports include the `.ts` / `.tsx` extension. Cross-package imports use `@menu-studio/<pkg>`, whose `exports` point at `src`.
- **Files:** kebab-case for modules, PascalCase for React component files. One archetype per folder in `renderer/src/archetypes/`.
- **IDs:**
  - Database rows use uuid.
  - Document-internal ids are `sec_`/`itm_`/`blk_`/`pg_` + 8 base36 chars, minted server-side (`shared/ids.ts`). Claude never mints ids.
- **Errors:** API errors are `{error: {code, message, retryable?, issues?}}`. Domain failures return `Result` values; exceptions are for the unexpected.
- **Logging:** one JSON line per event with `requestId` (propagated api → worker through job data). Never log document bodies, prompts or tokens at info level.
- **Prompts:** a new behaviour is a new version file (`v2.ts`). Never edit a shipped version. Activate it in `prompts/index.ts`.
- **App styling:** Tailwind v4 tokens in `apps/web/src/styles/theme.css`. Radix primitives, styled locally. Calm neutral chrome: menus are the only saturated thing on screen. No default Tailwind look (no stacked shadows, no default indigo).
- **State:** TanStack Query holds server data, Zustand holds the editor's working copy, selection and viewport. Don't mirror Query data into Zustand except the working copy.
- **Tests:**
  - Vitest next to code (`*.test.ts`).
  - Renderer snapshots use `react-dom/server` static markup.
  - Anything that needs layout runs in Playwright Test.
  - Visual baselines are generated only in the Linux Playwright image.
- **Commits:** at phase end, when approved. Never commit `.env*` (except `.env.example`), mirrored credentials or export artifacts.

## Never do

- Never let the LLM produce HTML, CSS or SVG, or skip Zod validation on AI output or webhook payloads.
- Never invent menu items, prices or descriptions. Never generate AI food photography.
- Never use a font outside the curated list in a menu. Never load Google Fonts' CDN at runtime.
- Never use float math for money.
- Never expose the service-role key to `apps/web` or `apps/menu`, or to any client bundle.
- Never remove an item because of menu engineering; emphasis only.
- Never mutate a MenuDocument or LayoutSpec outside `applyEdit`, or save a change without a version row.
- Never write a spec edit and a document edit as one `Edit`.
- Never reference the model id anywhere but `apps/api/src/config/ai.ts`.
- Never use `dangerouslySetInnerHTML` (lint-enforced); QR menus render owner text as text.
- Never put `Date.now()`, `Math.random()` or fetches inside the renderer.
- Never point pg-boss at Supabase's transaction pooler (port 6543).
- Never add a dependency without asking.
- Never commit secrets.

## Known gotchas (update as they are hit)

- **Hidden in-app Browser pane:** screenshots come back solid black and rAF is frozen. Verify visuals with Playwright scripts, not the pane.
- **`contentEditable` inside React:** re-renders wipe imperative DOM. Keep the edit overlay uncontrolled, commit on blur/Enter, and remount by key.
- **Text widths:** measure with canvas `measureText` in the loaded font. Per-glyph width constants break silently when the font changes.
- **Accent colours:** a mid-tone accent that passes AA on a dark ground often fails on paper. The contrast test covers every text-bearing palette role.
- **`overflow-x: hidden` on an ancestor breaks `position: sticky`** (QR section tabs). Fix grid blowout with `minmax(0, 1fr)` instead.
- **Variable fonts embed as Type3 in Chromium's PDF output.** Type3 glyphs are drawing procedures: they print as outlines and are not searchable or re-editable. `mirror-fonts.ts` asks Google Fonts with an old Chrome user agent precisely to get **static** instances. Anything drawn with text in a menu — including the dietary-mark letters — must use the menu font (`fontFamily="inherit"`), not `system-ui`, or that PDF gets a Type3 font too.
- **Vite manifest CSS**: with `cssCodeSplit` off, the stylesheet is its own manifest entry rather than a `css` entry on the chunk. The publish job collects both, otherwise a published menu is unstyled.
- **Playwright `webServer.url` treats 404 as not-ready.** The menu server only knows published slugs, so `/` is a 404; wait on `port` instead.
- **Select-all inside `contentEditable`** behaves differently per platform (`Meta+A` is not select-all in headless Chromium). Use Playwright's `locator.selectText()`.
- **Renderer snapshots are committed.** Any change to markup, tokens or the dietary marks regenerates all 30 — run `pnpm --filter @menu-studio/renderer exec vitest run -u` and read the diff before accepting it.
- **e2e tests share the seeded database.** A test that mutates a seeded menu must restore it (read the value first, put it back at the end); a hard-coded name will rot the seed for every later run.
- **The published menu's CSP allows inline scripts.** Each page inlines its own JSON-LD and config, and the header is per-distribution, so per-page hashes are impossible. That is why rendering owner text as text is load-bearing rather than merely tidy.
