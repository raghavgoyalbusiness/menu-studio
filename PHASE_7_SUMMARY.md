# Phase 7: Multi-language and menu engineering

## Built

### Languages

- **`POST /translate`**: translates item names, descriptions and section titles into the requested
  languages. Translations live beside the original (`translations` on the item), never replacing it,
  so the printed menu can show both.
- **RTL**: the renderer uses CSS logical properties throughout, and `dir` comes from
  `packages/i18n`. Arabic, Hebrew, Urdu, Farsi and their regional tags render right to left.
- **Script-aware fonts**: every pairing declares the scripts it covers. When a translation needs
  Devanagari, Arabic or Japanese and the chosen pairing does not have it, `fontWarningFor()` says so
  and names the pairings that do. It warns and suggests rather than switching silently — a font
  change is a design decision, and the owner makes it.
- **Language switching**: in the editor preview, in the export dialog (one PDF per language), and on
  the QR menu, where each language is its own URL with `hreflang` links between them.

### Menu engineering

- **Quadrants**: items are classified as stars, plough-horses, puzzles or dogs from popularity and
  margin, using integer money throughout.
- **`POST /engineering/suggest`**: proposes emphasis changes only. The patch is checked in code: an
  operation that would remove an item, change a price or reword a description is rejected before it
  reaches the document. **Nothing is ever removed from a menu for engineering reasons.**
- **The engineering screen**: the quadrant chart, per-item numbers, and suggestions the owner
  applies one at a time — each one a version.

## Deviations from the plan

- Popularity and margin are entered by the owner or imported from a CSV. There is no POS
  integration; the spec did not ask for one, and guessing at sales data would be worse than asking.

## Known issues

- Translation has never run against the live model (no API key here), so translated typography has
  only been exercised with fixture translations in the seeds.
- Unconfirmed inferred allergens and dietary tags are excluded from print and QR output until the
  owner confirms them (PLAN D9). That is deliberate, and it means a menu can print with fewer marks
  than the review screen showed.

## Verified

i18n unit tests cover direction, script detection in mixed strings, and country defaults. Renderer
snapshots include an RTL pass. The engineering guard is covered by API tests.
