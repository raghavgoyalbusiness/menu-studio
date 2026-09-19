# Phase 10: Drafting a menu, and your own brand colours

Three things asked for after the original spec: designing your own menu, customising it, and
prompting to build one.

## Built

### Draft a menu from a description (`POST /draft`)

The "Describe it" tab on the start screen. The owner describes the place in their own words — there
are four example descriptions to start from — and gets a menu back to argue with.

- `prompts/draft/v1.ts`, `ai-wire/draft.ts`, and its own entry in `config/ai.ts` (high effort,
  24k tokens, 20 calls an hour — a draft is something to iterate on, not to spam).
- The whole flow runs through `runStructured()` like every other AI call, so it is metered, rate
  limited, retried once on invalid output, and recorded with its prompt version.

### Your own brand colours

A new **Your brand colours** section in the editor's Design panel: six roles (paper, panel, text,
secondary text, accent, second accent), each with a picker and a hex field.

- `tokens.customPalette` already existed in the schema and the renderer preferred it over the
  catalog palette; nothing in the UI had ever set it. Now it does.
- Contrast is checked against WCAG AA as the owner types, and an unreadable palette is **held, not
  saved** — the swatches keep moving, nothing commits, and the measured ratio is on screen.
- `clearToken()` in `spec-edits.ts` goes back to a catalog palette. `setToken` could not express
  this: a JSON Patch `replace` with an undefined value serialises to an op with no `value` at all.

### Already there, now findable

Designing from scratch was already possible — "start from a blank menu", the ten archetypes, the
inspector, and chat editing. What was missing was a way in without a menu to import, which is what
`/draft` is.

## How this squares with "never invent menu items, prices or descriptions"

That rule is in the spec's NEVER DO list, and it is the right rule for **reading a menu the owner
already has**: an extra dish or a guessed price on a real menu is a lie about a business. Drafting
is a different intent — the owner is explicitly asking for suggestions — so the rule was narrowed
rather than broken, and the part that actually protects people is enforced in code:

- **No price, ever.** The wire schema has no price field, and `convertDraft` rejects an amount
  smuggled into a name or description, which sends the model back for a retry with that reason.
- **Everything is marked as a guess.** Every field the model produced goes into `inferredFields`,
  so the review screen makes the owner confirm or reject each one, and unconfirmed dietary tags and
  allergens are already excluded from print and QR output (PLAN D9).
- **It can refuse.** Given a description too vague to draft honestly, it returns no sections and
  says what it needs instead of inventing a restaurant.
- The review screen tells the owner plainly that this is a draft, not their menu.

## Found while building

`Tokens.superRefine` called the contrast maths on a custom palette before checking the colours were
valid hex. Zod 4 runs refinements even when an inner field has already failed, so a malformed
colour **threw** instead of failing validation — a 500 on the server where a 422 belonged. The
refinement now skips unless every colour is a valid hex, and there is a test for it.

## Known issues

- Like every other AI endpoint here, `/draft` has **never run against the live model** — no
  `ANTHROPIC_API_KEY` on this machine. Four tests drive it with a scripted client, including the
  smuggled-price refusal and the too-vague refusal. Verified in the browser as far as the model
  call, which returns a clean 503.
- Fonts remain curated. Colour is the thing a venue genuinely already owns; a menu set in whatever
  typeface the owner happens to have would undo the point of the product.

## Verified

215 unit and RLS tests (was 201): four for `/draft`, eight for the spec-edit builders including the
two contrast cases. `pnpm check` and `pnpm e2e` green. In the browser: the brand palette applied
live to the rendered menu and committed as a version, an unreadable one was held back with its
measured 1.1:1 ratio shown, and the Describe flow ran end to end to the model call.
