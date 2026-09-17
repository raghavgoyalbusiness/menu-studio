# Architecture

How Menu Studio is put together, and why. The short version of the rules is in
[CLAUDE.md](../CLAUDE.md); this explains the reasoning behind them.

## The shape of the problem

A menu is a legal document as much as a design: prices, allergens and dietary marks have to be
exactly what the venue wrote, and the printed result has to be the right physical size. Both of
those fight against the obvious way to use a language model, which is to let it write markup.

So the model is confined to two jobs:

1. **Reading** a menu into structured JSON (`MenuDocument`).
2. **Choosing** from a closed set of design options (`LayoutSpec`), or proposing JSON Patch
   operations against one of those two documents.

Everything visual is code.

## Two documents, one renderer

```
MenuDocument   what the venue sells: sections, items, prices, allergens, languages
LayoutSpec     how it looks: archetype, pairing id, palette id, density, pages, matrix placements
```

They are separate on purpose. An `Edit` is `{target: "document" | "spec", ops}` with exactly one
target, so a price change can never reach the typography and a font change can never touch a price.
`packages/renderer` takes both and draws the menu. Nothing else draws a menu — the editor canvas,
the `/print` route the worker screenshots, the PNG export and the published QR page are all the same
component tree with different props.

That is what makes "what you see is what gets printed" true rather than aspirational.

## Mutations: one pipeline

Inline edits, drags, the inspector, AI edits, auto-fit and menu-engineering suggestions all take
the same path:

1. The client applies the edit optimistically with `shared/patch/applyEdit` (RFC 6902).
2. It `POST`s to `/projects/:id/versions` with the `baseVersionId` it started from.
3. The server re-applies the ops, validates the result with Zod, runs integrity checks, inserts a
   `spec_versions` row and moves `current_version_id` — in one transaction. A stale base is a 409.

Every op that touches an array element is preceded by a `test` op on that element's `id`, so an
edit written against a menu that has since changed fails instead of hitting the wrong item. Undo
and redo are just moving `current_version_id` along the chain; restore inserts a copy.

## AI calls

Every model call goes through `runStructured()` in `apps/api/src/services/anthropic.ts`:

1. Reserve an `ai_usage` row (this is both the rate limit and the credit check).
2. Call the model with a structured-output format built from a **wire schema**.
3. Convert wire → domain, validate with Zod, then run semantic validators.
4. On failure, retry once with the Zod issues appended to the prompt.
5. On a second failure, throw a typed 422 (`ai_invalid_output`, `retryable: true`).
6. Finalize the usage row with tokens, cost in micro-USD and the prompt version.

Wire schemas exist because structured outputs forbid records, `any` and numeric bounds: maps travel
as arrays and a JSON Patch `value` travels as a `valueJson` string. Nothing outside `ai-wire/` ever
sees a wire shape.

The prompt asks for things; the code enforces them. Concepts must be distinct, catalog ids must
exist, `flavor_matrix` needs at least six eligible drinks, a poster takes at most fifteen items,
rationale is truncated to two sentences, and an edit that changes a price the owner did not ask
about is refused rather than applied.

## Money

Integer minor units everywhere, with the ISO 4217 exponent table in `shared/money.ts`. Prices are
parsed from strings — `"₹380"`, `"12,50 €"`, `"1.234,50"` — and a genuinely ambiguous string returns
`null` rather than a guess. No float ever touches a price. `ai_usage` costs are micro-USD integers
for the same reason.

## Physical output

Pages are described in millimetres: a 3 mm bleed, a 5 mm safe zone, and a 10 mm slug on the
crop-mark variant. The worker opens the `/print` route with a short-lived HMAC token, waits for the
renderer's ready signal, and calls `page.pdf({preferCSSPageSize: true})`. Chromium rounds the page
box, so pdf-lib then scales the content to the exact target and sets MediaBox, TrimBox and BleedBox
itself. `e2e/print-geometry.spec.ts` asserts the resulting numbers: 216 × 303 mm with a 210 × 297
trim box, and 236 × 323 mm with crop marks.

Fonts are mirrored as **static** instances rather than variable ones, because Chromium embeds a
variable font as Type3 glyph procedures — which print as outlines and are not searchable. The export
job fails loudly if fonts did not load or the content overflowed; it never silently ships a menu
that does not fit.

## Overflow

Measuring happens in the DOM, planning is pure. In order: density → body font size (floor 8.5 pt in
print, 14 px on mobile) → rebalance columns → add a page if the brief allows, otherwise flag it for
the owner. The plan reserves 1.5 % headroom because text metrics differ between macOS and Linux, and
a menu that fits on a designer's laptop must still fit on the render farm.

## The QR menu

Published menus are pre-rendered HTML written straight to S3 (or the local filesystem) with two
small vanilla islands: search and section tabs. No framework ships to the diner. Fonts are subset per
pairing. HTML carries `s-maxage=5`, so a republish is live in seconds without a CDN invalidation,
while hashed assets are immutable for a year.

## Security

- RLS on **every** table, including the `pgboss` schema, which gets no policies at all.
- The API talks to PostgreSQL as the signed-in user: `SET LOCAL ROLE authenticated` plus
  `request.jwt.claims`, so the same policies that protect Supabase protect direct SQL.
- The service-role key is only used by the worker, webhooks and metering — never in a client bundle.
- The `/print` route requires an HMAC token scoped to a project and version, valid for five minutes.
- Owner text is always rendered as text. `dangerouslySetInnerHTML` is banned by lint.

`packages/server-core/test/rls.test.ts` checks owner, editor, viewer and outsider access on every
table, and fails if a new table ships without RLS.

## Local development without Docker

The local stack runs a real PostgreSQL 18 through `embedded-postgres`, with a small SQL shim that
recreates the Supabase roles and `auth.uid()`. That means RLS policies, pg-boss and the migrations
are exercised locally exactly as they are in production, with no container runtime installed.

## Deployment

`infra/` defines five CDK stacks: Secrets (one Secrets Manager secret whose fields are injected into
tasks one by one), Menu and Web (private S3 buckets behind CloudFront), Api (Fargate behind an ALB)
and Worker (Fargate, no load balancer, more memory for Chromium). Images are built by CI and pushed
to ECR; nothing secret is ever passed as a CDK parameter or a task-definition environment variable.
