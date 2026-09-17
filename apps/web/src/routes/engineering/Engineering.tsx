import {
  allItems,
  computeQuadrants,
  formatMoney,
  parseCsv,
  parseMoney,
  type EngineeringResponse,
  type EngineeringSuggestionDto,
  type JsonPatchOp,
  type MenuDocument,
  type Quadrant,
  type VersionDto,
} from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { IconArrowLeft, IconCheck, IconSparkle, IconX } from "../../components/icons.tsx";
import { toast } from "../../components/toast.tsx";
import { Badge, Button, Card, cx, Dialog, ErrorNotice, Notice, PageHeader, Spinner, Textarea } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys, useProject } from "../../lib/queries.ts";
import { useEditor } from "../../stores/editor.ts";

const QUADRANT_TONE: Record<Quadrant, "ok" | "accent" | "warn" | "neutral"> = { star: "ok", puzzle: "accent", plowhorse: "warn", dog: "neutral" };
const QUADRANT_HELP: Record<Quadrant, string> = {
  star: "High margin, popular",
  puzzle: "High margin, less popular",
  plowhorse: "Popular, lower margin",
  dog: "Lower margin, less popular",
};

function engineeringEdit(doc: MenuDocument, updates: { itemId: string; costPrice?: number; unitsSold?: number; popularity?: "high" | "low" }[]) {
  const ops: JsonPatchOp[] = [];
  for (const update of updates) {
    doc.sections.forEach((section, si) =>
      section.items.forEach((item, ii) => {
        if (item.id !== update.itemId) return;
        const base = `/sections/${si}/items/${ii}`;
        const next = { ...item.engineering };
        if (update.costPrice !== undefined) next.costPrice = update.costPrice;
        if (update.unitsSold !== undefined) next.unitsSold = update.unitsSold;
        if (update.popularity !== undefined) next.popularity = update.popularity;
        ops.push({ op: "test", path: `${base}/id`, value: item.id }, { op: item.engineering ? "replace" : "add", path: `${base}/engineering`, value: next });
      }),
    );
  }
  return ops.length ? { target: "document" as const, ops } : null;
}

