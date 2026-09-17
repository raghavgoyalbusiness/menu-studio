import type { EditResponse, VersionDto } from "@menu-studio/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { IconArrowRight, IconSparkle, IconUndo } from "../components/icons.tsx";
import { toast } from "../components/toast.tsx";
import { Badge, Button, cx, Spinner, useElapsed } from "../components/ui.tsx";
import { api, ApiError, errorMessage } from "../lib/api.ts";
import { keys, useVersions } from "../lib/queries.ts";
import { useEditor } from "../stores/editor.ts";

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "applied"; text: string; versionId: string; warnings: string[] }
  | { id: string; role: "assistant"; kind: "clarify" | "unsupported"; text: string }
  | { id: string; role: "assistant"; kind: "error"; text: string; upgrade: boolean; retry: string | null };

const SUGGESTIONS = ["Make the desserts section more prominent", "Switch to a darker palette", "Give it more breathing room", "Use a more classic typeface"];

export function ChatPanel({ projectId }: { projectId: string }) {
  const { head, selectedBlockId, selectedItemId, spec, document: doc, replaceHead } = useEditor();
  const versions = useVersions(projectId);
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Earlier AI edits from version history, so the conversation survives reloads.
  // Seeded once during render (React's "adjust state while rendering" pattern).
  const [seeded, setSeeded] = useState(false);
  if (!seeded && versions.data && !messages.length) {
    setSeeded(true);
    const past = versions.data
      .filter((v) => v.source === "ai_edit" && v.instruction)
      .slice(0, 12)
      .reverse()
      .flatMap((v): Message[] => [
        { id: `${v.id}-u`, role: "user", text: v.instruction ?? "" },
        { id: `${v.id}-a`, role: "assistant", kind: "applied", text: v.summary ?? "Done.", versionId: v.id, warnings: [] },
      ]);
    if (past.length) setMessages(past);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useMutation({
    mutationFn: (instruction: string) => {
      const current = useEditor.getState().head;
      if (!current) throw new Error("Nothing to edit yet");
      return api<EditResponse>("/edit", {
        method: "POST",
        body: { projectId, versionId: current.id, instruction, selection: { blockIds: selectedBlockId ? [selectedBlockId] : [], itemIds: selectedItemId ? [selectedItemId] : [] } },
      });
    },
    onMutate: (instruction) => {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: instruction }]);
      setInput("");
    },
    onSuccess: (result) => {
      if (result.kind === "applied") {
        replaceHead(result.version);
        const warnings = [result.contentChanged.prices ? "Prices changed" : "", result.contentChanged.names ? "Item names changed" : "", result.contentChanged.descriptions ? "Descriptions changed" : ""].filter(Boolean);
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", kind: "applied", text: result.summary, versionId: result.version.id, warnings }]);
      } else if (result.kind === "clarify") {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", kind: "clarify", text: result.question }]);
      } else {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", kind: "unsupported", text: result.message }]);
      }
    },
    onError: (error, instruction) => {
      const upgrade = error instanceof ApiError && error.status === 402;
      const retry = error instanceof ApiError && error.retryable ? instruction : null;
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", kind: "error", text: errorMessage(error), upgrade, retry }]);
    },
  });

  const undo = useMutation({
    mutationFn: (versionId: string) => {
      const current = useEditor.getState().head;
      return api<VersionDto>(`/projects/${projectId}/versions/${versionId}/revert`, { method: "POST", body: { baseVersionId: current?.id } });
    },
    onSuccess: (version) => {
      replaceHead(version);
      void queryClient.invalidateQueries({ queryKey: keys.versions(projectId) });
      toast("Undid that edit.");
    },
    onError: (error) => toast(errorMessage(error), { tone: "danger" }),
  });

  const elapsed = useElapsed(send.isPending);
  const submit = () => {
    const text = input.trim();
    if (text.length >= 2 && !send.isPending) send.mutate(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const selectedLabel = (() => {
    if (!doc || !spec) return null;
    if (selectedItemId) return doc.sections.flatMap((s) => s.items).find((i) => i.id === selectedItemId)?.name ?? null;
    if (selectedBlockId) {
      const block = spec.pages.flatMap((p) => p.blocks).find((b) => b.id === selectedBlockId);
      return block?.sectionRef ? (doc.sections.find((s) => s.id === block.sectionRef)?.title ?? block.type) : (block?.type ?? null);
    }
    return null;
  })();

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="scroll-quiet flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="pt-6">
            <div className="display text-[24px] leading-tight">Ask for a change</div>
            <p className="mt-2 text-[13px] text-muted">Describe what you want in plain words. Every edit is saved as a version you can undo.</p>
            <div className="mt-5 flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send.mutate(s)} disabled={send.isPending || !head} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-left text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
                  {s} <IconArrowRight size={13} className="text-faint" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ol className="flex flex-col gap-3">
          {messages.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="ml-8 self-end rounded-lg rounded-br-sm bg-ink px-3 py-2 text-[13px] text-paper">
                {m.text}
              </li>
            ) : (
              <li key={m.id} className={cx("mr-6 rounded-lg rounded-bl-sm border px-3 py-2.5 text-[13px]", m.kind === "error" ? "border-danger/20 bg-danger-soft text-danger" : "border-line bg-card text-ink")}>
                <div className="flex items-start gap-2">
                  {m.kind === "applied" ? <IconSparkle size={14} className="mt-0.5 shrink-0 text-accent" /> : null}
                  <div className="flex-1">
                    {m.kind === "clarify" ? <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Question</div> : null}
                    {m.kind === "unsupported" ? <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Not possible yet</div> : null}
                    {m.text}
                    {m.kind === "applied" && m.warnings.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.warnings.map((w) => (
                          <Badge key={w} tone="warn">
                            {w}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {m.kind === "error" && m.upgrade ? (
                      <Link to="/billing" className="mt-1.5 block font-medium underline underline-offset-2">
                        See plans
                      </Link>
                    ) : null}
                    {m.kind === "error" && m.retry ? (
                      <button className="mt-1.5 font-medium underline underline-offset-2" onClick={() => m.retry && send.mutate(m.retry)}>
                        Try again
                      </button>
                    ) : null}
                  </div>
                  {m.kind === "applied" ? (
                    <button className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-muted hover:bg-paper-2 hover:text-ink" onClick={() => undo.mutate(m.versionId)} disabled={undo.isPending} aria-label="Undo this edit">
                      <IconUndo size={12} /> Undo
                    </button>
                  ) : null}
                </div>
              </li>
            ),
          )}
          {send.isPending ? (
            <li className="mr-6 flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2.5 text-[13px] text-muted">
              <Spinner size={13} /> Working on it… <span className="tabular-nums text-faint">{elapsed}s</span>
            </li>
          ) : null}
        </ol>
      </div>
      <div className="border-t border-line p-3">
        {selectedLabel ? (
          <div className="mb-2 flex items-center gap-1.5 text-[12px] text-muted">
            Selected: <Badge>{selectedLabel}</Badge>
          </div>
        ) : null}
        <div className="rounded-lg border border-line-strong bg-card focus-within:border-ink-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={selectedLabel ? `Change "${selectedLabel}"…` : "Make the cocktails section feel more premium…"}
            className="w-full resize-none bg-transparent px-3 pt-2.5 text-[13.5px] placeholder:text-faint focus:outline-none"
            aria-label="Describe a change"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] text-faint">Enter to send</span>
            <Button size="sm" variant="primary" onClick={submit} disabled={input.trim().length < 2 || !head} loading={send.isPending}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
