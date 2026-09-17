import { GlassIcon } from "@menu-studio/design-system/react";
import { itemDisplayName, type MatrixPlacement } from "@menu-studio/shared";
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useRenderContext } from "../context.tsx";
import { pxToMm } from "../geometry.ts";
import { coordToPlot, DEFAULT_COLLISION, plotToCoord, resolveCollisions, type ResolvedLabel } from "../matrix/collide.ts";
import { PriceView } from "./Item.tsx";

const LEADER_THRESHOLD_MM = 4;

export function MatrixView() {
  const ctx = useRenderContext();
  const matrix = ctx.spec.matrix;
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [resolved, setResolved] = useState<Record<string, ResolvedLabel> | null>(null);
  const [plotSize, setPlotSize] = useState<{ width: number; height: number } | null>(null);
  const [drag, setDrag] = useState<{ itemId: string; xMm: number; yMm: number } | null>(null);

  const placements = useMemo(
    () =>
      (matrix?.placements ?? []).filter((p) => {
        const loc = ctx.items.get(p.itemId);
        return loc && (ctx.mode !== "qr" || loc.item.available);
      }),
    [matrix, ctx.items, ctx.mode],
  );
  const layoutKey = `${JSON.stringify(placements)}|${ctx.spec.tokens.fontPairingId}|${ctx.spec.tokens.density}|${ctx.spec.tokens.bodyScale}|${ctx.lang}`;

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    let cancelled = false;
    const run = () => {
      if (cancelled || !plotRef.current) return;
      const width = pxToMm(plot.offsetWidth);
      const height = pxToMm(plot.offsetHeight);
      const labels = placements.map((p) => {
        const el = plot.querySelector<HTMLElement>(`[data-ms-label="${p.itemId}"]`);
        const anchor = coordToPlot(p.x, p.y, width, height);
        return {
          id: p.itemId,
          anchorX: anchor.x,
          anchorY: anchor.y,
          width: el ? pxToMm(el.offsetWidth) : 20,
          height: el ? pxToMm(el.offsetHeight) : 10,
          locked: p.locked,
        };
      });
      const result = resolveCollisions(labels, { ...DEFAULT_COLLISION, plotWidth: width, plotHeight: height });
      setPlotSize({ width, height });
      setResolved(Object.fromEntries(result.map((r) => [r.id, r])));
    };
    setResolved(null);
    run();
    if (typeof document !== "undefined" && "fonts" in document) void document.fonts.ready.then(run);
    return () => {
      cancelled = true;
    };
    // layoutKey captures every input that changes label sizes or anchors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  if (!matrix) return null;
  const canDrag = Boolean(ctx.editing?.moveMatrixItem);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, placement: MatrixPlacement) => {
    ctx.editing?.selectItem?.(placement.itemId);
    if (!canDrag || placement.locked || !plotRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = plotRef.current.getBoundingClientRect();
    const size = { width: pxToMm(plotRef.current.offsetWidth), height: pxToMm(plotRef.current.offsetHeight) };
    const toMm = (e: { clientX: number; clientY: number }) => ({
      xMm: Math.max(0, Math.min(size.width, ((e.clientX - rect.left) / rect.width) * size.width)),
      yMm: Math.max(0, Math.min(size.height, ((e.clientY - rect.top) / rect.height) * size.height)),
    });
    setDrag({ itemId: placement.itemId, ...toMm(event) });
    const target = event.currentTarget;
    const move = (e: globalThis.PointerEvent) => setDrag({ itemId: placement.itemId, ...toMm(e) });
    const up = (e: globalThis.PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      const { xMm, yMm } = toMm(e);
      setDrag(null);
      const coord = plotToCoord(xMm, yMm, size.width, size.height);
      if (coord.x !== placement.x || coord.y !== placement.y) ctx.editing?.moveMatrixItem?.(placement.itemId, coord.x, coord.y);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return (
    <div className="ms-matrix" data-ms-matrix-ready={resolved ? "true" : "false"}>
      <div className="ms-matrix__axis ms-matrix__axis--top">{matrix.yAxis.posLabel}</div>
      <div className="ms-matrix__row">
        <div className="ms-matrix__axis ms-matrix__axis--left">{matrix.xAxis.negLabel}</div>
        <div className="ms-matrix__plot" ref={plotRef}>
          <div className="ms-matrix__cross ms-matrix__cross--h" aria-hidden />
          <div className="ms-matrix__cross ms-matrix__cross--v" aria-hidden />
          {resolved && plotSize ? (
            <svg className="ms-matrix__leaders" viewBox={`0 0 ${plotSize.width} ${plotSize.height}`} preserveAspectRatio="none" aria-hidden>
              {placements.map((p) => {
                const r = resolved[p.itemId];
                if (!r || r.displacedMm < LEADER_THRESHOLD_MM || drag?.itemId === p.itemId) return null;
                const anchor = coordToPlot(p.x, p.y, plotSize.width, plotSize.height);
                return (
                  <g key={p.itemId}>
                    <line x1={anchor.x} y1={anchor.y} x2={r.x} y2={r.y} />
                    <circle cx={anchor.x} cy={anchor.y} r={0.7} />
                  </g>
                );
              })}
            </svg>
          ) : null}
          {placements.map((p) => {
            const loc = ctx.items.get(p.itemId);
            if (!loc) return null;
            const item = loc.item;
            const r = resolved?.[p.itemId];
            const dragging = drag?.itemId === p.itemId;
            const style = dragging
              ? { left: `${drag.xMm}mm`, top: `${drag.yMm}mm` }
              : r
                ? { left: `${r.x}mm`, top: `${r.y}mm` }
                : { left: `${((p.x + 1) / 2) * 100}%`, top: `${(1 - (p.y + 1) / 2) * 100}%` };
            const classes = [
              "ms-matrix__label",
              p.locked ? "ms-matrix__label--locked" : "",
              dragging ? "ms-matrix__label--dragging" : "",
              ctx.selectedItemId === p.itemId ? "ms-matrix__label--selected" : "",
              canDrag && !p.locked ? "ms-matrix__label--draggable" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={p.itemId}
                className={classes}
                style={style}
                data-ms-label={p.itemId}
                data-ms-item={item.id}
                onPointerDown={(e) => onPointerDown(e, p)}
              >
                {item.attributes.glassware ? (
                  <span className="ms-matrix__glass">
                    <GlassIcon type={item.attributes.glassware} colorHex={item.attributes.colorHex} />
                  </span>
                ) : null}
                <span className="ms-matrix__name">{itemDisplayName(item, ctx.lang)}</span>
                <PriceView item={item} className="ms-matrix__price" />
              </div>
            );
          })}
        </div>
        <div className="ms-matrix__axis ms-matrix__axis--right">{matrix.xAxis.posLabel}</div>
      </div>
      <div className="ms-matrix__axis ms-matrix__axis--bottom">{matrix.yAxis.negLabel}</div>
    </div>
  );
}
