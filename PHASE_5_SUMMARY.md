# Phase 5: Export

## Built

- **`apps/worker`**: a pg-boss consumer with `export`, `publish`, `bulk_export` and
  `aggregate_analytics` queues, a loopback `/health` endpoint, and graceful shutdown.
- **The print route** (`apps/web/src/routes/print`): renders a version with no app chrome, behind an
  HMAC token scoped to project and version and valid for five minutes.
- **PDF export**: Playwright's `page.pdf({preferCSSPageSize: true})`, then pdf-lib scales the content
  to the exact target and sets MediaBox, CropBox, TrimBox and BleedBox. Two variants: bleed
  (trim + 3 mm each side) and crop marks (a further 10 mm slug with registration marks).
- **PNG export** at 2× for social and tablets, one file per page.
- **Print pack**: both PDFs, the PNGs and a `README.txt` that states the trim size, the bleed, the
  fonts used and what to tell the printer — zipped with yazl.
- **`inspectPdf()`**: reports page count, MediaBox and TrimBox in millimetres and every font with its
  subtype and whether a real font program is embedded. Type3 counts as *not* embedded.
- **Refusals**: the export job fails loudly if fonts did not load or the content overflowed. It never
  silently ships a menu in a fallback font or with clipped text.

## Problems solved along the way

- Chromium rounded an A4 + bleed page to 215.9 × 303 mm. Fixed by `scaleContent` plus an exact
  `setMediaBox`, giving 216 × 303 mm.
- Fonts embedded as **Type3** — Chromium does that with variable fonts. Fixed by mirroring static
  instances (an older Chrome user agent gets them) and by making the dietary-mark letters inherit the
  menu font instead of `system-ui`.

## Known issues

- `CHALKBOARD_WIDE` has no crop-mark variant, by design: it is a wide display format, not a trimmed
  page.
- Export throughput is bounded by Chromium contexts: `EXPORT_CONCURRENCY` defaults to 2.

## Verified

`e2e/print-geometry.spec.ts` downloads the real exported bytes and asserts 216 × 303 mm with a
210 × 297 mm trim box, 236 × 323 mm with crop marks, and that **every** font is embedded as a real
program and none is Type3.
