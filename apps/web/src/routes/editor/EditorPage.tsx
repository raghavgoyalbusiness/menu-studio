import { languageName } from "@menu-studio/i18n";
import { PLANS } from "@menu-studio/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Wordmark } from "../../components/AppShell.tsx";
import { IconChart, IconChat, IconGlobe, IconHistory, IconLayers, IconList, IconQr, IconRedo, IconSliders, IconUndo, IconZoomIn, IconZoomOut } from "../../components/icons.tsx";
import { Button, cx, ErrorNotice, IconButton, Spinner, Tab, TabList, TabPanel, Tabs } from "../../components/ui.tsx";
import { useProject, useUsage } from "../../lib/queries.ts";
import { removeItem } from "../../lib/doc-edits.ts";
import { Canvas } from "../../editor/Canvas.tsx";
import { ChatPanel } from "../../editor/ChatPanel.tsx";
import { ContentPanel } from "../../editor/ContentPanel.tsx";
import { ExportDialog, HistorySheet, TranslateDialog } from "../../editor/Dialogs.tsx";
import { InspectorPanel } from "../../editor/InspectorPanel.tsx";
import { LayersPanel } from "../../editor/LayersPanel.tsx";
import { moveMatrixItem } from "../../editor/spec-edits.ts";
import { toast } from "../../components/toast.tsx";
import { useEditor } from "../../stores/editor.ts";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));
}

