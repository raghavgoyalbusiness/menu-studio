import { formatMoney, parseMoney, type PublishedMenuDto, type VersionDto } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { IconArrowLeft } from "../../components/icons.tsx";
import { toast } from "../../components/toast.tsx";
import { Badge, Button, Card, cx, ErrorNotice, PageHeader, Spinner, Switch } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { keys, useExports, useProject } from "../../lib/queries.ts";

interface Change {
  price?: number | null;
  available?: boolean;
}

export function QuickEdit() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  const exports = useExports(projectId);
  const queryClient = useQueryClient();
  const [changes, setChanges] = useState<Record<string, Change>>({});
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const head = project.data?.head;

  const save = useMutation({
    mutationFn: () =>
      api<{ version: VersionDto; republished: PublishedMenuDto[] }>(`/projects/${projectId}/quick-edit`, {
        method: "POST",
        body: { baseVersionId: head?.id, changes: Object.entries(changes).map(([itemId, c]) => ({ itemId, ...c })) },
      }),
    onSuccess: async (result) => {
      setChanges({});
      await queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
      const printed = exports.data?.some((e) => e.status === "done");
      toast(result.republished.length ? "Saved. Your live menu updates in a few seconds." : "Saved.", {
        tone: "ok",
        ...(printed ? { action: { label: "Re-export print", onClick: () => window.location.assign(`/projects/${projectId}/editor`) } } : {}),
      });
    },
  });

  if (project.isLoading) return <div className="flex justify-center py-24 text-muted"><Spinner /></div>;
  if (!head) return <ErrorNotice error={project.error ?? new Error("No menu yet.")} />;
  const doc = head.document;
  const count = Object.keys(changes).length;

  return (
    <div className="animate-fade-up">
      <Link to={`/projects/${projectId}/publish`} className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <IconArrowLeft size={14} /> QR menu
      </Link>
      <PageHeader
        eyebrow={project.data?.venue.name}
        title="Quick edit"
        description="Change prices or mark items as sold out (86'd). Your live QR menu updates immediately; printed menus need a new export."
        actions={
          <Button variant="primary" disabled={!count || invalid.size > 0} loading={save.isPending} onClick={() => save.mutate()}>
            Save {count ? `${count} change${count === 1 ? "" : "s"}` : ""}
          </Button>
        }
      />
      {save.error ? <ErrorNotice className="mb-6" error={save.error} onRetry={() => save.mutate()} /> : null}
      <div className="flex flex-col gap-5">
        {doc.sections.map((section) => (
          <Card key={section.id} className="overflow-hidden">
            <div className="border-b border-line bg-paper px-5 py-3">
              <h2 className="display text-[22px]">{section.title}</h2>
            </div>
            <ul className="divide-y divide-line">
              {section.items.map((item) => {
                const change = changes[item.id] ?? {};
                const available = change.available ?? item.available;
                const price = change.price !== undefined ? change.price : item.price;
                return (
                  <li key={item.id} className={cx("grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-4 px-5 py-2.5", !available && "bg-paper-2")}>
                    <div className="min-w-0">
                      <div className={cx("truncate text-[14px]", !available && "text-muted line-through")}>{item.name}</div>
                      {!available ? <Badge tone="danger">Sold out</Badge> : null}
                    </div>
                    {item.priceVariants.length ? (
                      <span className="text-right text-[12.5px] text-muted">{item.priceVariants.map((v) => `${v.label} ${formatMoney(v.price, { locale: doc.locale, currency: doc.currency, symbol: true, trimDecimals: true })}`).join(" · ")}</span>
                    ) : (
                      <input
                        defaultValue={price === null ? "" : formatMoney(price, { locale: doc.locale, currency: doc.currency, symbol: false, trimDecimals: false })}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const minor = raw ? parseMoney(raw, doc.currency) : null;
                          const bad = raw !== "" && minor === null;
                          setInvalid((s) => {
                            const next = new Set(s);
                            if (bad) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                          if (bad || minor === item.price) {
                            setChanges(({ [item.id]: _removed, ...rest }) => (change.available !== undefined ? { ...rest, [item.id]: { available: change.available } } : rest));
                            return;
                          }
                          setChanges((c) => ({ ...c, [item.id]: { ...c[item.id], price: minor } }));
                        }}
                        className={cx("h-9 rounded-md border bg-card px-2 text-right tabular-nums", invalid.has(item.id) ? "border-danger" : "border-line")}
                        aria-label={`${item.name} price`}
                      />
                    )}
                    <label className="flex items-center gap-2 text-[12.5px] text-muted">
                      <Switch checked={available} onChange={(v) => setChanges((c) => ({ ...c, [item.id]: { ...c[item.id], available: v } }))} label={`${item.name} available`} />
                      {available ? "On" : "86'd"}
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
