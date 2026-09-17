import type { AdminOverviewDto, AnalyticsDto, PlanId } from "@menu-studio/shared";
import type { Queryable } from "../pool.ts";

// ---------------------------------------------------------------------------
// AI usage metering (service role)
// ---------------------------------------------------------------------------

export interface AiUsageStart {
  orgId: string;
  projectId: string | null;
  requestId: string;
  endpoint: string;
  promptName: string;
  promptVersion: string;
  model: string;
  attempt: number;
  createdBy: string | null;
}

export async function startAiUsage(q: Queryable, input: AiUsageStart): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `insert into ai_usage (org_id, project_id, request_id, endpoint, prompt_name, prompt_version, model, attempt, status, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'started', $9) returning id`,
    [input.orgId, input.projectId, input.requestId, input.endpoint, input.promptName, input.promptVersion, input.model, input.attempt, input.createdBy],
  );
  return rows[0]?.id ?? "";
}

export interface AiUsageFinish {
  status: "succeeded" | "failed";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsdMicros: number;
  stopReason: string | null;
  errorCode: string | null;
  latencyMs: number;
}

export async function finishAiUsage(q: Queryable, id: string, input: AiUsageFinish): Promise<void> {
  await q.query(
    `update ai_usage set status = $2, model = $3, input_tokens = $4, output_tokens = $5, cache_read_tokens = $6, cache_write_tokens = $7,
       cost_usd_micros = $8, stop_reason = $9, error_code = $10, latency_ms = $11 where id = $1`,
    [id, input.status, input.model, input.inputTokens, input.outputTokens, input.cacheReadTokens, input.cacheWriteTokens, input.costUsdMicros, input.stopReason, input.errorCode, input.latencyMs],
  );
}

