# Extraction fixtures

Real menus belong to the restaurants that wrote them, so nothing in this folder is committed
(`.gitignore` keeps only this README). Add your own cases locally, or restore them from the
team's private fixture bucket.

## Layout

One directory per case. The directory name is the case name.

```
evals/fixtures/
  bistro-photo/
    source-1.jpg        # one file per page: .jpg .png .webp .pdf
    expected.json
  chai-shop-text/
    source.txt          # a pasted-text case instead of images
    expected.json
```

A case may hold either images/PDFs or a `source.txt`, not both. Images are uploaded exactly as an
owner would upload them, so photographs beat scans: bad lighting and a curved page are the point.

## expected.json

Ground truth, transcribed by hand from the menu. Prices are **integer minor units** in the venue's
currency (₹380.00 → `38000`, €12.50 → `1250`), matching `packages/shared/src/money.ts`. Use `null`
where the menu shows no price.

```json
{
  "venue": { "name": "Café Rasoi", "country": "IN", "currency": "INR" },
  "sections": [
    {
      "title": "Starters",
      "items": [
        { "name": "Paneer Tikka", "price": 38000, "dietaryTags": ["vegetarian"] },
        { "name": "Market soup", "price": null }
      ]
    }
  ]
}
```

`dietaryTags` is optional and only worth filling in when the menu itself marks the item — the eval
uses it to catch dietary tags the model invented, and an empty array means "the menu marks nothing",
which is a stronger claim than leaving the field out.

## Running

```bash
pnpm db:start        # once
pnpm dev             # api needs ANTHROPIC_API_KEY
node evals/extract-eval.ts --report /tmp/extract.json
```

The run creates a throwaway project per case on the seeded account and prints per-case failures.
It exits non-zero when a metric falls below its threshold (see the top of `extract-eval.ts`), so it
can gate a prompt change in CI once fixtures are available to the runner.

## Adding a case that failed in production

When an owner reports a bad extraction, ask for permission to keep their menu, then add it here as a
case with the correct `expected.json`. A prompt change is only finished when the case passes and the
others have not regressed.
