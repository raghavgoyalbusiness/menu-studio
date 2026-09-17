import type { AdminOverviewDto } from "@menu-studio/shared";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorNotice, PageHeader, Spinner } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys } from "../../lib/queries.ts";

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

export function Admin() {
  const overview = useQuery({ queryKey: keys.admin, queryFn: () => api<AdminOverviewDto>("/admin/overview") });
  if (overview.isLoading) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  if (overview.error || !overview.data) return <ErrorNotice error={overview.error} />;
  const { totals, orgs, failedExports, flags } = overview.data;
  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Internal" title="Operations" description="AI cost and export health over the last 30 days." />
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["AI cost", usd(totals.aiCostUsdMicros)],
          ["AI calls", String(totals.aiCalls)],
          ["Exports", String(totals.exports)],
          ["Failed exports", String(totals.exportsFailed)],
        ].map(([label, value]) => (
          <Card key={label} className="p-5">
            <div className="eyebrow">{label}</div>
            <div className="display mt-1 text-[32px]">{value}</div>
          </Card>
        ))}
      </div>
      <h2 className="display mt-10 mb-3 text-[26px]">Organizations</h2>
      <Card className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="border-b border-line bg-paper text-left text-[11.5px] tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 text-right font-medium">AI calls</th>
              <th className="px-4 py-2.5 text-right font-medium">AI cost</th>
              <th className="px-4 py-2.5 text-right font-medium">Failed exports</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orgs.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-2">{o.name}</td>
                <td className="px-4 py-2">{o.plan}</td>
                <td className="px-4 py-2 text-right tabular-nums">{o.aiCalls}</td>
                <td className="px-4 py-2 text-right tabular-nums">{usd(o.aiCostUsdMicros)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{o.exportsFailed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="display mb-3 text-[26px]">Failed exports</h2>
          <Card className="divide-y divide-line">
            {failedExports.map((e) => (
              <div key={e.id} className="px-4 py-3 text-[13px]">
                <div className="font-mono text-[11.5px] text-muted">{e.id}</div>
                <div className="text-danger">{e.error ?? "Unknown error"}</div>
                <div className="text-[11.5px] text-faint">{new Date(e.createdAt).toLocaleString()}</div>
              </div>
            ))}
            {!failedExports.length ? <div className="px-4 py-6 text-[13px] text-muted">None.</div> : null}
          </Card>
        </section>
        <section>
          <h2 className="display mb-3 text-[26px]">User flags</h2>
          <Card className="divide-y divide-line">
            {flags.map((f) => (
              <div key={f.id} className="px-4 py-3 text-[13px]">
                <div className="text-[11.5px] tracking-wide text-muted uppercase">{f.kind}</div>
                <div>{f.message}</div>
                <div className="text-[11.5px] text-faint">{new Date(f.createdAt).toLocaleString()}</div>
              </div>
            ))}
            {!flags.length ? <div className="px-4 py-6 text-[13px] text-muted">None.</div> : null}
          </Card>
        </section>
      </div>
    </div>
  );
}