/** Calls in a sliding window, counting in-flight ones, for per-org per-endpoint rate limits. */
export async function recentAiCalls(q: Queryable, orgId: string, endpoint: string, windowSeconds: number): Promise<number> {
  const { rows } = await q.query<{ n: string }>(
    `select count(*)::text as n from ai_usage where org_id = $1 and endpoint = $2 and attempt = 1 and status <> 'failed'
       and created_at > now() - make_interval(secs => $3)`,
    [orgId, endpoint, windowSeconds],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function aiEditsThisMonth(q: Queryable, orgId: string): Promise<number> {
  const { rows } = await q.query<{ n: string }>(
    `select count(*)::text as n from ai_usage where org_id = $1 and endpoint = 'edit' and attempt = 1 and status = 'succeeded'
       and created_at >= date_trunc('month', now())`,
    [orgId],
  );
  return Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Plans, credits, subscriptions (service role writes)
// ---------------------------------------------------------------------------

export interface OrgBilling {
  plan: PlanId;
  country: string;
  exportCredits: number;
  aiEditCredits: number;
  subscription: { status: string; currentPeriodEnd: string | null; provider: string } | null;
}

export async function getOrgBilling(q: Queryable, orgId: string): Promise<OrgBilling> {
  const { rows } = await q.query<{
    plan: PlanId;
    country: string;
    export_credits: number | null;
    ai_edit_credits: number | null;
    sub_status: string | null;
    current_period_end: Date | null;
    provider: string | null;
  }>(
    `select o.plan, o.country, c.export_credits, c.ai_edit_credits, s.status as sub_status, s.current_period_end, s.provider
       from organizations o left join credits c on c.org_id = o.id left join subscriptions s on s.org_id = o.id where o.id = $1`,
    [orgId],
  );
  const r = rows[0];
  if (!r) return { plan: "free", country: "GB", exportCredits: 0, aiEditCredits: 0, subscription: null };
  return {
    plan: r.plan,
    country: r.country,
    exportCredits: r.export_credits ?? 0,
    aiEditCredits: r.ai_edit_credits ?? 0,
    subscription: r.sub_status ? { status: r.sub_status, currentPeriodEnd: r.current_period_end?.toISOString() ?? null, provider: r.provider ?? "" } : null,
  };
}

/** Atomically spend one credit. Returns false when none are left. */
export async function consumeCredit(q: Queryable, orgId: string, kind: "export" | "ai_edit"): Promise<boolean> {
  const column = kind === "export" ? "export_credits" : "ai_edit_credits";
  const { rowCount } = await q.query(`update credits set ${column} = ${column} - 1, updated_at = now() where org_id = $1 and ${column} > 0`, [orgId]);
  return (rowCount ?? 0) > 0;
}

export async function grantCredits(q: Queryable, orgId: string, kind: "export" | "ai_edit", amount: number): Promise<void> {
  const column = kind === "export" ? "export_credits" : "ai_edit_credits";
  await q.query(
    `insert into credits (org_id, ${column}) values ($1, $2) on conflict (org_id) do update set ${column} = credits.${column} + excluded.${column}, updated_at = now()`,
    [orgId, amount],
  );
}

export async function setPlan(q: Queryable, orgId: string, plan: PlanId): Promise<void> {
  await q.query(`update organizations set plan = $2 where id = $1`, [orgId, plan]);
}

export async function upsertSubscription(
  q: Queryable,
  input: { orgId: string; provider: "stripe" | "razorpay"; plan: PlanId; status: string; providerSubscriptionId: string | null; currentPeriodEnd: Date | null },
): Promise<void> {
  await q.query(
    `insert into subscriptions (org_id, provider, plan, status, provider_subscription_id, current_period_end, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (org_id) do update set provider = excluded.provider, plan = excluded.plan, status = excluded.status,
       provider_subscription_id = excluded.provider_subscription_id, current_period_end = excluded.current_period_end, updated_at = now()`,
    [input.orgId, input.provider, input.plan, input.status, input.providerSubscriptionId, input.currentPeriodEnd],
  );
}

export async function orgIdForSubscription(q: Queryable, providerSubscriptionId: string): Promise<string | null> {
  const { rows } = await q.query<{ org_id: string }>(`select org_id from subscriptions where provider_subscription_id = $1`, [providerSubscriptionId]);
  return rows[0]?.org_id ?? null;
}

/** Record a webhook event; returns false if it was already processed (idempotency). */
export async function recordBillingEvent(q: Queryable, input: { provider: "stripe" | "razorpay"; eventId: string; type: string; payload: unknown }): Promise<boolean> {
  const { rows } = await q.query<{ processed_at: Date | null; inserted: boolean }>(
    `insert into billing_events (provider, event_id, type, payload) values ($1, $2, $3, $4)
     on conflict (provider, event_id) do update set type = excluded.type
     returning processed_at, (xmax = 0) as inserted`,
    [input.provider, input.eventId, input.type, JSON.stringify(input.payload)],
  );
  return rows[0]?.processed_at == null;
}

export async function markBillingEventProcessed(q: Queryable, provider: string, eventId: string): Promise<void> {
  await q.query(`update billing_events set processed_at = now() where provider = $1 and event_id = $2`, [provider, eventId]);
}

export async function setBillingCustomerId(q: Queryable, orgId: string, provider: "stripe" | "razorpay", customerId: string): Promise<void> {
  await q.query(`update organizations set billing_customer_ids = billing_customer_ids || jsonb_build_object($2::text, $3::text) where id = $1`, [orgId, provider, customerId]);
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function recordView(q: Queryable, input: { publishedMenuId: string; lang: string | null; device: string | null; referrer: string | null }): Promise<void> {
  await q.query(`insert into menu_views (published_menu_id, lang, device, referrer) values ($1, $2, $3, $4)`, [input.publishedMenuId, input.lang, input.device, input.referrer]);
}

export async function recordItemOpen(q: Queryable, publishedMenuId: string, itemId: string): Promise<void> {
  await q.query(
    `insert into item_clicks (published_menu_id, item_id, date, count) values ($1, $2, current_date, 1)
     on conflict (published_menu_id, item_id, date) do update set count = item_clicks.count + 1`,
    [publishedMenuId, itemId],
  );
}

/** Nightly: roll raw views into daily counts and delete raw rows older than `keepDays`. */
export async function aggregateViews(q: Queryable, keepDays = 2): Promise<number> {
  const { rowCount } = await q.query(
    `with moved as (
       delete from menu_views where viewed_at < date_trunc('day', now()) - make_interval(days => $1 - 1) returning *
     )
     insert into menu_view_daily (published_menu_id, date, lang, device, views)
     select published_menu_id, viewed_at::date, coalesce(lang, ''), coalesce(device, ''), count(*) from moved group by 1, 2, 3, 4
     on conflict (published_menu_id, date, lang, device) do update set views = menu_view_daily.views + excluded.views`,
    [keepDays],
  );
  return rowCount ?? 0;
}

export async function analyticsFor(q: Queryable, publishedMenuId: string, days = 30): Promise<Omit<AnalyticsDto, "topItems"> & { topItems: { itemId: string; opens: number }[] }> {
  const views = `(
    select date, lang, device, views from menu_view_daily where published_menu_id = $1 and date > current_date - $2::int
    union all
    select viewed_at::date, coalesce(lang, ''), coalesce(device, ''), 1 from menu_views where published_menu_id = $1
  ) v`;
  const [byDay, byLang, byDevice, items] = await Promise.all([
    q.query<{ date: string; views: string }>(`select date::text, sum(views)::text as views from ${views} group by 1 order by 1`, [publishedMenuId, days]),
    q.query<{ lang: string; views: string }>(`select lang, sum(views)::text as views from ${views} group by 1 order by 2 desc`, [publishedMenuId, days]),
    q.query<{ device: string; views: string }>(`select device, sum(views)::text as views from ${views} group by 1 order by 2 desc`, [publishedMenuId, days]),
    q.query<{ item_id: string; opens: string }>(
      `select item_id, sum(count)::text as opens from item_clicks where published_menu_id = $1 and date > current_date - $2::int group by 1 order by 2 desc limit 10`,
      [publishedMenuId, days],
    ),
  ]);
  return {
    days: byDay.rows.map((r) => ({ date: r.date, views: Number(r.views) })),
    languages: byLang.rows.map((r) => ({ lang: r.lang || "default", views: Number(r.views) })),
    devices: byDevice.rows.map((r) => ({ device: r.device || "unknown", views: Number(r.views) })),
    topItems: items.rows.map((r) => ({ itemId: r.item_id, opens: Number(r.opens) })),
  };
}

// ---------------------------------------------------------------------------
// Internal admin (service role, after checking app_admins)
// ---------------------------------------------------------------------------

export async function adminOverview(q: Queryable): Promise<AdminOverviewDto> {
  const [orgs, failed, flags, totals] = await Promise.all([
    q.query<{ id: string; name: string; plan: string; cost: string; calls: string; failed: string }>(
      `select o.id, o.name, o.plan,
         coalesce((select sum(cost_usd_micros) from ai_usage a where a.org_id = o.id and a.created_at > now() - interval '30 days'), 0)::text as cost,
         coalesce((select count(*) from ai_usage a where a.org_id = o.id and a.created_at > now() - interval '30 days'), 0)::text as calls,
         coalesce((select count(*) from exports e join projects p on p.id = e.project_id join venues v on v.id = p.venue_id where v.org_id = o.id and e.status = 'failed'), 0)::text as failed
       from organizations o order by cost desc, o.created_at desc limit 100`,
    ),
    q.query<{ id: string; project_id: string; error: string | null; created_at: Date }>(
      `select id, project_id, error, created_at from exports where status = 'failed' order by created_at desc limit 50`,
    ),
    q.query<{ id: string; org_id: string; kind: string; message: string; created_at: Date }>(
      `select id, org_id, kind, message, created_at from feedback_flags order by created_at desc limit 50`,
    ),
    q.query<{ cost: string; calls: string; exports: string; failed: string }>(
      `select coalesce((select sum(cost_usd_micros) from ai_usage where created_at > now() - interval '30 days'), 0)::text as cost,
              (select count(*) from ai_usage where created_at > now() - interval '30 days')::text as calls,
              (select count(*) from exports)::text as exports,
              (select count(*) from exports where status = 'failed')::text as failed`,
    ),
  ]);
  const t = totals.rows[0];
  return {
    orgs: orgs.rows.map((r) => ({ id: r.id, name: r.name, plan: r.plan, aiCostUsdMicros: Number(r.cost), aiCalls: Number(r.calls), exportsFailed: Number(r.failed) })),
    failedExports: failed.rows.map((r) => ({ id: r.id, projectId: r.project_id, error: r.error, createdAt: r.created_at.toISOString() })),
    flags: flags.rows.map((r) => ({ id: r.id, orgId: r.org_id, kind: r.kind, message: r.message, createdAt: r.created_at.toISOString() })),
    totals: { aiCostUsdMicros: Number(t?.cost ?? 0), aiCalls: Number(t?.calls ?? 0), exports: Number(t?.exports ?? 0), exportsFailed: Number(t?.failed ?? 0) },
  };
}

export async function insertFeedbackFlag(q: Queryable, input: { orgId: string; projectId: string | null; kind: string; message: string; createdBy: string }): Promise<void> {
  await q.query(`insert into feedback_flags (org_id, project_id, kind, message, created_by) values ($1, $2, $3, $4, $5)`, [
    input.orgId,
    input.projectId,
    input.kind,
    input.message,
    input.createdBy,
  ]);
}
