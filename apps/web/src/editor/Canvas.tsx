import { AutoFitRunner, MenuRenderer, type AutoFitResult, type EditingBridge } from "@menu-studio/renderer";
import { parseMoney, type OverflowReport } from "@menu-studio/shared";
import { useCallback, useMemo, useState } from "react";
import { IconAlert, IconSparkle } from "../components/icons.tsx";
import { toast } from "../components/toast.tsx";
import { Button } from "../components/ui.tsx";
import { useEditor } from "../stores/editor.ts";
import { guardedReplace, moveMatrixItem } from "./spec-edits.ts";

export function Canvas({ logoUrl, timezone, pageCountPreference, watermark }: { logoUrl: string | null; timezone: string; pageCountPreference: "single" | "fit_content" | number; watermark: boolean }) {
  const { document: doc, spec, zoom, guides, selectedBlockId, selectedItemId, lang, overflow } = useEditor();
  const commit = useEditor((s) => s.commit);
  const select = useEditor((s) => s.select);
  const setOverflow = useEditor((s) => s.setOverflow);
  const [fitting, setFitting] = useState(false);

  const bridge = useMemo<EditingBridge>(
    () => ({
      commitText(pointer, value) {
        const current = useEditor.getState().document;
        if (current) void commit([guardedReplace(current, pointer, value)], "Edited text on the canvas");
      },
      commitPrice(pointer, raw) {
        const current = useEditor.getState().document;
        if (!current) return;
        const minor = parseMoney(raw, current.currency);
        if (minor === null) {
          toast(`Couldn't read "${raw}" as a price in ${current.currency}.`, { tone: "danger" });
          return;
        }
        void commit([guardedReplace(current, pointer, minor)], "Edited a price");
      },
      selectBlock(blockId) {
        select(blockId, null);
      },
      selectItem(itemId) {
        select(useEditor.getState().selectedBlockId, itemId);
      },
      moveMatrixItem(itemId, x, y) {
        const current = useEditor.getState().spec;
        const edit = current ? moveMatrixItem(current, itemId, x, y) : null;
        if (edit) void commit([edit], "Moved a drink on the flavor matrix");
      },
    }),
    [commit, select],
  );

  const onReport = useCallback((report: OverflowReport) => setOverflow(report), [setOverflow]);

  const onFitDone = useCallback(
    (result: AutoFitResult) => {
      setFitting(false);
      if (result.edits.length) void commit(result.edits, `Auto-fit: ${result.steps.join("; ")}`.slice(0, 200));
      if (result.report.message && !result.report.fits) toast(result.report.message, { tone: "danger" });
      else if (!result.edits.length) toast("The layout already fits.");
    },
    [commit],
  );

  if (!doc || !spec) return null;
  const overflowing = overflow && !overflow.fits ? overflow.pages.filter((p) => p.overflowMm > 0) : [];
  const highlight = overflowing.flatMap((p) => p.blockIds);

  return (
    <div className="relative h-full">
      {overflowing.length ? (
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-warn/25 bg-card py-1.5 pr-1.5 pl-4 text-[12.5px] text-warn shadow-soft" role="status">
          <IconAlert size={14} />
          <span>
            {overflowing.length === 1
              ? `Page ${spec.pages.findIndex((p) => p.id === overflowing[0]?.pageId) + 1} overflows by ${overflowing[0]?.overflowMm} mm`
              : `${overflowing.length} pages overflow`}
          </span>
          <Button size="sm" variant="primary" icon={<IconSparkle size={13} />} loading={fitting} onClick={() => setFitting(true)}>
            Auto-fit
          </Button>
        </div>
      ) : null}
      {overflow && !overflow.fontsLoaded ? <div className="absolute top-3 right-3 z-10 rounded-md bg-warn-soft px-3 py-1.5 text-[12px] text-warn">Fonts are still loading</div> : null}
      <div className="scroll-quiet h-full overflow-auto bg-canvas" onClick={() => select(null, null)}>
        <div className="flex min-w-max justify-center px-12 py-14">
          <div style={{ zoom }} onClick={(e) => e.stopPropagation()}>
            <MenuRenderer
              document={doc}
              spec={spec}
              mode="editor"
              editing={bridge}
              guides={guides}
              selectedBlockId={selectedBlockId}
              selectedItemId={selectedItemId}
              highlightBlockIds={highlight}
              onReport={onReport}
              logoUrl={logoUrl}
              timezone={timezone}
              watermark={watermark}
              {...(lang ? { lang } : {})}
            />
          </div>
        </div>
      </div>
      {fitting ? <AutoFitRunner document={doc} spec={spec} pageCountPreference={pageCountPreference} onDone={onFitDone} /> : null}
    </div>
  );
}
