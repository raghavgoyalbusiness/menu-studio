# Menu Studio: Plan

**Status:** draft, waiting for your approval. No application code has been written.
**Written:** 2026-09-17, against the *Full Build Spec* (the second brief you sent). Where it differs from the first, shorter brief, the full spec wins.

Contents
1. [Decisions I need from you](#1-decisions-i-need-from-you)
2. [What I checked on this machine](#2-what-i-checked-on-this-machine)
3. [Architecture summary](#3-architecture-summary)
4. [File tree](#4-file-tree)
5. [Data model amendments and derived rules](#5-data-model-amendments-and-derived-rules)
6. [Renderer, formats and design system](#6-renderer-formats-and-design-system)
7. [AI layer](#7-ai-layer)
8. [Export, publish and jobs](#8-export-publish-and-jobs)
9. [Risks](#9-risks)
10. [Open questions (non-blocking, with the default I will use)](#10-open-questions-non-blocking)
11. [Phases, tasks and estimates](#11-phases-tasks-and-estimates)
12. [Testing and verification strategy](#12-testing-and-verification-strategy)

---

## 1. Decisions I need from you

Ordered by when they block work. **D1 to D5 block Phase 1.**

| # | Decision | My recommendation | Blocks |
|---|---|---|---|
| **D1** | **Node 20 is past end-of-life** (April 2026). Current `pg-boss` 12 and `vitest` 5 both require Node ≥ 22.12. Staying on Node 20 means pinning older majors of both. | **Node 24 LTS** (already installed here, v24.11). Docker images use `node:24`. | P1 |
| **D2** | **React 18 vs 19.** `react-router` 8 requires React ≥ 19.2.7. TanStack Query, Radix and dnd-kit support both. | **React 19** with react-router 8. Alternative: React 18.3 with react-router 7.18. Both work. React 19 avoids starting on an old major. | P1 |
| **D3** | **Local Supabase needs Docker, and this Mac has none.** `supabase start` (Postgres, Auth, Storage, Realtime, Inbucket for magic-link mail) runs in Docker. | **(a) Install OrbStack or Docker Desktop yourself.** That gives the full local stack the spec expects. **(b)** Alternative: a hosted Supabase *dev* project, with URL, keys and DB URL sent to me. Built-in SMTP rate-limits magic-link emails, so tests would sign in through admin-generated links. I rejected a PGlite shim: it has no Auth, Storage or Realtime. CI runs `supabase start` on GitHub runners either way, because they have Docker. | P1 |
| **D4** | **Dependencies not in spec §1** (full list in the table below). | Approve the Phase-1 rows now. I'll ask about later rows when their phase starts. | P1 (partly) |
| **D5** | **GitHub.** Phase 1 includes CI, and CI needs a repo. | Create a **private** repo `raghavgoyalbusiness/menu-studio`, commit at the end of each phase, push when you approve. Nothing is pushed until you say yes. | P1 |
| D6 | **Schema amendments** in §5 (nullable price, `venues.timezone`, `ai_usage` columns, closed `styleOverrides`, and others). | Approve as written, or strike the ones you don't want. | P1 |
| D7 | **Where the concepts overflow check runs.** The spec says "render all 3 server-side". Measuring layout needs a browser, and the browser lives in the worker. | **Measure in the owner's browser** in the concepts gallery, using the same deterministic renderer, and auto-fit there. The worker re-measures at export time as the hard gate. Routing /concepts through the worker adds a queue hop plus Chromium cold start (~5–15 s) inside a 60 s budget. | P2 |
| D8 | **Font hosting.** Google Fonts' CDN sends every QR-menu visitor's IP address to Google. A German court ruled this a GDPR breach in 2022, and it conflicts with "no personal data" in §9. It also makes export depend on a third party. | **Self-host.** A script mirrors the woff2 files and `unicode-range` CSS for the curated fonts into `packages/design-system/fonts`. All are OFL-licensed, and the script needs no new dependency. | P1 |
| D9 | **Unconfirmed inferred allergen and dietary data.** Printing a guessed "gluten free" is a real liability. | Print and QR outputs **exclude** inferred `allergens` and `dietaryTags` until the owner confirms them. The editor shows an "N unconfirmed" badge, and publishing warns. | P2 |
| D10 | Format dimensions for `BIFOLD_A4`, `TABLE_TENT` and `CHALKBOARD_WIDE` are ambiguous (see §6.1). | Use the assumptions in §6.1 unless your printer says otherwise. | P3 |

### Dependencies not listed in spec §1 (D4)

Tooling the spec implies I'll treat as approved unless you object: `@types/*`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `constructs` (CDK peer), the `supabase` CLI npm package, and the individual `@radix-ui/react-*` packages.

| Package | Phase | Why | Alternative if you say no |
|---|---|---|---|
| `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks` | 1 | The phase gate requires lint, and `no-explicit-any` has to be enforced by a tool | none that is sensible |
| `prettier` | 1 | Consistent formatting across 8 packages | skip; ESLint stylistic rules only |
| `pg` | 1 | RLS tests running SQL as different roles, plus the "every table has RLS" assertion. Already a transitive dependency of pg-boss. | only through supabase-js, which can't query `pg_class` |
| `sharp` | 2 | Strip EXIF (§7), normalise orientation, downscale and re-encode uploads | hand-rolled JPEG APP1 stripping, with no resize and no PNG/WebP support |
| `pdf-lib` | 2, 5 | Enforce the 10-page upload limit before paying for Claude. Set TrimBox/BleedBox on exports. Verify MediaBox size and font embedding in tests. | Claude rejects oversized PDFs *after* upload cost; exports lack trim boxes |
| `yazl` (small, streaming zip) | 5 | Print pack zip | hand-rolled store-only zip |
| `@aws-sdk/client-s3`, `@aws-sdk/client-cloudfront` | 6/9 | Publish static QR menus to S3 | local-directory publishing only |
| `lighthouse` (dev only) | 6 | "LCP under 1.5 s on throttled 4G" acceptance | manual Chrome DevTools run |
| `papaparse` | 7 | CSV import for menu engineering | hand-rolled RFC 4180 parser (~80 lines plus tests) |
| `@sentry/react`, `@sentry/node` | 9 | Required by §15 | none |

---

## 2. What I checked on this machine

- Node **v24.11.0**, pnpm **11.18.0**. **No Docker, no Supabase CLI.** Playwright Chromium is already cached.
- **No `ANTHROPIC_API_KEY`** on this Mac. Phases 2, 4 and 7 can be built and unit-tested against fixtures, but live AI runs need your key in `apps/api/.env`.
- Ports **5223** (web), **5224** (QR menu) and **5323** (api) are free and don't clash with your other local projects.
- Current package versions and constraints:
  - `@anthropic-ai/sdk` 0.126 (peer: zod ^3.25 or ^4)
  - `zod` 4.6
  - `hono` 4.13
  - `pg-boss` 12.33 (Node ≥ 22.12)
  - `vitest` 5.0 (Node ≥ 22.12)
  - `vite` 8.3
  - `react-router` 8.4 (React ≥ 19.2.7)
  - `tailwindcss` 4.3
  - `playwright` 1.63
  - `turbo` 2.10
  - `aws-cdk-lib` 2.269
  - `fast-json-patch` 3.1.1 (**last published June 2022**, see Risk R9)
- Claude API facts this plan depends on:
  - Structured outputs require `additionalProperties: false` on every object.
  - They don't support **records/maps, `any`-typed values, recursive schemas, or numeric and string-length constraints**. The SDK strips those constraints and validates them client-side.
  - PDFs are accepted as `document` blocks.
  - Opus 5 thinks adaptively by default.
  - All of this shaped §7.

---

## 3. Architecture summary

```
 apps/web (owner app, SPA on CloudFront)            apps/menu (public QR, static HTML on CloudFront)
 ┌──────────────────────────────────────┐           ┌──────────────────────────────────┐
 │ routes/ ── editor/ ── stores (Zustand)│           │ pre-rendered HTML + version JSON │
 │     │          │                      │           │ tiny hydrating islands (filters, │
 │ TanStack Query │   packages/renderer ◄─┼── same ──►│ search, lang switch)             │
 │     │          └── /print route        │           └───────────────▲──────────────────┘
 └─────┼───────────────────▲─────────────┘                           │ publish job writes
       │ Supabase JWT      │ signed print token                      │
       ▼                   │                                         │
 apps/api (Hono) ──────────┼──► Anthropic (JSON only, Zod-validated)  │
   middleware: request-id, auth, rate limit, metering, errors         │
       │                   │                                         │
       ├──► Supabase Postgres (RLS on every table) ◄── pg-boss ──► apps/worker (Playwright)
       │                                                 export / publish / bulk_export jobs
       └──► Supabase Storage (uploads, exports) ◄──────────────────────┘
```

### 3.1 One mutation pipeline for every change
Every change goes through the same pipeline. That covers inline text, matrix drag, inspector, content tab, quick edit, AI edit, auto-fit and engineering suggestions.

```
Edit = { target: "document" | "spec", ops: RFC6902Op[] }   // exactly one target
client: optimistic applyEdit() ──► POST /projects/:id/versions { baseVersionId, edits[], source, instruction? }
server: re-apply to its own head (fast-json-patch, atomic)
        → Zod-validate BOTH documents
        → integrity: ids unique; sectionRef / itemRefs / placements resolve; ids immutable
        → transaction: insert spec_versions row + move projects.current_version_id
        → 409 if baseVersionId ≠ current head
```
- **Rule 3 (content/design separation) is structural.** An `Edit` targets one document, so a price change cannot touch the LayoutSpec.
- **Rule 4:** every accepted mutation inserts a version row.
  - **Undo/redo** moves `current_version_id` along the parent chain. The client keeps the redo path, and the server checks that the target belongs to the project.
  - **Restore** (history drawer) inserts a new row copying an old version, with `source: "restore"`.
  - **Coalescing:** inline text commits on blur or Enter, drags commit on drop, and matrix arrow nudges are debounced (500 ms) into a single version.
- **Per-edit undo in chat** creates a new version that reverses that edit's diff on the current head, guarded by `test` ops. If later edits touched the same fields, it reports a conflict instead of guessing.

### 3.2 State boundaries (web)
- **TanStack Query** owns anything fetched: the project, the version list, concepts and export rows.
- **Zustand** (`stores/editor.ts`) owns the working copy: document, spec, head id, the pending edit queue, selection, zoom and guides, and the latest overflow report.
- A version-save mutation applies optimistically to Zustand, rolls back on error and reconciles on success.

### 3.3 Tenancy and auth
- Supabase Auth handles magic link and Google sign-in.
- The API verifies the JWT locally (`supabase.auth.getClaims()` with JWKS caching) and makes Postgres calls **with the user's JWT**, so RLS also protects API queries.
- The service-role key is used only by the worker, webhooks and metering functions.
- RLS helpers (`is_org_member(org_id, min_role)`) are `SECURITY DEFINER`. Every table gets policies and tests for owner, editor, viewer and other-org access.

### 3.4 No build step for Node services
- `apps/api` and `apps/worker` run TypeScript directly on Node 24's type stripping. Code uses only erasable syntax: no enums, no namespaces, no parameter properties. `tsc` is the typecheck.
- Server-side React (QR pre-rendering in the worker) uses a **Vite SSR build** of `apps/menu/src/entry-server.tsx`, because Node can't strip TSX.

---

## 4. File tree

This is the spec's §2 tree plus the files that matter. Additions to the spec's tree are marked `+`.

```
menu-studio/
├─ PLAN.md  CLAUDE.md  PHASE_N_SUMMARY.md (one per phase)
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json  eslint.config.ts  .env.example  .nvmrc
├─ .github/workflows/  ci.yml  deploy-staging.yml  deploy-production.yml
├─ apps/
│  ├─ web/                                   # Vite SPA, port 5223
│  │  └─ src/
│  │     ├─ routes/  auth/ onboarding/ dashboard/ projects/new/ review/ brief/ concepts/ editor/
│  │     │           export/ publish/ engineering/ billing/ settings/ agency/ admin/ print/ (+ print route)
│  │     ├─ editor/  canvas/ chat/ layers/ inspector/ content/ history/ matrix/ keyboard.ts
│  │     ├─ components/  (app chrome on Radix primitives; no menu visuals)
│  │     ├─ stores/  editor.ts  selection.ts
│  │     ├─ lib/  api-client.ts  supabase.ts  query-keys.ts  image-prep.ts
│  │     └─ styles/  theme.css (Tailwind v4 @theme tokens for app chrome only)
│  ├─ menu/                                  # public QR site, port 5224
│  │  └─ src/  entry-client.tsx  entry-server.tsx (+)  islands/ (filters, search, lang)  analytics.ts
│  ├─ api/                                   # Hono, port 5323
│  │  └─ src/
│  │     ├─ index.ts  app.ts
│  │     ├─ config/  ai.ts (AI_MODEL, the only place)  env.ts (Zod-parsed env)  pricing.ts (+ token prices)
│  │     ├─ middleware/  request-id.ts  auth.ts  rate-limit.ts  metering.ts  errors.ts
│  │     ├─ routes/  extract concepts edit translate engineering describe-reference
│  │     │           projects versions uploads export publish billing webhooks agency analytics(+)
│  │     ├─ prompts/  extract/v1.ts  concepts/v1.ts  edit/v1.ts  translate/v1.ts
│  │     │            engineering/v1.ts  describe-reference/v1.ts  index.ts (active versions)
│  │     ├─ services/  anthropic.ts (runStructured)  supabase.ts  storage.ts  billing/  print-token.ts
│  │     └─ ai-wire/  (+ structured-output wire schemas ⇄ domain converters)
│  └─ worker/
│     ├─ Dockerfile (Playwright base image, node 24)
│     └─ src/  index.ts  jobs/export.ts  jobs/publish.ts  jobs/bulk-export.ts
│              pdf/crop-boxes.ts  pack/readme.ts  publish-target/{local,s3}.ts
├─ packages/
│  ├─ shared/src/
│  │  ├─ schemas/  menu-document.ts  design-brief.ts  layout-spec.ts  edit.ts  overflow-report.ts  api/
│  │  ├─ money.ts (ISO 4217 exponents, integer parse/format)  formats.ts (mm table)
│  │  ├─ archetypes.ts (+ registry metadata: formats, grid, limits, eligibility)
│  │  ├─ patch/  apply-edit.ts  integrity.ts  guards.ts
│  │  ├─ engineering/quadrants.ts   billing/plans.ts   ids.ts
│  │  └─ seeds/  cocktail-bar-london.ts  cafe-bangalore.ts  restaurant-delhi.ts  bistro-paris.ts
│  ├─ renderer/src/
│  │  ├─ MenuRenderer.tsx  Page.tsx  tokens-to-vars.ts  renderer.css (ms- prefix, logical props)
│  │  ├─ archetypes/  classic-list/ two-column/ flavor-matrix/ editorial/ by-base-spirit/
│  │  │               tasting-journey/ poster/ chalkboard/ grid-cards/ mobile-stack/
│  │  ├─ overflow/  measure.ts (DOM)  plan.ts (pure)  balance-columns.ts (pure)
│  │  ├─ matrix/  collide.ts (pure)  measure-labels.ts
│  │  └─ ready.ts  price.tsx  dietary.tsx  legend.tsx  watermark.tsx  crop-marks.tsx
│  ├─ design-system/src/
│  │  ├─ fonts/  pairings.ts  files/ (mirrored woff2 + css)  scripts/mirror-fonts.ts (+)
│  │  ├─ palettes.ts  contrast.ts  ornaments/  icons/glassware/  icons/food/  dietary-marks/  textures/
│  └─ i18n/src/  dir.ts  scripts.ts (script detection)  locale.ts
├─ supabase/  config.toml  migrations/  seed/seed.ts  tests/rls/ (+)
├─ infra/  bin/app.ts  lib/{web,menu,api,worker}-stack.ts
├─ e2e/ (+)  happy-path.spec.ts  print-geometry.spec.ts  visual/  fixtures/
├─ evals/ (+)  fixtures/ (10 menu images you provide)  extract-eval.ts
└─ docs/  README.md  ARCHITECTURE.md  RUNBOOK.md
```

---

## 5. Data model amendments and derived rules

These are the changes I'm proposing to spec §4 (decision **D6**). Everything else follows the spec exactly.

| # | Amendment | Reason |
|---|---|---|
| A1 | `item.price: int \| null`. Extraction may return `currency: null`, and the review screen forces a choice, defaulting to the venue's currency. | §7.1 already asks for "items without prices" warnings and `currency: null`. A required price makes those cases unrepresentable. Null renders nothing (no "0"). |
| A2 | `venues.timezone` (IANA, required, suggested from city/country). | §9 availability windows are "respected by venue timezone", but the spec's `venues` table has no timezone column. |
| A3 | `ai_usage` gains `project_id, request_id, prompt_name, prompt_version, model, cache_read_tokens, cache_write_tokens, attempt, status (started/succeeded/failed), stop_reason, latency_ms`. `cost_minor` becomes **`cost_usd_micros` bigint**. | Rate limiting counts `started` and `succeeded` rows in a sliding window, so no extra table is needed. Whole cents round a typical 2–4¢ call badly, and micros stay integer (rule 7). |
| A4 | `block.styleOverrides` is a **closed object of enum values**: `{paletteRole?, density?, textCase?, ornament?, align?}`. | Rule 1: nothing CSS-shaped can reach the renderer from the model. |
| A5 | `item.inferredFields` entries must come from a whitelist of item-relative paths (`name`, `price`, `dietaryTags`, `allergens`, `attributes.glassware`, `attributes.flavor`, …). | Makes the review UI and confirmation logic total, and stops the model inventing paths. |
| A6 | `schemaVersion` literal on MenuDocument, DesignBrief and LayoutSpec. | jsonb migrations over the life of stored versions. |
| A7 | LayoutSpec carries `format` and `orientation`, copied from the brief. | A spec must render on its own: the print route, QR and PNG get nothing else. Format is design, not content (rule 3). |
| A8 | `spec_versions` gains `seq int` (ordering) and `edits jsonb` (the ops that produced the row). | Per-edit undo, history labels, audit. |
| A9 | Add a `billing_events` table (provider, event_id unique, payload, processed_at). | Idempotent webhook processing (§11), with Zod-validated payloads (§19). |
| A10 | Document-internal ids are short and minted **server-side** (`sec_`, `itm_`, `blk_`, `pg_` + 8 base36 chars). Row ids are uuid. | Claude never invents ids, prompts use fewer tokens, and there are no collisions. |

**AI wire schemas (not a domain change).** Structured outputs can't express records or `any`, so:
- `translations: {[lang]: …}` travels as `[{lang, name, description}]`.
- JSON Patch `value` travels as `valueJson: string`.

`apps/api/src/ai-wire/` converts to the domain shapes before Zod and fast-json-patch see them. API clients never see wire shapes.

**Money.**
- `packages/shared/money.ts` holds the ISO 4217 exponent table (INR, GBP, USD = 2; JPY = 0; BHD, KWD = 3).
- Parsing works on strings ("₹1,250", "12.50", "12,50 €") without floats.
- Formatting uses `Intl.NumberFormat` on integer-divided parts.

---

## 6. Renderer, formats and design system

### 6.1 Formats (mm, trim size, portrait)
| Format | Trim | Pages / panels | Bleed / crop marks | Notes |
|---|---|---|---|---|
| A4 | 210 × 297 | 1..n | yes | acceptance: bleed PDF = **216 × 303** |
| A3 | 297 × 420 | 1..n | yes | |
| A5 | 148 × 210 | 1..n | yes | |
| US_LETTER | 215.9 × 279.4 | 1..n | yes | |
| US_LEGAL | 215.9 × 355.6 | 1..n | yes | |
| POSTER_A2 | 420 × 594 | 1 | yes | |
| BIFOLD_A4 | **assume** folded size A4, printed flat A3 landscape (420 × 297), 2 sides, centre fold marks | 2 sheets | yes | D10: or did you mean A4 folded to A5? |
| DL_TRIFOLD | flat A4 landscape (297 × 210), 2 sides, roll-fold panels 100 / 100 / 97 | 2 sheets | yes | orientation locked |
| TABLE_TENT | **assume** A5 portrait flat (148 × 210) folded at mid-height into two landscape A6 faces (148 × 105), face B rotated 180° | 1 sheet | yes | D10 |
| CHALKBOARD_WIDE | **assume** a digital 16:9 menu board, 1920 × 1080 px PNG plus a 16:9 PDF, no bleed | 1 | no | D10: or a physical wide board? |
| MOBILE | 390 CSS px wide, continuous height | 1 | no | PNG only |

- **Safe zone** is 5 mm inside trim and can be toggled in the editor.
- **Bleed:** backgrounds, textures and ornaments extend 3 mm past trim.
- **Crop-mark PDF** page = trim + 2 × (3 mm bleed + 10 mm slug). Marks sit in the slug. `pdf-lib` writes TrimBox and BleedBox. The 216 × 303 acceptance applies to the no-marks PDF.

### 6.2 Renderer contract
- `<MenuRenderer document spec mode now? locale? watermark? editable? onReady? />`.
- **Pure:** no `Date.now`, no `Math.random`, no network. `now` is injected (availability windows) and ids are stable.
- **Archetype registry:** metadata lives in `packages/shared/archetypes.ts` so the API can validate and prompt without React. Components live in the renderer. A parity test keeps the two in step.
- **CSS:** plain CSS with an `ms-` prefix and **logical properties** (RTL ready from day one). No Tailwind inside the renderer, so print and QR never inherit app styles.
- **Overflow engine** = `measure` (DOM, browser only) + `plan` (pure: measurements + spec + format rules → `Edit` ops or an `OverflowReport`). It tries four steps in order:
  1. Reduce density.
  2. Scale the body font, down to 8.5 pt print / 14 px mobile.
  3. Rebalance columns (greedy bin-balance, pure).
  4. Add a page if `pageCountPreference` allows; otherwise flag the overflow.

  Plans run with 1.5 % headroom because macOS and Linux Chromium measure text slightly differently (R4).
- **Ready signal:**
  - It fires once `document.fonts.ready` has resolved, every pairing family passes `document.fonts.check`, and the overflow pass is done.
  - The renderer then sets `window.__MENU_RENDER__ = {status, overflow}` and dispatches `menu:ready`.
  - **The export fails loudly if fonts didn't load.** It never falls back silently.
- **Matrix collision** (pure, deterministic):
  - Labels are measured rects. Widths come from canvas `measureText` in the loaded font, never per-glyph constants.
  - Each pass pairwise-pushes overlapping labels apart while a spring pulls them back toward their anchors. Maximum 50 iterations, minimum spacing 8 mm, visited in itemId order.
  - Locked placements never move, and labels stay inside the plot.
  - A leader line is drawn when a label is displaced more than 4 mm.
  - Nudges are render-time only; stored placements keep their true coordinates.
- **Watermark** (free plan) is rendered by the renderer, never burned in by the worker.

### 6.3 Curated catalogs (proposed ids; final metadata in P1)
| Font pairing id | Display / body | Scripts | Suits |
|---|---|---|---|
| `zen-minimal` | Shippori Mincho / Zen Kaku Gothic New | latin, japanese | japanese_minimal |
| `deco-limelight` | Limelight / Josefin Sans | latin | art_deco, speakeasy |
| `modern-serif` | Fraunces / Instrument Sans | latin | modern serif |
| `geometric` | Outfit / DM Sans | latin | geometric sans |
| `chalk-hand` | Cabin Sketch / Patrick Hand | latin | chalkboard |
| `editorial` | Playfair Display / Source Serif 4 | latin | editorial magazine |
| `bistro-garamond` | EB Garamond / EB Garamond (small caps) | latin | parisian_bistro |
| `luxe-didone` | Bodoni Moda / Jost | latin | luxury_hotel |
| `street-bold` | Bebas Neue / Barlow | latin | street_food, retro_diner |
| `devanagari-modern` | Rozha One / Hind | latin, devanagari | modern_indian |
| `devanagari-classic` | Tiro Devanagari Hindi / Mukta | latin, devanagari | traditional Indian |
| `arabic-kufi` | Reem Kufi / IBM Plex Sans Arabic | latin, arabic | arabic-compatible |

Palettes (12, each with moodTags):
- `washi`, `sumi-night`, `deco-noir`, `bistro-cream`, `botanical`, `coastal`
- `kraft`, `saffron`, `chalkboard`, `concrete`, `diner`, `espresso`

A unit test checks WCAG AA contrast for every text-bearing role (`text`, `muted`, and `accent` wherever it colours text) against `background` and `surface`. Mid-tone accents that pass on dark grounds often fail on light ones, so decorative-only accent use is tracked separately.

---

## 7. AI layer

- **Model:** `apps/api/src/config/ai.ts` exports `AI_MODEL = env.AI_MODEL ?? "claude-opus-5"`. It is the only reference anywhere. Per-endpoint `effort` and `max_tokens` live in the same file.
- **Refusal fallbacks:** requests use the server-side `fallbacks: "default"` option (beta header `server-side-fallback-2026-07-01`). If a safety classifier declines, the API re-runs the request on Anthropic's recommended fallback model instead of failing. Menu content is unlikely to trigger it; I'm telling you because it is on by default. `ai_usage.model` records which model actually served each call.
- **`runStructured()`** in `services/anthropic.ts` is the only way endpoints call Claude:
  1. **Reserve.** In one transaction: check the rate limit (count of `ai_usage` rows in the window), check plan credits, insert an `ai_usage` row with `status=started`.
  2. **Call.** `messages.stream` with `output_config.format` built from the **wire** schema, adaptive thinking, the prompt's system text with a cache breakpoint after the static catalogs, and an `AbortSignal` timeout.
  3. **Validate.** Wire → domain conversion, then the domain Zod schema, then semantic validators (catalog ids exist, concepts are distinct, archetype eligibility, `test`-op rule for edits).
  4. **Retry once on failure.** Append the model's output plus a user turn listing the Zod issues (append-only history) and call again. A second failure throws `AiInvalidOutputError` → HTTP 422 `{code: "ai_invalid_output", retryable: true}` → the UI shows a friendly message with **Try again**.
  5. **Other failure modes:**
     - `stop_reason: max_tokens` counts as invalid output.
     - `refusal` after fallback → `AiRefusedError`.
     - Timeout → `AiTimeoutError`.
     - 429/5xx are retried by the SDK, then become `AiUnavailableError`.
  6. **Finalize.** Update the `ai_usage` row with token counts, cost and status, then log one JSON line carrying the request id.
- **Prompts:** each prompt file exports `{name, version, system, buildUserMessage, outputSchema}`. `prompts/index.ts` pins the active versions, and a new version is a new file, never an edit.
- **Endpoint rules enforced in code, not only in prompts:**
  - `/concepts`:
    - The archetype enum is built per request: implemented archetypes that the content qualifies for. `flavor_matrix` needs ≥ 6 drinks with flavor data or ingredients; `poster` needs ≤ 15 items.
    - Same-archetype concepts must differ in font pairing, palette **and** density.
    - `rationale` is cut to 2 sentences in code, because length limits don't hold through prompting alone.
  - `/edit`:
    - The prompt includes an index map (`/sections/2/items/4 = itm_x7k2p9 "Genko"`).
    - Every op that mutates an array element must be preceded by a `test` op on that element's `id`, so stale indices fail atomically.
    - `clarifyingQuestion` and `unsupported` are part of the output schema.
  - `/engineering/suggest`: quadrants are computed in `shared/engineering/quadrants.ts`. The accepted spec patch passes a guard that allows **emphasis changes only** (never removal).
  - `/describe-reference`: output is **enum descriptors only** (mood, density, layout pattern), with no free-form layout, text or coordinates, so reproducing a reference is structurally impossible.
- **Uploads:** 20 MB and 10 pages maximum.
  - Images are normalised by `sharp`: EXIF stripped, rotated upright, long edge capped, re-encoded.
  - PDFs are page-counted with `pdf-lib` before any Claude call.
  - HEIC is rejected in v1 with a clear message. Mobile camera capture produces JPEG anyway.
- **Testing without a key:** `AnthropicLike` is injected, with fixture responses for valid output, invalid-then-valid, invalid twice, refusal and max_tokens. `pnpm --filter api smoke:<endpoint>` scripts run live only when `ANTHROPIC_API_KEY` is set.

---

## 8. Export, publish and jobs

- **pg-boss** uses `DATABASE_URL` pointed at Supabase's **session** pooler or a direct connection, never the transaction pooler on 6543. Queues: `export`, `publish`, `bulk_export`.
- **Print route:**
  - Path: `WEB_URL/print/:projectId/:versionId?token=…`.
  - The token is HMAC-SHA256 (`PRINT_TOKEN_SECRET`), expires in 5 minutes, and is scoped to project, version and purpose.
  - The route renders with `mode="print"` and no app chrome.
- **Export job:**
  1. Open the route in pooled Chromium and wait for `menu:ready`.
  2. Fail the job if the report shows overflow or unloaded fonts.
  3. Produce, as requested:
     - `page.pdf({preferCSSPageSize: true, printBackground: true})`
     - the crop-mark variant with pdf-lib boxes
     - PNGs at 300 DPI trim size (A4 = 2480 × 3508, via deviceScaleFactor 300/96) and 1080 px wide
     - the print pack zip, with a README covering paper size, bleed, the RGB-only note and agency white-label
  4. Upload to Storage, update the `exports` row. Realtime pushes status to the export modal.
- **Publish job:**
  1. SSR-render the version with the Vite-built `apps/menu` server entry (`mobile_stack` or `match_print`).
  2. Write static HTML plus immutable versioned JSON through `PublishTarget`: a local directory in dev, S3 in prod.
  3. To hit "live in < 10 s" without CloudFront invalidations (not guaranteed that fast), HTML is served with `s-maxage=5, stale-while-revalidate` and data URLs are content-hashed.
- **QR analytics:**
  - A `navigator.sendBeacon` to `/analytics` with no cookies, no IP stored and no user agent stored. Device class is derived and discarded.
  - A nightly aggregation job rolls rows into `menu_views` and `item_clicks`.

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Structured outputs can't express records, `any` or numeric bounds | Wire schemas + converters (§5); domain Zod validation after every call |
| R2 | JSON Pointer index drift makes AI patches hit the wrong item | Index map in prompt + mandatory `test` ops on ids; atomic apply; retry with the failure message |
| R3 | No Docker locally (D3); Supabase built-in SMTP rate-limits magic links | Docker install or hosted dev project; tests sign in via admin-generated links; custom SMTP before staging |
| R4 | **Editor (macOS Chrome) and worker (Linux Chromium) measure text differently**, so a page that fits in the editor can overflow in the PDF | Worker re-measures and auto-fits or fails with a report; 1.5 % headroom; visual baselines generated only in the Linux Playwright image |
| R5 | pg-boss on Supabase: transaction pooler breaks it; direct connections are IPv6-only, which matters on Fargate | Session pooler URL; documented in RUNBOOK; startup check that refuses port 6543 |
| R6 | Chromium PDFs are RGB with no trim boxes | pdf-lib post-process for boxes; CMYK listed as a v1 limitation in the print pack README (per spec) |
| R7 | QR JS budget < 100 KB: the React 19 client runtime alone is roughly 60 KB gzipped | Islands hydration (only filters, search, language switch hydrate) with a measured budget check in CI. If it can't fit, I'll ask about Preact rather than cut features. |
| R8 | `/concepts` latency: three full LayoutSpecs with adaptive thinking may approach 60 s | SSE progress events; per-endpoint `effort` tuned against measured runs. Changing the model is your call, not mine. |
| R9 | `fast-json-patch` unmaintained since 2022 | Wrapped behind `shared/patch/apply-edit.ts`, so it can be swapped without touching callers; prototype-pollution guard left on |
| R10 | RLS scope includes pg-boss's own `pgboss` schema tables | Enable RLS with no policies on them (not exposed through PostgREST anyway) + CI assertion that every table in `public` and `pgboss` has `relrowsecurity` |
| R11 | Inline `contentEditable` fights React re-renders (text jumps, lost caret) | Uncontrolled edit overlay per field, commit on blur/Enter, keyed remount after commit |
| R12 | Scope: 9 phases need external accounts (Anthropic, Google OAuth, Stripe, Razorpay, AWS, domain, Sentry) | Each phase lists the inputs it needs; acceptance I can't verify locally is reported as "partially verified" with the reason, never as passed |
| R13 | Font files: Japanese and Devanagari fonts are large | Mirror Google's `unicode-range` slices so browsers fetch only glyphs in use; export waits on `document.fonts` |

---

## 10. Open questions (non-blocking)

| Question | Default I'll use until told otherwise |
|---|---|
| `published_menus.slug` vs `venues.slug`: can a venue publish more than one menu (e.g. `/slug/drinks`)? | `venues.slug` is the site root; `published_menus.slug` is a sub-path, `main` by default |
| Does "never use fonts outside the curated list" also cover the owner app's chrome? | No: the rule covers menus. App chrome uses its own two self-hosted fonts (Instrument Serif + Geist). |
| `brandAssets.brandFonts` must be `fontId[]`, but owners will ask for their own brand font | Only curated ids are accepted; the brief UI suggests the closest pairing by mood tags |
| Watermark text and placement | "Made with Menu Studio", 7 pt, bottom margin inside the safe zone, 40 % muted |
| Plan prices per currency | Placeholders in `shared/billing/plans.ts` marked `TODO(price)`. You supply the real numbers. |
| e2e "upload seed image" fixture | I render a seed menu to PNG as the fixture. You provide 10 real menu photos you have rights to, for `evals/`. |
| Agency custom QR subdomain | Needs wildcard DNS + CloudFront alternate domains. Designed in P8, wired in P9 when AWS exists. |
| App UI direction | Warm paper/stone neutrals, ink text, one restrained accent, hairline rules, 6 px radii, no stacked shadows. Menus are the only saturated thing on screen. |

---

## 11. Phases, tasks and estimates

Estimates are **focused agent build hours**, assuming the inputs listed for the phase are in hand. They include tests, fixes and the phase summary, but not waiting on external accounts.

**Suggestion: split Phase 1 into 1A and 1B,** with a checkpoint between them.
- 1A needs nothing external, so you can review the renderer early.
- 1B is where D3 (Supabase) is needed.

Both halves together meet the spec's Phase 1 acceptance.

### Phase 1A: Tooling, schemas, design system, renderer (≈ 9–12 h)
1. Workspace:
   - pnpm + Turborepo (`typecheck`, `lint`, `test`, `build`, `dev`)
   - `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`)
   - ESLint flat config (`no-explicit-any: error`, and a `no-restricted-syntax` rule banning `dangerouslySetInnerHTML`), Prettier
   - `.env.example` with every variable documented, `.nvmrc`
2. `shared`:
   - all Zod schemas
   - `money.ts` + tests, `formats.ts`, `archetypes.ts` registry, `ids.ts`
   - `applyEdit` + integrity + guards + tests
   - 4 seed menus, each with one hand-built LayoutSpec. The bar seed includes a cocktail named **Genko** so the Phase 4 acceptance sentence works.
3. `design-system`:
   - 12 pairings + font mirroring script
   - 12 palettes + AA contrast tests
   - 5 ornaments, dietary marks + legend
4. `i18n`: `dir` and script helpers (full work in P7).
5. `renderer`:
   - MenuRenderer, Page (mm, bleed, safe zone), token variables, price placement and styles
   - `classic_list`, `two_column` (bin-balance)
   - overflow engine (measure + plan, all 4 steps) + ready signal
   - static-markup snapshot tests
6. `web` (no backend yet): app shell in the design language, and `/dev/editor/:seed` with canvas (zoom, thumbnails, bleed/safe toggles, overflow badges) and inline text edits applied through `applyEdit`.
7. Playwright Test: A4 page box measures 210 × 297 mm for both archetypes.

**Checkpoint 1A:** renderer screenshots of all 4 seeds in both archetypes, plus test output.

### Phase 1B: Supabase, auth, onboarding, versions, CI (≈ 8–11 h)
1. Supabase:
   - `config.toml`
   - migrations for `organizations, memberships, venues, projects, spec_versions, concepts, uploads, exports, ai_usage, audit_log`
   - RLS policies + helpers, storage buckets + policies
   - auth: magic link + Google provider config
2. RLS tests per table (owner, editor, viewer, other org) + the "RLS on every table" assertion.
3. `api`: Hono app, request-id + JSON logs, typed error middleware, auth middleware, routes for onboarding (org, venue), projects (create from seed), versions (save edits, list, move head). Tests via `app.request()`.
4. `web`:
   - auth screens, onboarding (currency suggested from country), minimal dashboard
   - the editor persists every edit as a version
   - undo/redo with ⌘Z / ⇧⌘Z
   - archetype switch between the two
5. CI: GitHub Actions running lint, typecheck, unit tests, then `supabase start` + RLS tests + Playwright geometry test.

**Accept (spec):** sign in, create a venue, open a seed project, edit an item name, undo it, and see both archetypes at correct A4 mm size.
**Your inputs:** D1–D6. Google OAuth client ID/secret, optional for acceptance since magic link covers sign-in.

### Phase 2: AI ingestion and concepts (≈ 12–16 h)
1. `config/ai.ts`, `runStructured` (reserve → call → validate → retry → finalize), typed errors, rate limit + metering middleware, SSE progress events.
2. Uploads: signed Storage upload, `sharp` normalisation, `pdf-lib` page limit, 20 MB cap.
3. `/extract`:
   - prompt v1; image, PDF and raw text inputs; server id minting; warnings
   - **review screen:** grouped editable table, inferred fields highlighted with confirm/clear, warnings list, add/remove/reorder items and sections (dnd-kit)
4. **Brief screen:** format thumbnails, both sliders with live mini-previews drawn by the real renderer, vibe chips, brand assets, reference uploads, notes. `/describe-reference` (enum descriptors).
5. `/concepts`:
   - prompt v1 with catalogs, dynamic archetype enum (only the implemented archetypes), distinctness validator
   - `concepts` rows per batch
   - **gallery:** 3 large previews (swipe on mobile), Use this, Regenerate all, More like this; browser overflow check + auto-fit (D7)
6. Tests: fixture-driven retry paths, eligibility rules, wire ⇄ domain converters, upload limits.

**Accept:** a real menu photo becomes an editable structured menu with inferred fields highlighted. A brief produces 3 visibly distinct concepts in under 60 s (timed live).
**Your inputs:** `ANTHROPIC_API_KEY`, 2–3 real menu photos.

### Phase 3: Signature archetypes (≈ 14–20 h)
1. Icons:
   - glassware (15): line style, liquid in `colorHex`, configurable fill level
   - food icons (8)
2. `flavor_matrix`: quadrants, axis labels, glassware above names, collision engine, drag, lock toggle, reset to AI placement, arrow-key nudge.
3. The other six archetypes, with registry eligibility:
   - `editorial`, `by_base_spirit`, `tasting_journey`
   - `poster` (warns above 15 items), `chalkboard`, `grid_cards`
4. `/concepts` unlocks the new archetypes through the registry.
5. Snapshot tests for every archetype × applicable seed. Playwright assertion: no overlapping label rects on the bar seed.

**Accept:** the bar seed renders a flavor matrix with no overlaps. Drag and lock persist across reloads (through versions).

### Phase 4: AI editing (≈ 10–14 h)
1. `/edit`: prompt v1 (index map, selection, `test`-op rule, `clarifyingQuestion`, `unsupported`), wire `valueJson`, server apply through the shared pipeline, `source: ai_edit`.
2. Chat panel: summary per edit, one-click per-edit undo, clarifying-question round trip.
3. Inspector tab: tokens, block emphasis. Content tab: quick item editing.
4. Version history drawer with restore.
5. A scripted check of the three acceptance instructions against the bar seed, asserting the ops are minimal and scoped.

**Accept:** "make the desserts section more prominent", "switch to a darker palette" and "move Genko closer to bitter" each produce the smallest correct change and a readable summary.

### Phase 5: Export (≈ 12–16 h)
1. `apps/worker`: pg-boss consumer, Chromium pool, Dockerfile.
2. Print token + print route.
3. Outputs: bleed PDF, crop-mark PDF (pdf-lib boxes), PNG at 300 DPI and 1080 px, print pack zip with README.
4. Free-plan watermark through the renderer (plan check stubbed until P8).
5. Storage upload, `exports` rows, Realtime status in the export modal.
6. Tests: MediaBox = 216 × 303 mm (±0.1), every font embedded, no overflow, zip contents.

**Accept:** the A4 PDF is exactly 216 × 303 mm with bleed, fonts embedded, no overflow, and the print pack downloads.
**Your inputs:** D4 approval for `yazl`.

### Phase 6: QR menu (≈ 14–18 h)
1. Migrations + RLS: `published_menus`, `menu_views`, `item_clicks`.
2. Publish job (SSR + `PublishTarget` local). `mobile_stack` archetype + `match_print` mode.
3. `apps/menu`: sticky tabs, search, dietary filters, language switcher, 86'd items hidden, availability windows in the venue timezone, allergen expanders.
4. Anonymous analytics endpoint + nightly aggregation.
5. Dashboard:
   - QR generator (SVG/PNG, centre logo at error-correction level H, venue colours with a contrast guard)
   - table tent template through the renderer
   - quick edit + 86 toggle + "re-export print?" prompt
6. Lighthouse against the local static build with 4G throttling; CI check on the JS budget.

**Accept:** publish goes live at its slug in < 10 s, a quick-edit price change updates the live menu, and LCP is < 1.5 s. *Verified locally. CloudFront confirmation comes after P9.*

### Phase 7: Multi-language and menu engineering (≈ 10–14 h)
1. `/translate` prompt v1 (wire arrays → records), script coverage check against pairing metadata with a suggested compatible pairing, language switcher, RTL verification (Arabic sample).
2. Engineering:
   - cost/popularity table, CSV import
   - deterministic quadrants (documented thresholds, tests), quadrant chart
   - `/engineering/suggest` (Claude writes wording only), accept/reject through the emphasis-only guard

**Accept:** the Delhi seed renders correctly in Hindi with a Devanagari-compatible pairing. Suggestions change emphasis only and never remove items.

### Phase 8: Billing and agency (≈ 14–20 h)
1. Billing:
   - `BillingProvider` with Stripe and Razorpay (test mode)
   - plans config per currency, provider chosen by org country
   - checkout, invoices
   - webhooks: signature verification + Zod + `billing_events` idempotency
2. Migrations + RLS: `subscriptions`, `credits`, `billing_events`. Credit enforcement in the AI and export paths; paywalls.
3. Agency: org type, client venues, white-label settings, handoff invite, `bulk_export` job.

**Accept:** an INR org sees Razorpay and a GBP org sees Stripe, free-plan limits hold, and an agency manages 3 client venues and batch-exports them.
**Your inputs:** Stripe + Razorpay test keys and webhook secrets, real plan prices.

### Phase 9: Hardening and deploy (≈ 16–24 h)
1. RLS suite completion, Sentry (web/api/worker), cross-service request ids.
2. Admin page (internal role only), GDPR data export + account deletion, privacy stub.
3. AI eval script (`evals/`: item recall, price accuracy, false inference rate), visual regression suite (Linux baselines).
4. CDK stacks: Web, Menu, Api, Worker (autoscale on queue depth), Secrets Manager.
5. GitHub Actions: PR checks, staging on `main`, production behind manual approval.
6. README, ARCHITECTURE, RUNBOOK (export failures, AI outages, webhook replay).

**Accept:** CI green, staging deployed from `main`, production via manual approval, runbook complete.
**Your inputs:** AWS account + deploy credentials, domains, Sentry DSNs, GitHub environments.

**Total ≈ 119–165 agent hours**, gated by external accounts at P1B (Supabase), P2 (Anthropic), P8 (payments) and P9 (AWS).

---

## 12. Testing and verification strategy

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | Zod schemas, money, `applyEdit` + integrity, overflow `plan`, column balancing, matrix collision, quadrants, plan limits, wire converters, palette contrast, print token |
| Renderer snapshots | Vitest + `react-dom/server` static markup | every archetype × applicable seed (deterministic, no DOM needed) |
| Browser geometry | Playwright Test | mm page sizes, overflow measurement on real fonts, label non-overlap, ready signal |
| Visual regression | Playwright `toHaveScreenshot` | print route per archetype; baselines generated **only** in the Linux Playwright image |
| API | Vitest + Hono `app.request()` + fake `AnthropicLike` | every endpoint, including the invalid-JSON retry and typed-error paths |
| RLS | Vitest against local Supabase | owner / editor / viewer / other-org, per table |
| E2E | Playwright Test | upload → review → brief → concept → AI edit → export PDF → publish → view public menu |
| AI eval | `evals/extract-eval.ts` (manual, not CI) | item recall, price accuracy, false inference rate |

**Phase gate:**
1. `pnpm turbo typecheck lint test` passes, plus the phase's Playwright specs.
2. CLAUDE.md is updated and `PHASE_N_SUMMARY.md` is written (built / stubbed / known issues / next steps).
3. I stop for your approval.
