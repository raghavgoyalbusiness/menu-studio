import { FONT_PAIRINGS, type FontPairingId } from "@menu-studio/design-system/catalog";
import { LANGUAGES } from "@menu-studio/i18n";
import { PLANS, type ExportDto, type ExportKind, type TranslateResponse, type VersionDto, type VersionSource } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IconDownload } from "../components/icons.tsx";
import { toast } from "../components/toast.tsx";
import { Badge, Button, cx, Dialog, ErrorNotice, Notice, Sheet, Spinner } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { keys, useExports, useUsage, useVersions } from "../lib/queries.ts";
import { useEditor } from "../stores/editor.ts";
import { setToken } from "./spec-edits.ts";

const SOURCE_LABEL: Record<VersionSource, string> = { manual: "Edit", ai_concept: "Concept", ai_edit: "AI edit", import: "Import", restore: "Restore" };

export function HistorySheet({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const versions = useVersions(projectId);
  const { head, replaceHead } = useEditor();
  const restore = useMutation({
    mutationFn: (versionId: string) => api<VersionDto>(`/projects/${projectId}/restore`, { method: "POST", body: { versionId, baseVersionId: useEditor.getState().head?.id } }),
    onSuccess: (version) => {
      replaceHead(version);
      toast(`Restored. This is now version ${version.seq}.`);
    },
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Version history">
      {versions.isLoading ? (
        <div className="flex justify-center py-10 text-muted">
          <Spinner />
        </div>
      ) : (
        <ol className="divide-y divide-line">
          {versions.data?.map((v) => (
            <li key={v.id} className={cx("flex items-start justify-between gap-3 px-5 py-3", v.id === head?.id && "bg-paper-2")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="tabular-nums">v{v.seq}</span>
                  <Badge tone={v.source === "ai_edit" || v.source === "ai_concept" ? "accent" : "neutral"}>{SOURCE_LABEL[v.source]}</Badge>
                  {v.id === head?.id ? <Badge tone="ok">Current</Badge> : null}
                </div>
                <div className="mt-1 text-[13px] text-ink">{v.summary ?? v.instruction ?? "Change"}</div>
                <div className="mt-0.5 text-[11.5px] text-faint">{new Date(v.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              {v.id !== head?.id ? (
                <Button size="sm" variant="ghost" loading={restore.isPending && restore.variables === v.id} onClick={() => restore.mutate(v.id)}>
                  Restore
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {restore.error ? <ErrorNotice className="m-4" error={restore.error} /> : null}
    </Sheet>
  );
}

const EXPORT_OPTIONS: { kind: ExportKind; title: string; description: string }[] = [
  { kind: "pdf", title: "PDF with bleed", description: "3 mm bleed on every edge. What most printers ask for." },
  { kind: "pdf_crop_marks", title: "PDF with crop marks", description: "Bleed plus trim marks in the margin, with trim and bleed boxes set." },
  { kind: "png", title: "PNG images", description: "One image per page at 300 DPI, plus a 1080 px version for social." },
  { kind: "print_pack", title: "Print pack", description: "Both PDFs, all PNGs and a README for your printer, in one zip." },
];

export function ExportDialog({ projectId, orgId, open, onOpenChange }: { projectId: string; orgId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [kind, setKind] = useState<ExportKind>("pdf");
  const head = useEditor((s) => s.head);
  const usage = useUsage(orgId);
  const exports = useExports(projectId);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => api<ExportDto>(`/projects/${projectId}/exports`, { method: "POST", body: { versionId: head?.id, kind } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.exports(projectId) }),
  });
  const watermarked = usage.data ? PLANS[usage.data.plan].watermark && usage.data.exportCredits === 0 : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Export" description="Files are rendered by the same engine you see in the editor, at exact paper size." wide>
      <div className="grid gap-2 sm:grid-cols-2">
        {EXPORT_OPTIONS.map((o) => (
          <button key={o.kind} onClick={() => setKind(o.kind)} className={cx("rounded-md border p-4 text-left transition-colors", kind === o.kind ? "border-ink bg-paper" : "border-line hover:border-line-strong")} aria-pressed={kind === o.kind}>
            <div className="text-[14px] font-medium">{o.title}</div>
            <div className="mt-1 text-[12.5px] text-muted">{o.description}</div>
          </button>
        ))}
      </div>
      {watermarked ? (
        <Notice tone="warn" className="mt-4">
          Free plan exports carry a small "Made with Menu Studio" line. <a href="/billing" className="font-medium underline">Buy a print pack or upgrade</a> for clean files.
        </Notice>
      ) : null}
      <div className="mt-5 flex items-center gap-3">
        <Button variant="primary" size="lg" loading={create.isPending} onClick={() => create.mutate()} disabled={!head?.spec}>
          Export version {head?.seq}
        </Button>
        {create.error ? <ErrorNotice error={create.error} onRetry={() => create.mutate()} /> : null}
      </div>
      <div className="mt-6">
        <div className="eyebrow mb-2">Recent exports</div>
        {exports.data?.length ? (
          <ul className="divide-y divide-line rounded-md border border-line">
            {exports.data.slice(0, 6).map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span>
                    {EXPORT_OPTIONS.find((o) => o.kind === e.kind)?.title} <span className="text-muted">· {new Date(e.createdAt).toLocaleTimeString(undefined, { timeStyle: "short" })}</span>
                    {e.watermarked ? <span className="ml-2 text-[11.5px] text-muted">watermarked</span> : null}
                  </span>
                  {e.status === "done" ? <Badge tone="ok">Ready</Badge> : e.status === "failed" ? <Badge tone="danger">Failed</Badge> : <span className="flex items-center gap-1.5 text-[12px] text-muted"><Spinner size={12} /> Rendering</span>}
                </div>
                {e.status === "failed" && e.error ? <div className="mt-1 text-[12px] text-danger">{e.error}</div> : null}
                {e.status === "done" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {e.files.map((f) => (
                      <a key={f.path} href={f.url} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] hover:bg-paper-2" download={f.name}>
                        <IconDownload size={12} /> {f.name}
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">Nothing exported yet.</p>
        )}
      </div>
    </Dialog>
  );
}

export function TranslateDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { head, document: doc, replaceHead, commit, setLang } = useEditor();
  const [selected, setSelected] = useState<string[]>([]);
  const [warning, setWarning] = useState<TranslateResponse["fontWarning"]>(null);
  const translate = useMutation({
    mutationFn: () => api<TranslateResponse>("/translate", { method: "POST", body: { projectId, versionId: head?.id, languages: selected } }),
    onSuccess: (result) => {
      replaceHead(result.version);
      setWarning(result.fontWarning);
      if (!result.fontWarning) {
        toast("Translations added.");
        if (selected[0]) setLang(selected[0]);
        onOpenChange(false);
      }
    },
  });
  if (!doc) return null;
  const existing = new Set(doc.additionalLanguages);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Translate" description="Adds translations to the menu content. The QR menu gets a language switcher; print can use any language.">
      <div className="flex flex-wrap gap-2">
        {LANGUAGES.filter((l) => l.code !== doc.primaryLanguage).map((l) => {
          const active = selected.includes(l.code);
          return (
            <button key={l.code} onClick={() => setSelected(active ? selected.filter((c) => c !== l.code) : [...selected, l.code].slice(0, 5))} className={cx("rounded-full border px-3 py-1.5 text-[12.5px]", active ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-2 hover:border-ink")}>
              {l.nativeName}
              {existing.has(l.code) ? <span className="ml-1 opacity-60">✓</span> : null}
            </button>
          );
        })}
      </div>
      {warning ? (
        <Notice tone="warn" className="mt-5">
          {warning.message}
          <div className="mt-3 flex flex-wrap gap-2">
            {warning.suggestedPairingIds.map((id) => (
              <Button
                key={id}
                size="sm"
                onClick={() => {
                  const spec = useEditor.getState().spec;
                  const edit = spec ? setToken(spec, "fontPairingId", id as FontPairingId) : null;
                  if (edit) void commit([edit], `Switched to ${FONT_PAIRINGS[id as FontPairingId].name} for translated text`);
                  if (selected[0]) setLang(selected[0]);
                  onOpenChange(false);
                }}
              >
                Use {FONT_PAIRINGS[id as FontPairingId].name}
              </Button>
            ))}
          </div>
        </Notice>
      ) : null}
      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" loading={translate.isPending} disabled={!selected.length} onClick={() => translate.mutate()}>
          Translate {selected.length ? `into ${selected.length} language${selected.length > 1 ? "s" : ""}` : ""}
        </Button>
        {translate.error ? <ErrorNotice error={translate.error} onRetry={() => translate.mutate()} /> : null}
      </div>
    </Dialog>
  );
}
