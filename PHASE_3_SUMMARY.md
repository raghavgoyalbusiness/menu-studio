# Phase 3: Signature archetypes

## Built

All ten archetypes, each with its own eligibility rule in `packages/shared/src/archetypes.ts`:

| Archetype | Notes |
| --- | --- |
| `classic_list` | The default; one column, leader dots optional |
| `two_column` | Bin-balanced across columns rather than split by count |
| `editorial` | Magazine-style, with a featured item block |
| `grid_cards` | Cards for photo-light menus |
| `poster` | At most 15 items, enforced in code |
| `chalkboard` | Wide format, no crop-mark variant |
| `mobile_stack` | Phone format; exports as PNG, publishes as a QR menu |
| `flavor_matrix` | Needs ≥ 6 eligible drinks with flavor coordinates |
| `by_base_spirit` | Groups drinks by base spirit |
| `tasting_journey` | Ordered progression with a route ornament |

- **Matrix placement**: labels are placed by a relaxation pass (≤ 50 iterations) followed by a
  nearest-free-spot guarantee pass. It is deterministic, locked labels never move, and an e2e test
  asserts zero overlaps on the seeded cocktail menu, which clusters twelve drinks tightly.
- **The inspector**: archetype, pairing, palette, density, price placement and the closed
  `styleOverrides` set. Nothing here accepts free-form CSS.
- **Auto-fit**: runs the overflow engine's plan and offers the resulting edits as one commit.

## Deviations from the plan

- The first matrix implementation left 9 overlaps among 12 clustered labels. It was rewritten
  (relaxation, then a spiral search for a free spot) rather than tuned.

## Known issues

- `grid_cards` is built for menus without photographs, because the product never generates or
  accepts AI food photography. It reads as sparse on very short menus.

## Verified

43 renderer snapshots across archetypes and seeds. `e2e/happy-path.spec.ts` asserts the matrix
renders at least six labels with no overlapping bounding boxes.
