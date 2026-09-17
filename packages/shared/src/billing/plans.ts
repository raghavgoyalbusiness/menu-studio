export const PLAN_IDS = ["free", "pay_per_export", "pro", "multi_venue", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_CURRENCIES = ["GBP", "USD", "INR"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export interface PlanPrice {
  /** Integer minor units. */
  amount: number;
  interval: "month" | "one_time";
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  venuesLimit: number | null;
  /** null = unlimited within fair use. */
  aiEditsPerMonth: number | null;
  watermark: boolean;
  qrPublishing: boolean;
  translationLanguages: number;
  menuEngineering: boolean;
  whiteLabel: boolean;
  bulkExport: boolean;
  priorityRendering: boolean;
  /** Clean exports granted per purchase (pay_per_export) or per month. null = unlimited. */
  exportCredits: number | null;
  prices: Record<BillingCurrency, PlanPrice | null>;
}

/** Soft ceiling applied to "unlimited" AI edits so one account cannot run away with cost. */
export const FAIR_USE_AI_EDITS_PER_MONTH = 1500;

// TODO(price): the amounts below are placeholders. Replace them with real prices before launch.
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Design and preview as much as you like.",
    venuesLimit: 1,
    aiEditsPerMonth: 20,
    watermark: true,
    qrPublishing: false,
    translationLanguages: 0,
    menuEngineering: false,
    whiteLabel: false,
    bulkExport: false,
    priorityRendering: false,
    exportCredits: null,
    prices: { GBP: null, USD: null, INR: null },
  },
  pay_per_export: {
    id: "pay_per_export",
    name: "Print pack",
    tagline: "One clean print pack for one menu version.",
    venuesLimit: 1,
    aiEditsPerMonth: 20,
    watermark: false,
    qrPublishing: false,
    translationLanguages: 0,
    menuEngineering: false,
    whiteLabel: false,
    bulkExport: false,
    priorityRendering: false,
    exportCredits: 1,
    prices: {
      GBP: { amount: 1900, interval: "one_time" },
      USD: { amount: 2400, interval: "one_time" },
      INR: { amount: 99900, interval: "one_time" },
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Everything for one venue, including the live QR menu.",
    venuesLimit: 1,
    aiEditsPerMonth: null,
    watermark: false,
    qrPublishing: true,
    translationLanguages: 2,
    menuEngineering: true,
    whiteLabel: false,
    bulkExport: false,
    priorityRendering: false,
    exportCredits: null,
    prices: {
      GBP: { amount: 2900, interval: "month" },
      USD: { amount: 3500, interval: "month" },
      INR: { amount: 149900, interval: "month" },
    },
  },
  multi_venue: {
    id: "multi_venue",
    name: "Multi-venue",
    tagline: "Up to five venues and five languages.",
    venuesLimit: 5,
    aiEditsPerMonth: null,
    watermark: false,
    qrPublishing: true,
    translationLanguages: 5,
    menuEngineering: true,
    whiteLabel: false,
    bulkExport: false,
    priorityRendering: false,
    exportCredits: null,
    prices: {
      GBP: { amount: 7900, interval: "month" },
      USD: { amount: 9900, interval: "month" },
      INR: { amount: 399900, interval: "month" },
    },
  },
  agency: {
    id: "agency",
    name: "Agency",
    tagline: "Unlimited client venues, white-label and bulk export.",
    venuesLimit: null,
    aiEditsPerMonth: null,
    watermark: false,
    qrPublishing: true,
    translationLanguages: 5,
    menuEngineering: true,
    whiteLabel: true,
    bulkExport: true,
    priorityRendering: true,
    exportCredits: null,
    prices: {
      GBP: { amount: 24900, interval: "month" },
      USD: { amount: 29900, interval: "month" },
      INR: { amount: 1299900, interval: "month" },
    },
  },
};

export function billingProviderForCountry(countryCode: string): "stripe" | "razorpay" {
  return countryCode.toUpperCase() === "IN" ? "razorpay" : "stripe";
}

export function billingCurrencyForCountry(countryCode: string): BillingCurrency {
  const cc = countryCode.toUpperCase();
  if (cc === "IN") return "INR";
  if (cc === "US") return "USD";
  return cc === "GB" ? "GBP" : "USD";
}

export interface UsageSnapshot {
  plan: PlanId;
  venues: number;
  aiEditsThisMonth: number;
  aiEditCredits: number;
  exportCredits: number;
}

export type LimitCheck = { allowed: true } | { allowed: false; reason: string; upgradeTo: PlanId };

export function canCreateVenue(usage: UsageSnapshot): LimitCheck {
  const limit = PLANS[usage.plan].venuesLimit;
  if (limit === null || usage.venues < limit) return { allowed: true };
  return { allowed: false, reason: `Your plan includes ${limit} venue${limit === 1 ? "" : "s"}.`, upgradeTo: limit < 5 ? "multi_venue" : "agency" };
}

export function canUseAiEdit(usage: UsageSnapshot): LimitCheck {
  const limit = PLANS[usage.plan].aiEditsPerMonth ?? FAIR_USE_AI_EDITS_PER_MONTH;
  if (usage.aiEditsThisMonth < limit || usage.aiEditCredits > 0) return { allowed: true };
  return { allowed: false, reason: `You have used this month's ${limit} AI edits.`, upgradeTo: "pro" };
}

export function exportIsWatermarked(usage: UsageSnapshot): boolean {
  return PLANS[usage.plan].watermark && usage.exportCredits <= 0;
}

export function canPublishQr(plan: PlanId): LimitCheck {
  return PLANS[plan].qrPublishing ? { allowed: true } : { allowed: false, reason: "The live QR menu is part of Pro.", upgradeTo: "pro" };
}

export function canTranslate(plan: PlanId, languages: number): LimitCheck {
  const limit = PLANS[plan].translationLanguages;
  if (languages <= limit) return { allowed: true };
  return { allowed: false, reason: limit ? `Your plan includes ${limit} languages.` : "Translations are part of Pro.", upgradeTo: limit >= 2 ? "multi_venue" : "pro" };
}
