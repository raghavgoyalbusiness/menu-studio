import {
  AppError,
  getOrgBilling,
  grantCredits,
  markBillingEventProcessed,
  orgIdForSubscription,
  recordBillingEvent,
  setBillingCustomerId,
  setPlan,
  upsertSubscription,
  writeAudit,
} from "@menu-studio/server-core";
import { billingCurrencyForCountry, billingProviderForCountry, formatMoney, PLAN_IDS, PLANS } from "@menu-studio/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../deps.ts";
import { jsonBody } from "../middleware/core.ts";
import { requireOrg } from "../services/access.ts";
import { providerFor, type BillingProvider } from "../services/billing/provider.ts";

const ACTIVE = new Set(["active", "trialing", "authenticated", "charged", "past_due"]);

export function billingRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get("/billing/plans", (c) => {
    const country = (c.req.query("country") ?? "GB").toUpperCase();
    const currency = billingCurrencyForCountry(country);
    const locale = currency === "INR" ? "en-IN" : currency === "USD" ? "en-US" : "en-GB";
    return c.json({
      country,
      currency,
      provider: billingProviderForCountry(country),
      providerConfigured: providerFor(deps.billing, country).configured,
      plans: PLAN_IDS.map((id) => {
        const plan = PLANS[id];
        const price = plan.prices[currency];
        return {
          ...plan,
          price: price ? { ...price, formatted: formatMoney(price.amount, { locale, currency, symbol: true, trimDecimals: true }) } : null,
        };
      }),
    });
  });

  app.post("/billing/checkout", async (c) => {
    const body = await jsonBody(c, z.object({ orgId: z.string().uuid(), plan: z.enum(["pay_per_export", "pro", "multi_venue", "agency"]) }));
    const user = c.get("user");
    const org = await deps.db.asUser(user, (q) => requireOrg(q, body.orgId, "owner"));
    const provider = providerFor(deps.billing, org.country);
    if (!provider.configured) throw new AppError(503, "billing_not_configured", `Payments through ${provider.id === "stripe" ? "Stripe" : "Razorpay"} are not configured on this server yet.`);
    const currency = billingCurrencyForCountry(org.country);
    const customerIds = await deps.db.asService(async (q) => {
      const { rows } = await q.query<{ billing_customer_ids: Record<string, string> }>(`select billing_customer_ids from organizations where id = $1`, [org.id]);
      return rows[0]?.billing_customer_ids ?? {};
    });
    const session = await provider.createCheckout({
      orgId: org.id,
      plan: body.plan,
      currency,
      successUrl: `${deps.env.WEB_URL}/billing?status=success`,
      cancelUrl: `${deps.env.WEB_URL}/billing?status=cancelled`,
      customerEmail: user.email,
      customerId: customerIds[provider.id] ?? null,
    });
    if (session.customerId) await deps.db.asService((q) => setBillingCustomerId(q, org.id, provider.id, session.customerId ?? ""));
    return c.json({ url: session.url });
  });

  app.post("/billing/portal", async (c) => {
    const body = await jsonBody(c, z.object({ orgId: z.string().uuid() }));
    const org = await deps.db.asUser(c.get("user"), (q) => requireOrg(q, body.orgId, "owner"));
    const provider = providerFor(deps.billing, org.country);
    const customerId = await deps.db.asService(async (q) => {
      const { rows } = await q.query<{ id: string | null }>(`select billing_customer_ids ->> $2 as id from organizations where id = $1`, [org.id, provider.id]);
      return rows[0]?.id ?? null;
    });
    const portal = customerId ? await provider.createPortal(customerId, `${deps.env.WEB_URL}/billing`) : null;
    return c.json({ url: portal?.url ?? null });
  });

  app.get("/billing/status/:orgId", async (c) => {
    const orgId = z.string().uuid().parse(c.req.param("orgId"));
    const billing = await deps.db.asUser(c.get("user"), async (q) => {
      await requireOrg(q, orgId, "viewer");
      return getOrgBilling(q, orgId);
    });
    return c.json(billing);
  });

  return app;
}

async function handleWebhook(deps: AppDeps, provider: BillingProvider, rawBody: string, headers: Record<string, string | undefined>): Promise<number> {
  const event = await provider.parseWebhook(rawBody, headers);
  if (!event) return 400;
  const fresh = await deps.db.asService((q) => recordBillingEvent(q, { provider: provider.id, eventId: event.id, type: event.type, payload: event.payload }));
  if (!fresh) return 200;
  await deps.db.asService(async (q) => {
    const effect = event.effect;
    if (effect.kind === "credits") {
      await grantCredits(q, effect.orgId, "export", effect.exportCredits);
      await writeAudit(q, { orgId: effect.orgId, userId: null, action: "credits_granted", entity: "billing", meta: { provider: provider.id, eventId: event.id } });
    } else if (effect.kind === "subscription") {
      const orgId = effect.orgId ?? (await orgIdForSubscription(q, effect.providerSubscriptionId));
      if (orgId) {
        const current = await getOrgBilling(q, orgId);
        const plan = effect.plan ?? current.plan;
        const active = ACTIVE.has(effect.status);
        await upsertSubscription(q, { orgId, provider: provider.id, plan, status: effect.status, providerSubscriptionId: effect.providerSubscriptionId, currentPeriodEnd: effect.currentPeriodEnd });
        await setPlan(q, orgId, active ? plan : "free");
        if (effect.customerId) await setBillingCustomerId(q, orgId, provider.id, effect.customerId);
        await writeAudit(q, { orgId, userId: null, action: "subscription_updated", entity: "billing", meta: { provider: provider.id, status: effect.status, plan } });
      }
    }
    await markBillingEventProcessed(q, provider.id, event.id);
  });
  return 200;
}

export function webhookRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const headersOf = (raw: Headers) => Object.fromEntries([...raw.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  app.post("/webhooks/stripe", async (c) => {
    const status = await handleWebhook(deps, deps.billing.stripe, await c.req.text(), headersOf(c.req.raw.headers));
    return c.body(null, status as 200);
  });
  app.post("/webhooks/razorpay", async (c) => {
    const status = await handleWebhook(deps, deps.billing.razorpay, await c.req.text(), headersOf(c.req.raw.headers));
    return c.body(null, status as 200);
  });
  return app;
}
