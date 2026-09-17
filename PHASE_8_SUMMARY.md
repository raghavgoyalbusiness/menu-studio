# Phase 8: Billing, agency and white-label

## Built

- **Plans** (`packages/shared/src/billing/plans.ts`): the tiers, their export credits, their limits
  and whether exports carry a watermark. One definition, shared by the API, the web app and the
  worker, so the paywall and the watermark can never disagree.
- **Two providers**: Stripe everywhere, Razorpay for Indian organizations, chosen from the
  organization's country at checkout. `/billing/checkout` and `/billing/portal` return a redirect;
  `/billing/status/:orgId` reports the current plan, credits and renewal date.
- **Webhooks**: `/webhooks/stripe` and `/webhooks/razorpay` verify the signature **before** parsing,
  then validate the payload with Zod before it touches the database. An unsigned or unverifiable
  webhook is rejected, not logged and applied.
- **Metering**: every AI call reserves and then finalizes an `ai_usage` row with tokens and a cost in
  micro-USD. Rate limits and credit checks read the same table, so a burst cannot outrun the meter.
- **Agency accounts**: an organization can be an agency, holding client venues, with a venue switcher
  and a bulk-export job that renders the current menu of every selected venue in one pass.
- **White-label**: an agency's brand name replaces "Menu Studio" in the print pack README and in the
  QR menu footer.
- **Admin**: an internal screen for usage, jobs and recent failures.

## Known issues, honestly

- **Neither payment provider has been exercised against a real account.** There are no Stripe or
  Razorpay keys on this machine. Checkout, the portal and both webhook handlers are covered by tests
  with fixture payloads and signatures; the first real transaction will be the first real test.
- Without keys, `/billing/checkout` returns a clear 503 (`billing_not_configured`) rather than
  failing obscurely, and every other feature keeps working.
- Dunning and failed-payment recovery are not built. A subscription that lapses simply falls back to
  the free plan's limits at the next status read.

## Verified

Unit tests for plan limits, watermark rules, credit arithmetic (integer micro-USD throughout),
signature verification and webhook payload validation.
