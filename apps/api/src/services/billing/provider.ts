import { billingCurrencyForCountry, billingProviderForCountry, PLANS, type BillingCurrency, type PlanId } from "@menu-studio/shared";

export interface CheckoutRequest {
  orgId: string;
  plan: PlanId;
  currency: BillingCurrency;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string | null;
  customerId: string | null;
}

export type BillingEffect =
  | {
      kind: "subscription";
      orgId: string | null;
      providerSubscriptionId: string;
      plan: PlanId | null;
      status: string;
      currentPeriodEnd: Date | null;
      customerId: string | null;
    }
  | { kind: "credits"; orgId: string; exportCredits: number }
  | { kind: "ignored" };

export interface BillingWebhookEvent {
  id: string;
  type: string;
  payload: unknown;
  effect: BillingEffect;
}

export interface BillingProvider {
  id: "stripe" | "razorpay";
  configured: boolean;
  createCheckout(request: CheckoutRequest): Promise<{ url: string; customerId: string | null }>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string } | null>;
  /** Returns null when the signature does not verify. */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<BillingWebhookEvent | null>;
}

export interface BillingProviders {
  stripe: BillingProvider;
  razorpay: BillingProvider;
}

export function providerFor(providers: BillingProviders, country: string): BillingProvider {
  return billingProviderForCountry(country) === "razorpay" ? providers.razorpay : providers.stripe;
}

export function checkoutPrice(plan: PlanId, country: string): { currency: BillingCurrency; amount: number; interval: "month" | "one_time" } | null {
  const currency = billingCurrencyForCountry(country);
  const price = PLANS[plan].prices[currency];
  return price ? { currency, amount: price.amount, interval: price.interval } : null;
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

export class NotConfiguredProvider implements BillingProvider {
  readonly configured = false;
  readonly id: "stripe" | "razorpay";
  constructor(id: "stripe" | "razorpay") {
    this.id = id;
  }
  createCheckout(): Promise<{ url: string; customerId: string | null }> {
    return Promise.reject(new Error(`${this.id} is not configured`));
  }
  createPortal(): Promise<{ url: string } | null> {
    return Promise.resolve(null);
  }
  parseWebhook(): Promise<BillingWebhookEvent | null> {
    return Promise.resolve(null);
  }
}
