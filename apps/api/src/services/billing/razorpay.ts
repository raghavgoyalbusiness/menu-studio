import { PLANS, type PlanId } from "@menu-studio/shared";
import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { z } from "zod";
import { isPlanId, type BillingProvider, type BillingWebhookEvent, type CheckoutRequest } from "./provider.ts";

const Notes = z.object({ orgId: z.string().optional(), plan: z.string().optional() }).passthrough();

const WebhookBody = z.object({
  event: z.string(),
  payload: z
    .object({
      subscription: z.object({ entity: z.object({ id: z.string(), status: z.string(), current_end: z.number().nullable().optional(), customer_id: z.string().nullable().optional(), notes: z.union([Notes, z.array(z.unknown())]).optional() }) }).optional(),
      payment_link: z.object({ entity: z.object({ id: z.string(), status: z.string(), notes: z.union([Notes, z.array(z.unknown())]).optional() }) }).optional(),
    })
    .passthrough(),
});

function notesOf(value: unknown): z.infer<typeof Notes> {
  const parsed = Notes.safeParse(value);
  return parsed.success ? parsed.data : {};
}

interface RazorpayLike {
  plans: { create(params: Record<string, unknown>): Promise<{ id: string }> };
  subscriptions: { create(params: Record<string, unknown>): Promise<{ id: string; short_url?: string }> };
  paymentLink: { create(params: Record<string, unknown>): Promise<{ id: string; short_url: string }> };
}

export class RazorpayProvider implements BillingProvider {
  readonly id = "razorpay" as const;
  readonly configured = true;
  private readonly client: RazorpayLike;
  private readonly webhookSecret: string | undefined;
  private readonly planIds = new Map<PlanId, string>();

  constructor(keyId: string, keySecret: string, webhookSecret: string | undefined) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret }) as unknown as RazorpayLike;
    this.webhookSecret = webhookSecret;
  }

  private async planIdFor(plan: PlanId): Promise<string> {
    const cached = this.planIds.get(plan);
    if (cached) return cached;
    const price = PLANS[plan].prices.INR;
    if (!price) throw new Error(`${plan} has no INR price`);
    const created = await this.client.plans.create({
      period: "monthly",
      interval: 1,
      item: { name: `Menu Studio ${PLANS[plan].name}`, amount: price.amount, currency: "INR" },
      notes: { plan },
    });
    this.planIds.set(plan, created.id);
    return created.id;
  }

  async createCheckout(request: CheckoutRequest): Promise<{ url: string; customerId: string | null }> {
    const price = PLANS[request.plan].prices.INR;
    if (!price) throw new Error(`${request.plan} has no INR price`);
    const notes = { orgId: request.orgId, plan: request.plan };
    if (price.interval === "one_time") {
      const link = await this.client.paymentLink.create({
        amount: price.amount,
        currency: "INR",
        description: `Menu Studio ${PLANS[request.plan].name}`,
        notes,
        callback_url: request.successUrl,
        callback_method: "get",
        ...(request.customerEmail ? { customer: { email: request.customerEmail } } : {}),
      });
      return { url: link.short_url, customerId: null };
    }
    const subscription = await this.client.subscriptions.create({
      plan_id: await this.planIdFor(request.plan),
      total_count: 120,
      customer_notify: 1,
      notes,
    });
    if (!subscription.short_url) throw new Error("Razorpay did not return a subscription link");
    return { url: subscription.short_url, customerId: null };
  }

  createPortal(): Promise<{ url: string } | null> {
    // Razorpay has no hosted customer portal; the billing page links to the subscription emails.
    return Promise.resolve(null);
  }

  async parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<BillingWebhookEvent | null> {
    const signature = headers["x-razorpay-signature"];
    if (!this.webhookSecret || !signature) return null;
    const expected = Buffer.from(createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex"));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    const body = WebhookBody.parse(JSON.parse(rawBody));
    const id = headers["x-razorpay-event-id"] ?? `${body.event}:${createHmac("sha256", "id").update(rawBody).digest("hex").slice(0, 24)}`;
    const base = { id, type: body.event, payload: body.payload };

    if (body.event.startsWith("subscription.") && body.payload.subscription) {
      const sub = body.payload.subscription.entity;
      const notes = notesOf(sub.notes);
      return {
        ...base,
        effect: {
          kind: "subscription",
          orgId: notes.orgId ?? null,
          providerSubscriptionId: sub.id,
          plan: isPlanId(notes.plan) ? notes.plan : null,
          status: sub.status,
          currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
          customerId: sub.customer_id ?? null,
        },
      };
    }
    if (body.event === "payment_link.paid" && body.payload.payment_link) {
      const notes = notesOf(body.payload.payment_link.entity.notes);
      if (notes.orgId && notes.plan === "pay_per_export") {
        return { ...base, effect: { kind: "credits", orgId: notes.orgId, exportCredits: PLANS.pay_per_export.exportCredits ?? 1 } };
      }
    }
    return { ...base, effect: { kind: "ignored" } };
  }
}
