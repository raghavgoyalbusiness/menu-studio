import { applyEdits, type Edit, type LayoutSpec, type MenuDocument, type OverflowReport, type VersionDto } from "@menu-studio/shared";
import { create } from "zustand";
import { api, ApiError, errorMessage } from "../lib/api.ts";
import { keys, queryClient } from "../lib/queries.ts";

export type SaveState = "idle" | "saving" | "error";

export interface EditorState {
  projectId: string | null;
  /** Last version the server confirmed. */
  head: VersionDto | null;
  /** Working copy: head plus optimistic edits not yet confirmed. */
  document: MenuDocument | null;
  spec: LayoutSpec | null;
  saveState: SaveState;
  error: string | null;
  redo: string[];
  selectedBlockId: string | null;
  selectedItemId: string | null;
  zoom: number;
  guides: { bleed: boolean; safe: boolean };
  lang: string | null;
  overflow: OverflowReport | null;

  load(projectId: string, head: VersionDto): void;
  commit(edits: Edit[], summary?: string): Promise<VersionDto | null>;
  replaceHead(version: VersionDto, options?: { keepRedo?: boolean }): void;
  undo(): Promise<void>;
  redoNext(): Promise<void>;
  select(blockId: string | null, itemId?: string | null): void;
  setZoom(zoom: number): void;
  toggleGuide(which: "bleed" | "safe"): void;
  setLang(lang: string | null): void;
  setOverflow(report: OverflowReport | null): void;
  clearError(): void;
}

let queue: Promise<unknown> = Promise.resolve();

function invalidate(projectId: string) {
  void queryClient.invalidateQueries({ queryKey: keys.versions(projectId) });
  void queryClient.invalidateQueries({ queryKey: keys.project(projectId) });
}

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  head: null,
  document: null,
  spec: null,
  saveState: "idle",
  error: null,
  redo: [],
  selectedBlockId: null,
  selectedItemId: null,
  zoom: 0.9,
  guides: { bleed: true, safe: true },
  lang: null,
  overflow: null,

  load(projectId, head) {
    const current = get();
    if (current.projectId === projectId && current.head?.id === head.id) return;
    set({ projectId, head, document: head.document, spec: head.spec, saveState: "idle", error: null, redo: current.projectId === projectId ? current.redo : [], overflow: null });
  },

  /**
   * Optimistic commit: apply locally with the same applyEdits the server uses, then save.
   * Saves are serialized so each one builds on the version the previous save produced.
   */
  commit(edits, summary) {
    const { document, spec, projectId } = get();
    if (!document || !projectId) return Promise.resolve(null);
    const local = applyEdits({ document, spec }, edits);
    if (!local.ok) {
      set({ error: local.error.issues[0] ? `${local.error.message}: ${local.error.issues[0]}` : local.error.message });
      return Promise.resolve(null);
    }
    set({ document: local.docs.document, spec: local.docs.spec, saveState: "saving", error: null });

    const run = async (): Promise<VersionDto | null> => {
      const base = get().head;
      if (!base) return null;
      try {
        const version = await api<VersionDto>(`/projects/${projectId}/versions`, { method: "POST", body: { baseVersionId: base.id, edits, summary } });
        const pendingDoc = get().document;
        const pendingSpec = get().spec;
        set({ head: version, redo: [], saveState: "idle" });
        // Later optimistic edits already sit on top of the working copy; keep them.
        if (pendingDoc === local.docs.document && pendingSpec === local.docs.spec) set({ document: version.document, spec: version.spec });
        invalidate(projectId);
        return version;
      } catch (error) {
        const head = get().head;
        const stale = error instanceof ApiError && error.code === "stale_version";
        set({
          saveState: "error",
          error: stale ? "This menu changed somewhere else. Your last change was not saved; reload to continue." : errorMessage(error),
          document: head?.document ?? null,
          spec: head?.spec ?? null,
        });
        return null;
      }
    };
    const next = queue.then(run, run);
    queue = next;
    return next;
  },

  replaceHead(version, options) {
    set({ head: version, document: version.document, spec: version.spec, saveState: "idle", error: null, ...(options?.keepRedo ? {} : { redo: [] }) });
    const projectId = get().projectId;
    if (projectId) invalidate(projectId);
  },

  async undo() {
    const { head, projectId, redo } = get();
    if (!head?.parentVersionId || !projectId) return;
    await queue;
    set({ saveState: "saving" });
    try {
      const version = await api<VersionDto>(`/projects/${projectId}/head`, { method: "POST", body: { versionId: head.parentVersionId } });
      set({ redo: [head.id, ...redo] });
      get().replaceHead(version, { keepRedo: true });
    } catch (error) {
      set({ saveState: "error", error: errorMessage(error) });
    }
  },

  async redoNext() {
    const { redo, projectId } = get();
    const target = redo[0];
    if (!target || !projectId) return;
    await queue;
    set({ saveState: "saving" });
    try {
      const version = await api<VersionDto>(`/projects/${projectId}/head`, { method: "POST", body: { versionId: target } });
      set({ redo: redo.slice(1) });
      get().replaceHead(version, { keepRedo: true });
    } catch (error) {
      set({ saveState: "error", error: errorMessage(error) });
    }
  },

  select(blockId, itemId = null) {
    set({ selectedBlockId: blockId, selectedItemId: itemId });
  },
  setZoom(zoom) {
    set({ zoom: Math.max(0.3, Math.min(2, Math.round(zoom * 100) / 100)) });
  },
  toggleGuide(which) {
    set((s) => ({ guides: { ...s.guides, [which]: !s.guides[which] } }));
  },
  setLang(lang) {
    set({ lang });
  },
  setOverflow(report) {
    set({ overflow: report });
  },
  clearError() {
    set({ error: null, saveState: "idle" });
  },
}));
