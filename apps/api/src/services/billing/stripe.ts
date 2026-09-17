import { PLANS } from "@menu-studio/shared";
import Stripe from "stripe";
import { z } from "zod";
import { checkoutPrice, isPlanId, type BillingProvider, type BillingWebhookEvent, type CheckoutRequest } from "./provider.ts";

const Metadata = z.object({ orgId: z.string().uuid().optional(), plan: z.string().optional() }).passthrough();

const CheckoutSession = z.object({
  id: z.string(),
  mode: z.enum(["payment", "subscription", "setup"]),
  customer: z.string().nullable().optional(),
  subscription: z.string().nullable().optional(),
  client_reference_id: z.string().nullable().optional(),
  metadata: Metadata.nullable().optional(),
  payment_status: z.string().optional(),
});

const Subscription = z.object({
  id: z.string(),
  status: z.string(),
  customer: z.string(),
  metadata: Metadata.nullable().optional(),
  items: z.object({ data: z.array(z.object({ current_period_end: z.number().optional() }).passthrough()) }).optional(),
});

export class StripeProvider implements BillingProvider {
  readonly id = "stripe" as const;
  readonly configured = true;
  private readonly stripe: Stripe;
  private readonly webhookSecret: string | undefined;

  constructor(secretKey: string, webhookSecret: string | undefined) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createCheckout(request: CheckoutRequest): Promise<{ url: string; customerId: string | null }> {
    const price = checkoutPrice(request.plan, request.currency === "USD" ? "US" : "GB");
    const amount = PLANS[request.plan].prices[request.currency];
    if (!price || !amount) throw new Error(`${request.plan} has no ${request.currency} price`);
    const subscription = amount.interval === "month";
    const session = await this.stripe.checkout.sessions.create({
      mode: subscription ? "subscription" : "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: amount.amount,
            product_data: { name: `Menu Studio ${PLANS[request.plan].name}` },
            ...(subscription ? { recurring: { interval: "month" as const } } : {}),
          },
        },
      ],
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      client_reference_id: request.orgId,
      metadata: { orgId: request.orgId, plan: request.plan },
      ...(subscription ? { subscription_data: { metadata: { orgId: request.orgId, plan: request.plan } } } : {}),
      ...(request.customerId ? { customer: request.customerId } : request.customerEmail ? { customer_email: request.customerEmail } : {}),
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url, customerId: typeof session.customer === "string" ? session.customer : null };
  }

  async createPortal(customerId: string, returnUrl: string): Promise<{ url: string } | null> {
    const portal = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: portal.url };
  }

  async parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<BillingWebhookEvent | null> {
    const signature = headers["stripe-signature"];
    if (!this.webhookSecret || !signature) return null;
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(rawBody, signature, this.webhookSecret);
    } catch {
      return null;
    }
    const base = { id: event.id, type: event.type, payload: event.data.object };
    switch (event.type) {
      case "checkout.session.completed": {
        const session = CheckoutSession.parse(event.data.object);
        const orgId = session.metadata?.orgId ?? session.client_reference_id ?? null;
        const plan = session.metadata?.plan;
        if (session.mode === "payment" && orgId && plan === "pay_per_export") {
          return { ...base, effect: { kind: "credits", orgId, exportCredits: PLANS.pay_per_export.exportCredits ?? 1 } };
        }
        if (session.mode === "subscription" && session.subscription) {
          return {
            ...base,
            effect: {
              kind: "subscription",
              orgId,
              providerSubscriptionId: session.subscription,
              plan: isPlanId(plan) ? plan : null,
              status: "active",
              currentPeriodEnd: null,
              customerId: session.customer ?? null,
            },
          };
        }
        return { ...base, effect: { kind: "ignored" } };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = Subscription.parse(event.data.object);
        const periodEnd = sub.items?.data[0]?.current_period_end;
        const plan = sub.metadata?.plan;
        return {
          ...base,
          effect: {
            kind: "subscription",
            orgId: sub.metadata?.orgId ?? null,
            providerSubscriptionId: sub.id,
            plan: isPlanId(plan) ? plan : null,
            status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
            currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            customerId: sub.customer,
          },
        };
      }
      default:
        return { ...base, effect: { kind: "ignored" } };
    }
  }
}
