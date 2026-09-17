# Phase 1A: Tooling, schemas, design system, renderer

## Built

- **Workspace**: pnpm workspaces + Turborepo (`typecheck`, `test`, `build`, `dev`), `tsconfig.base.json`
  (strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`), ESLint flat config with typed linting,
  Prettier, `.nvmrc` (Node 24.11.0), `.env.example` documenting every variable.
- **`packages/shared`**: every Zod schema (`MenuDocument`, `LayoutSpec`, `Brief`, `Edit`, DTOs),
  `money.ts` (integer minor units, ISO 4217 exponents, string parsing), `formats.ts`, `archetypes.ts`
  (10 archetypes with eligibility rules), `ids.ts`, `patch/apply-edit.ts` (`applyEdits`,
  `inverseEdit`, `diffEdit`, integrity checks, forbidden-path guards), `billing/plans.ts`,
  `engineering/quadrants.ts`, and four seed menus — a Paris bistro, a Delhi restaurant, a Bangalore
  cafe and a London cocktail bar whose signature drink is **Genko**.
- **`packages/design-system`**: 12 font pairings and 12 palettes (every text-bearing role passes AA),
  ornaments, dietary marks, glassware icons, and `scripts/mirror-fonts.ts`, which mirrors static font
  instances from Google Fonts into a gitignored folder.
- **`packages/i18n`**: direction, script detection and country defaults.
- **`packages/renderer`**: `MenuRenderer` with mm page geometry (3 mm bleed, 5 mm safe zone), token
  variables, price placement, the overflow engine (measure in the DOM, plan purely: density → font
  size → rebalance → add page, with 1.5 % headroom), the ready signal, and static-markup snapshots.
- **`apps/web`**: the app shell in the product's own design language and `/dev/editor/:seed` with
  zoom, bleed and safe-zone toggles, overflow badges and inline text edits through `applyEdit`.

## Deviations from the plan

- Fonts are mirrored as **static** instances, not variable ones. Chromium embeds a variable font as
  Type3 glyph procedures, which print as outlines; this was found in Phase 5 and fixed here.
- All 10 archetypes were registered in `shared` in this phase rather than only the two built, so the
  eligibility rules had one home from the start.

## Known issues

- The mirrored fonts (847 files, 15.3 MB) are gitignored, so a fresh clone must run
  `pnpm fonts:mirror` before rendering anything.

## Verified

`pnpm check` green; 49 shared tests, 43 renderer snapshots, 17 design-system tests. Page geometry is
asserted end-to-end in `e2e/happy-path.spec.ts`: an A4 page measures 210 × 297 mm in the browser.
