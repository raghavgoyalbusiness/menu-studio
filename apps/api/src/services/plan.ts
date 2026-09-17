import { aiEditsThisMonth, getOrgBilling, orgVenueCount, type Queryable } from "@menu-studio/server-core";
import { billingCurrencyForCountry, billingProviderForCountry, type UsageDto, type UsageSnapshot } from "@menu-studio/shared";

export async function usageSnapshot(q: Queryable, orgId: string): Promise<UsageSnapshot & { country: string }> {
  const [billing, venues, edits] = await Promise.all([getOrgBilling(q, orgId), orgVenueCount(q, orgId), aiEditsThisMonth(q, orgId)]);
  return {
    plan: billing.plan,
    venues,
    aiEditsThisMonth: edits,
    aiEditCredits: billing.aiEditCredits,
    exportCredits: billing.exportCredits,
    country: billing.country,
  };
}

export async function usageDto(q: Queryable, orgId: string): Promise<UsageDto> {
  const [snapshot, billing] = await Promise.all([usageSnapshot(q, orgId), getOrgBilling(q, orgId)]);
  return {
    plan: snapshot.plan,
    venues: snapshot.venues,
    aiEditsThisMonth: snapshot.aiEditsThisMonth,
    aiEditCredits: snapshot.aiEditCredits,
    exportCredits: snapshot.exportCredits,
    billingProvider: billingProviderForCountry(snapshot.country),
    billingCurrency: billingCurrencyForCountry(snapshot.country),
    subscription: billing.subscription ? { status: billing.subscription.status, currentPeriodEnd: billing.subscription.currentPeriodEnd } : null,
  };
}
