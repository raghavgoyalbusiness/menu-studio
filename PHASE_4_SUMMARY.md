# Phase 4: AI editing

## Built

- **`POST /edit`**: plain-English requests become JSON Patch operations against either the document
  or the spec — never both in one `Edit`. Every op that touches an array element is preceded by a
  `test` op on that element's id, and the prompt is given an index map so it can address items
  without inventing paths.
- **Clarification**: when a request is ambiguous the endpoint returns `{kind: "clarify", question}`
  instead of guessing. The chat panel shows the question and keeps the request pending.
- **Content guards**: an edit that changes a price, a name or a description the owner did not ask
  about is refused, not applied. The response reports what actually changed
  (`contentChanged: {prices, names, descriptions}`) so the UI can say so plainly.
- **Chat panel**: suggested prompts, a transcript, and every applied edit shown as a version the
  owner can undo.
- **Direct manipulation through the same pipeline**: inline text edits, dnd-kit drags, inspector
  changes and arrow-key nudges on the matrix all build the same `Edit` objects. Nudges are debounced
  into a single version so holding an arrow key does not write 30 rows.

## Deviations from the plan

None material.

## Known issues, honestly

- Like Phase 2, this has **never run against the live model**. The tests use a scripted client,
  including one that tries to sneak a price change into a font request and is refused.
- `inverseEdit` computes an inverse patch, but undo in the app moves `current_version_id` along the
  chain instead. The inverse is used for optimistic rollback when a commit is rejected.

## Verified

API tests for the guard rails (unrequested price change refused, ops without a `test` guard rejected,
invalid JSON retried once then surfaced as a typed error). The chat panel and inline editing were
driven in a real browser; `e2e/happy-path.spec.ts` covers the inline-edit → version → undo loop.