export function EditorPage() {
  const { projectId = "" } = useParams();
  const project = useProject(projectId);
  const navigate = useNavigate();
  const editor = useEditor();
  const { load, head, spec, document: doc, saveState, error, redo, zoom, guides, lang } = editor;
  const usage = useUsage(project.data?.org.id);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [panel, setPanel] = useState("chat");
  const nudge = useRef<{ itemId: string; x: number; y: number; timer: number } | null>(null);

  useEffect(() => {
    const h = project.data?.head;
    if (h) load(projectId, h);
  }, [project.data, projectId, load]);

  useEffect(() => {
    if (project.data && project.data.head && !project.data.head.spec) void navigate(`/projects/${projectId}/brief`, { replace: true });
  }, [project.data, projectId, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const state = useEditor.getState();
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void (e.shiftKey ? state.redoNext() : state.undo());
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void state.redoNext();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedItemId && state.document) {
        const item = state.document.sections.flatMap((s) => s.items).find((i) => i.id === state.selectedItemId);
        const edit = removeItem(state.document, state.selectedItemId);
        if (edit && item) {
          e.preventDefault();
          void state.commit([edit], `Removed ${item.name}`).then(() => toast(`Removed ${item.name}.`, { action: { label: "Undo", onClick: () => void useEditor.getState().undo() } }));
          state.select(null, null);
        }
        return;
      }
      if (e.key.startsWith("Arrow") && state.selectedItemId && state.spec?.matrix) {
        const placement = state.spec.matrix.placements.find((p) => p.itemId === state.selectedItemId);
        if (!placement || placement.locked) return;
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 0.03;
        const current = nudge.current?.itemId === placement.itemId ? nudge.current : { itemId: placement.itemId, x: placement.x, y: placement.y, timer: 0 };
        const x = Math.max(-1, Math.min(1, current.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0)));
        const y = Math.max(-1, Math.min(1, current.y + (e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0)));
        window.clearTimeout(current.timer);
        // Nudges are coalesced into one version once the keys go quiet.
        const timer = window.setTimeout(() => {
          const latest = useEditor.getState().spec;
          const edit = latest ? moveMatrixItem(latest, placement.itemId, x, y) : null;
          nudge.current = null;
          if (edit) void useEditor.getState().commit([edit], "Nudged a drink on the flavor matrix");
        }, 500);
        nudge.current = { itemId: placement.itemId, x, y, timer };
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (project.isLoading || (project.data?.head && !doc)) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner size={20} />
      </div>
    );
  }
  if (project.error) return <ErrorNotice className="m-8" error={project.error} onRetry={() => void project.refetch()} />;
  if (!project.data || !head || !spec || !doc) return null;

  const languages = [doc.primaryLanguage, ...doc.additionalLanguages];
  const watermark = usage.data ? PLANS[usage.data.plan].watermark && usage.data.exportCredits === 0 : false;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-paper px-3">
        <Wordmark className="[&>span]:hidden sm:[&>span]:inline" />
        <span className="h-5 w-px bg-line" />
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">{project.data.project.name}</div>
          <div className="text-[11.5px] text-muted">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? <span className="text-danger">Not saved</span> : `Saved · version ${head.seq}`}
          </div>
        </div>
        <div className="ml-2 flex items-center gap-0.5">
          <IconButton label="Undo (⌘Z)" onClick={() => void editor.undo()} disabled={!head.parentVersionId || saveState === "saving"}>
            <IconUndo size={16} />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" onClick={() => void editor.redoNext()} disabled={!redo.length || saveState === "saving"}>
            <IconRedo size={16} />
          </IconButton>
          <IconButton label="History" onClick={() => setHistoryOpen(true)}>
            <IconHistory size={16} />
          </IconButton>
        </div>
        <div className="mx-auto hidden items-center gap-0.5 md:flex">
          <IconButton label="Zoom out" onClick={() => editor.setZoom(zoom - 0.1)}>
            <IconZoomOut size={16} />
          </IconButton>
          <button className="w-12 rounded text-[12px] tabular-nums text-muted hover:bg-paper-2" onClick={() => editor.setZoom(0.9)}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" onClick={() => editor.setZoom(zoom + 0.1)}>
            <IconZoomIn size={16} />
          </IconButton>
          <span className="mx-2 h-5 w-px bg-line" />
          <button className={cx("rounded-md px-2 py-1 text-[12px]", guides.bleed ? "bg-paper-2 text-ink" : "text-muted")} onClick={() => editor.toggleGuide("bleed")} aria-pressed={guides.bleed}>
            Bleed
          </button>
          <button className={cx("rounded-md px-2 py-1 text-[12px]", guides.safe ? "bg-paper-2 text-ink" : "text-muted")} onClick={() => editor.toggleGuide("safe")} aria-pressed={guides.safe}>
            Safe zone
          </button>
          <span className="mx-2 h-5 w-px bg-line" />
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <IconGlobe size={14} />
            <select value={lang ?? doc.primaryLanguage} onChange={(e) => editor.setLang(e.target.value === doc.primaryLanguage ? null : e.target.value)} className="bg-transparent text-ink" aria-label="Preview language">
              {languages.map((l) => (
                <option key={l} value={l}>
                  {languageName(l, true)}
                </option>
              ))}
            </select>
          </label>
          <button className="ml-1 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-paper-2 hover:text-ink" onClick={() => setTranslateOpen(true)}>
            Translate
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link to={`/projects/${projectId}/engineering`} className="hidden lg:block">
            <Button size="sm" variant="ghost" icon={<IconChart size={14} />}>
              Engineering
            </Button>
          </Link>
          <Link to={`/projects/${projectId}/publish`}>
            <Button size="sm" icon={<IconQr size={14} />}>
              Publish
            </Button>
          </Link>
          <Button size="sm" variant="primary" onClick={() => setExportOpen(true)}>
            Export
          </Button>
        </div>
      </header>
      {error ? (
        <div className="flex items-center justify-between gap-3 border-b border-danger/20 bg-danger-soft px-4 py-2 text-[12.5px] text-danger">
          <span>{error}</span>
          <span className="flex gap-3">
            <button className="font-medium underline" onClick={() => void project.refetch().then((r) => r.data?.head && editor.replaceHead(r.data.head))}>
              Reload
            </button>
            <button className="underline" onClick={editor.clearError}>
              Dismiss
            </button>
          </span>
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)_340px]">
        <aside className="hidden min-h-0 border-r border-line bg-paper md:block">
          <div className="flex h-10 items-center gap-1.5 border-b border-line px-4 text-[12.5px] font-medium text-ink-2">
            <IconLayers size={14} /> Layers
          </div>
          <div className="h-[calc(100%-40px)]">
            <LayersPanel />
          </div>
        </aside>
        <main className="min-h-0">
          <Canvas logoUrl={project.data.venue.logoUrl} timezone={project.data.venue.timezone} pageCountPreference={head.brief?.pageCountPreference ?? "fit_content"} watermark={false} />
        </main>
        <aside className="hidden min-h-0 border-l border-line bg-paper md:block">
          <Tabs value={panel} onValueChange={setPanel} className="flex h-full flex-col">
            <TabList>
              <Tab value="chat">
                <IconChat size={14} /> Chat
              </Tab>
              <Tab value="inspector">
                <IconSliders size={14} /> Design
              </Tab>
              <Tab value="content">
                <IconList size={14} /> Content
              </Tab>
            </TabList>
            <TabPanel value="chat" className="min-h-0 flex-1">
              <ChatPanel projectId={projectId} />
            </TabPanel>
            <TabPanel value="inspector" className="min-h-0 flex-1">
              <InspectorPanel />
            </TabPanel>
            <TabPanel value="content" className="min-h-0 flex-1">
              <ContentPanel projectId={projectId} />
            </TabPanel>
          </Tabs>
        </aside>
      </div>
      <HistorySheet projectId={projectId} open={historyOpen} onOpenChange={setHistoryOpen} />
      <ExportDialog projectId={projectId} orgId={project.data.org.id} open={exportOpen} onOpenChange={setExportOpen} />
      <TranslateDialog projectId={projectId} open={translateOpen} onOpenChange={setTranslateOpen} />
      {watermark ? null : null}
    </div>
  );
}
