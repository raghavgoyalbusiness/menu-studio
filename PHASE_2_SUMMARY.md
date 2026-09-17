# Phase 2: AI ingestion and concepts

## Built

- **`apps/api/src/config/ai.ts`**: the only place in the repository a model id may appear. A lint
  rule fails the build if a model-id literal shows up anywhere else.
- **`runStructured()`** (`services/anthropic.ts`): reserve an `ai_usage` row (rate limit and credit
  check) → call with a structured-output format → convert wire → domain → validate with Zod and the
  semantic validators → retry **once** with the Zod issues appended → otherwise throw a typed 422
  (`ai_invalid_output`, `retryable: true`) → finalize usage with tokens, cost in micro-USD and the
  prompt version.
- **Wire schemas** (`ai-wire/`): structured outputs forbid records, `any` and numeric bounds, so maps
  travel as arrays and JSON Patch values travel as `valueJson` strings. A test asserts the generated
  wire schemas contain no unsupported keyword.
- **`POST /extract`**: images and PDFs (up to 10 pages) or pasted text → a `MenuDocument`, with
  `inferredFields` marking anything the model guessed and `ExtractionWarning`s for what it could not
  read. Prices are parsed to integer minor units; an unreadable price becomes `null`, never a guess.
- **`POST /concepts`**: three distinct concepts, each a `LayoutSpec` plus a two-sentence rationale.
  Distinctness, catalog-id validity and archetype eligibility are checked in code, not just asked for.
- **`apps/web`**: the import screen (drag and drop, camera capture on phones, paste text, sample
  menus), the review screen where the owner confirms or rejects every inferred field before
  designing, the brief, and the concepts screen with select and regenerate.

## Deviations from the plan

- SSE progress events were replaced with a timed `ProgressSteps` component. Extraction takes long
  enough to need reassurance, but not a second transport; the steps advance on elapsed time and the
  request itself is a plain POST.

## Known issues, honestly

- **These endpoints have never run against the live model.** There is no `ANTHROPIC_API_KEY` on this
  machine. The 22 API tests drive a scripted fake client, including the invalid-JSON retry path and
  a refusal when the model tries to change a price nobody asked about. `apps/api/scripts/smoke.ts`
  exists to make the first real call, and `evals/extract-eval.ts` measures quality once fixtures and
  a key are available.

## Verified

Fake-client tests for the full `runStructured` pipeline, the retry, metering, and the semantic
validators. The review and concepts screens were driven in a real browser against seeded data.
