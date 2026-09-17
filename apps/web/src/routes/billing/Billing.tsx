import type { Plan, PlanId } from "@menu-studio/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useCurrentOrg } from "../../components/AppShell.tsx";
import { IconCheck } from "../../components/icons.tsx";
import { toast } from "../../components/toast.tsx";
import { Badge, Button, Card, cx, ErrorNotice, Notice, PageHeader, Spinner } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys, useUsage } from "../../lib/queries.ts";

interface PlansResponse {
  country: string;
  currency: string;
  provider: "stripe" | "razorpay";
  providerConfigured: boolean;
  plans: (Plan & { price: { amount: number; interval: "month" | "one_time"; formatted: string } | null })[];
}

function features(plan: Plan): string[] {
  return [
    plan.venuesLimit === null ? "Unlimited client venues" : `${plan.venuesLimit} venue${plan.venuesLimit === 1 ? "" : "s"}`,
    plan.aiEditsPerMonth === null ? "AI edits within fair use" : `${plan.aiEditsPerMonth} AI edits a month`,
    plan.watermark ? "Watermarked exports" : "Clean print-ready exports",
    plan.qrPublishing ? "Live QR menu" : "",
    plan.translationLanguages ? `${plan.translationLanguages} translation languages` : "",
    plan.menuEngineering ? "Menu engineering" : "",
    plan.whiteLabel ? "White-label and bulk export" : "",
  ].filter(Boolean);
}

export function Billing() {
  const { org } = useCurrentOrg();
  const usage = useUsage(org?.id);
  const [params] = useSearchParams();
  const plans = useQuery({ queryKey: keys.plans(org?.country ?? "GB"), queryFn: () => api<PlansResponse>(`/billing/plans?country=${org?.country ?? "GB"}`, { auth: false }), enabled: Boolean(org) });

  useEffect(() => {
    if (params.get("status") === "success") toast("Thanks! Your plan updates as soon as payment is confirmed.", { tone: "ok" });
  }, [params]);

  const checkout = useMutation({
    mutationFn: (plan: PlanId) => api<{ url: string }>("/billing/checkout", { method: "POST", body: { orgId: org?.id, plan } }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const portal = useMutation({
    mutationFn: () => api<{ url: string | null }>("/billing/portal", { method: "POST", body: { orgId: org?.id } }),
    onSuccess: ({ url }) => (url ? window.location.assign(url) : toast("Manage your subscription from the emails your payment provider sent.")),
  });

  if (!org || plans.isLoading || usage.isLoading) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  const owner = org.role === "owner";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={org.name}
        title="Plans"
        description={`Prices in ${plans.data?.currency}. Payments are handled by ${plans.data?.provider === "razorpay" ? "Razorpay" : "Stripe"}.`}
        actions={usage.data?.subscription ? <Button onClick={() => portal.mutate()} loading={portal.isPending}>Manage subscription</Button> : null}
      />
      {!plans.data?.providerConfigured ? <Notice tone="warn" className="mb-6">Payments aren't configured on this server yet, so checkout is disabled.</Notice> : null}
      {!owner ? <Notice className="mb-6">Only organization owners can change the plan.</Notice> : null}
      {checkout.error ? <ErrorNotice className="mb-6" error={checkout.error} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {plans.data?.plans
          .filter((p) => p.id !== "agency" || org.type === "agency" || usage.data?.plan === "agency")
          .map((plan) => {
            const current = usage.data?.plan === plan.id;
            return (
              <Card key={plan.id} className={cx("flex flex-col p-5", current && "border-ink ring-1 ring-ink")}>
                <div className="flex items-center justify-between">
                  <h2 className="display text-[26px]">{plan.name}</h2>
                  {current ? <Badge tone="ok">Current</Badge> : null}
                </div>
                <p className="mt-1 min-h-10 text-[12.5px] text-muted">{plan.tagline}</p>
                <div className="mt-4">
                  {plan.price ? (
                    <>
                      <span className="display text-[34px]">{plan.price.formatted}</span>
                      <span className="text-[12.5px] text-muted">{plan.price.interval === "month" ? " / month" : " once"}</span>
                    </>
                  ) : (
                    <span className="display text-[34px]">Free</span>
                  )}
                </div>
                <ul className="mt-4 flex-1 space-y-1.5 text-[12.5px] text-ink-2">
                  {features(plan).map((f) => (
                    <li key={f} className="flex gap-2">
                      <IconCheck size={13} className="mt-0.5 shrink-0 text-ok" /> {f}
                    </li>
                  ))}
                </ul>
                {plan.price && !current ? (
                  <Button className="mt-5" variant={plan.id === "pro" ? "primary" : "secondary"} disabled={!owner || !plans.data?.providerConfigured} loading={checkout.isPending && checkout.variables === plan.id} onClick={() => checkout.mutate(plan.id)}>
                    {plan.price.interval === "one_time" ? "Buy print pack" : "Choose"}
                  </Button>
                ) : null}
              </Card>
            );
          })}
      </div>
      {usage.data ? (
        <Card className="mt-8 grid gap-6 p-6 sm:grid-cols-4">
          <div>
            <div className="eyebrow">Venues</div>
            <div className="display mt-1 text-[30px]">{usage.data.venues}</div>
          </div>
          <div>
            <div className="eyebrow">AI edits this month</div>
            <div className="display mt-1 text-[30px]">{usage.data.aiEditsThisMonth}</div>
          </div>
          <div>
            <div className="eyebrow">Clean export credits</div>
            <div className="display mt-1 text-[30px]">{usage.data.exportCredits}</div>
          </div>
          <div>
            <div className="eyebrow">Subscription</div>
            <div className="mt-2 text-[14px] capitalize">{usage.data.subscription ? `${usage.data.subscription.status}${usage.data.subscription.currentPeriodEnd ? ` · renews ${new Date(usage.data.subscription.currentPeriodEnd).toLocaleDateString()}` : ""}` : "None"}</div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