function QuadrantChart({ doc }: { doc: MenuDocument }) {
  const analysis = computeQuadrants(doc);
  if (!analysis.results.length) return <p className="text-[13px] text-muted">Add cost prices and popularity to see the chart.</p>;
  const margins = analysis.results.map((r) => r.contributionMargin);
  const minM = Math.min(...margins);
  const maxM = Math.max(...margins);
  const W = 420;
  const H = 300;
  const pad = 36;
  const y = (m: number) => H - pad - ((m - minM) / Math.max(1, maxM - minM)) * (H - pad * 2);
  const avgY = y(analysis.averageMargin);
  const items = analysis.results.map((r, i) => ({ ...r, x: r.popularity === "high" ? W * 0.75 + ((i * 37) % 60) - 30 : W * 0.3 + ((i * 53) % 70) - 35 }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Menu engineering quadrant chart">
      <rect x={pad} y={pad / 2} width={W - pad * 1.5} height={H - pad * 1.5} fill="none" stroke="var(--color-line-strong)" />
      <line x1={W / 2 + pad / 4} x2={W / 2 + pad / 4} y1={pad / 2} y2={H - pad} stroke="var(--color-line-strong)" strokeDasharray="4 4" />
      <line x1={pad} x2={W - pad / 2} y1={avgY} y2={avgY} stroke="var(--color-line-strong)" strokeDasharray="4 4" />
      <text x={pad + 6} y={pad / 2 + 14} fontSize="10" fill="var(--color-muted)">PUZZLES</text>
      <text x={W - pad} y={pad / 2 + 14} fontSize="10" fill="var(--color-muted)" textAnchor="end">STARS</text>
      <text x={pad + 6} y={H - pad - 6} fontSize="10" fill="var(--color-muted)">DOGS</text>
      <text x={W - pad} y={H - pad - 6} fontSize="10" fill="var(--color-muted)" textAnchor="end">PLOWHORSES</text>
      <text x={W / 2} y={H - 8} fontSize="10.5" fill="var(--color-muted)" textAnchor="middle">Popularity →</text>
      <text x={12} y={H / 2} fontSize="10.5" fill="var(--color-muted)" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>Margin →</text>
      {items.map((r) => (
        <g key={r.itemId}>
          <circle cx={r.x} cy={y(r.contributionMargin)} r={4.5} fill="var(--color-ink)" />
          <text x={r.x + 7} y={y(r.contributionMargin) + 3.5} fontSize="10.5" fill="var(--color-ink-2)">
            {r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Engineering() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  const { load, document: doc, head, commit, replaceHead } = useEditor();
  const queryClient = useQueryClient();
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (project.data?.head) load(projectId, project.data.head);
  }, [project.data, projectId, load]);

  const suggest = useMutation({ mutationFn: () => api<EngineeringResponse>("/engineering/suggest", { method: "POST", body: { projectId, versionId: useEditor.getState().head?.id } }) });
  const apply = useMutation({
    mutationFn: (s: EngineeringSuggestionDto) => api<VersionDto>("/engineering/apply", { method: "POST", body: { projectId, baseVersionId: useEditor.getState().head?.id, edits: s.edits, summary: `Engineering: feature ${s.itemName}` } }),
    onSuccess: (version, s) => {
      replaceHead(version);
      setDismissed((d) => new Set(d).add(s.id));
      void queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
      toast(`${s.itemName} is now featured.`);
    },
  });

  const csvPreview = useMemo(() => {
    if (!doc || !csv.trim()) return [];
    const rows = parseCsv(csv);
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const hasHeader = header.some((h) => /name|item|cost|units|sold|popular/.test(h));
    const body = hasHeader ? rows.slice(1) : rows;
    const col = (re: RegExp, fallback: number) => (hasHeader ? header.findIndex((h) => re.test(h)) : fallback);
    const nameCol = col(/name|item/, 0);
    const costCol = col(/cost/, 1);
    const unitsCol = col(/units|sold|sales|qty|quantity/, 2);
    const popCol = col(/popular/, -1);
    const items = allItems(doc);
    return body.map((row) => {
      const name = row[nameCol]?.trim() ?? "";
      const item = items.find((i) => i.name.toLowerCase() === name.toLowerCase() || i.id === name);
      const cost = costCol >= 0 && row[costCol] ? parseMoney(row[costCol] ?? "", doc.currency) : null;
      const unitsRaw = unitsCol >= 0 ? row[unitsCol]?.trim() : undefined;
      const units = unitsRaw && /^\d+$/.test(unitsRaw) ? Number(unitsRaw) : undefined;
      const popularity = popCol >= 0 ? (/high|yes|1/i.test(row[popCol] ?? "") ? "high" : "low") : undefined;
      return { name, item, cost, units, popularity } as const;
    });
  }, [csv, doc]);

  if (project.isLoading || !doc || !head) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  const analysis = computeQuadrants(doc);
  const byItem = new Map(analysis.results.map((r) => [r.itemId, r]));
  const money = (minor: number) => formatMoney(minor, { locale: doc.locale, currency: doc.currency, symbol: true, trimDecimals: true });

  return (
    <div className="animate-fade-up">
      <Link to={`/projects/${projectId}/editor`} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <IconArrowLeft size={14} /> Back to editor
      </Link>
      <PageHeader
        eyebrow={project.data?.venue.name}
        title="Menu engineering"
        description="Add what each dish costs you and how well it sells. We sort items into stars, puzzles, plowhorses and dogs, and suggest where emphasis could help. Suggestions only change emphasis, never remove items."
        actions={
          <>
            <Button onClick={() => setCsvOpen(true)}>Import CSV</Button>
            <Button variant="primary" icon={<IconSparkle size={14} />} loading={suggest.isPending} disabled={!analysis.results.length} onClick={() => suggest.mutate()}>
              Get suggestions
            </Button>
          </>
        }
      />
      {suggest.error ? <ErrorNotice className="mb-6" error={suggest.error} onRetry={() => suggest.mutate()} /> : null}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line bg-paper text-left text-[11.5px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-2 py-2.5 text-right font-medium">Price</th>
                <th className="px-2 py-2.5 text-right font-medium">Cost</th>
                <th className="px-2 py-2.5 text-right font-medium">Sold</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {allItems(doc).map((item) => {
                const result = byItem.get(item.id);
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{item.price === null ? "–" : money(item.price)}</td>
                    <td className="px-2 py-2 text-right">
                      <input
                        key={`${item.engineering?.costPrice}`}
                        defaultValue={item.engineering?.costPrice === undefined ? "" : formatMoney(item.engineering.costPrice, { locale: doc.locale, currency: doc.currency, symbol: false, trimDecimals: true })}
                        onBlur={(e) => {
                          const minor = parseMoney(e.target.value, doc.currency);
                          if (minor === null || minor === item.engineering?.costPrice) return;
                          const edit = engineeringEdit(doc, [{ itemId: item.id, costPrice: minor }]);
                          if (edit) void commit([edit], `Cost price for ${item.name}`);
                        }}
                        className="w-20 rounded-md border border-line bg-card px-2 py-1 text-right tabular-nums"
                        aria-label={`${item.name} cost price`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        key={`${item.engineering?.unitsSold}`}
                        defaultValue={item.engineering?.unitsSold ?? ""}
                        inputMode="numeric"
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (!/^\d+$/.test(value) || Number(value) === item.engineering?.unitsSold) return;
                          const edit = engineeringEdit(doc, [{ itemId: item.id, unitsSold: Number(value) }]);
                          if (edit) void commit([edit], `Sales for ${item.name}`);
                        }}
                        className="w-16 rounded-md border border-line bg-card px-2 py-1 text-right tabular-nums"
                        aria-label={`${item.name} units sold`}
                      />
                    </td>
                    <td className="px-4 py-2">{result ? <Badge tone={QUADRANT_TONE[result.quadrant]}>{result.quadrant}</Badge> : <span className="text-[12px] text-faint">Needs data</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <div className="eyebrow mb-3">Quadrants {analysis.method === "sales_mix" ? "· by sales mix" : ""}</div>
            <QuadrantChart doc={doc} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-muted">
              {(Object.keys(QUADRANT_HELP) as Quadrant[]).map((q) => (
                <div key={q}>
                  <Badge tone={QUADRANT_TONE[q]}>{q}</Badge> {QUADRANT_HELP[q]}
                </div>
              ))}
            </div>
          </Card>
          {suggest.data ? (
            <Card className="p-5">
              <div className="eyebrow mb-3">Suggestions</div>
              <ul className="flex flex-col gap-3">
                {suggest.data.suggestions
                  .filter((s) => !dismissed.has(s.id) && s.message)
                  .map((s) => (
                    <li key={s.id} className="rounded-md border border-line p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium">{s.itemName}</span>
                        <Badge tone={QUADRANT_TONE[s.quadrant]}>{s.quadrant}</Badge>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-2">{s.message}</p>
                      <div className="mt-2 flex gap-2">
                        {s.edits.length ? (
                          <Button size="sm" variant="primary" icon={<IconCheck size={13} />} loading={apply.isPending && apply.variables?.id === s.id} onClick={() => apply.mutate(s)}>
                            Feature it
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" icon={<IconX size={13} />} onClick={() => setDismissed((d) => new Set(d).add(s.id))}>
                          Dismiss
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
              {apply.error ? <ErrorNotice className="mt-3" error={apply.error} /> : null}
              <p className="mt-3 text-[11.5px] text-faint">Soft suggestions based on your numbers, not guarantees.</p>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={csvOpen} onOpenChange={setCsvOpen} title="Import from CSV" description="Columns: item name, cost price, units sold (or popularity high/low). A header row is optional." wide>
        <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} className="min-h-40 font-mono text-[12px]" placeholder={"name,cost,units\nSteak Frites,9.00,120\nMoules Marinières,6.00,40"} />
        <input type="file" accept=".csv,text/csv" className="mt-3 text-[12.5px]" onChange={(e) => e.target.files?.[0]?.text().then(setCsv)} />
        {csvPreview.length ? (
          <div className="mt-4 max-h-60 overflow-y-auto rounded-md border border-line">
            {csvPreview.map((row, i) => (
              <div key={i} className={cx("flex justify-between gap-3 px-3 py-1.5 text-[12.5px]", !row.item && "bg-warn-soft")}>
                <span className="truncate">{row.item ? row.item.name : `${row.name} (no match)`}</span>
                <span className="tabular-nums text-muted">
                  {row.cost !== null ? money(row.cost) : "–"} · {row.units ?? row.popularity ?? "–"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {csvPreview.some((r) => !r.item) ? <Notice tone="warn" className="mt-3">Rows without a match are skipped. Names must match the menu exactly.</Notice> : null}
        <div className="mt-5 flex justify-end">
          <Button
            variant="primary"
            disabled={!csvPreview.some((r) => r.item)}
            onClick={() => {
              const updates = csvPreview
                .filter((r) => r.item)
                .map((r) => ({ itemId: r.item?.id ?? "", ...(r.cost !== null ? { costPrice: r.cost } : {}), ...(r.units !== undefined ? { unitsSold: r.units } : {}), ...(r.popularity ? { popularity: r.popularity } : {}) }));
              const edit = engineeringEdit(doc, updates);
              if (edit) void commit([edit], `Imported costs and sales for ${updates.length} items`);
              setCsvOpen(false);
              setCsv("");
            }}
          >
            Import {csvPreview.filter((r) => r.item).length} rows
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
