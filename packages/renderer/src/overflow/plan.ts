import {
  BODY_PT,
  COLUMN_GAP_MM,
  DENSITIES,
  FORMATS,
  MIN_BODY_PT_PRINT,
  pageColumns,
  shortId,
  type Block,
  type Edit,
  type IdPrefix,
  type JsonPatchOp,
  type LayoutSpec,
  type OverflowReport,
  type OverflowStep,
  type PageCountPreference,
} from "@menu-studio/shared";
import { orderBlocks } from "../layout/flow.ts";
import { balanceColumns, tallestColumn } from "./balance.ts";

export interface BlockMeasure {
  blockId: string;
  topMm: number;
  heightMm: number;
  /** Column index the block renders in; -1 for full-width bands. */
  column: number;
}

export interface PageMeasure {
  pageId: string;
  availableMm: number;
  usedMm: number;
  blocks: BlockMeasure[];
}

/** Headroom so text that fits in one browser still fits after cross-platform metric drift. */
export const HEADROOM = 0.015;
export const BODY_SCALE_STEP = 0.05;

export function overflowingPages(measures: readonly PageMeasure[]): PageMeasure[] {
  return measures.filter((m) => m.usedMm > m.availableMm * (1 - HEADROOM) + 0.2);
}

export function buildReport(measures: readonly PageMeasure[], fontsLoaded: boolean, appliedSteps: OverflowStep[], message?: string): OverflowReport {
  const pages = measures.map((m) => {
    const limit = m.availableMm * (1 - HEADROOM);
    return {
      pageId: m.pageId,
      availableMm: round(m.availableMm),
      usedMm: round(m.usedMm),
      overflowMm: round(Math.max(0, m.usedMm - m.availableMm)),
      blockIds: m.blocks.filter((b) => b.topMm + b.heightMm > limit + 0.2).map((b) => b.blockId),
    };
  });
  const report: OverflowReport = {
    fits: overflowingPages(measures).length === 0,
    fontsLoaded,
    pages,
    appliedSteps,
  };
  if (message) report.message = message;
  return report;
}

const round = (n: number) => Math.round(n * 10) / 10;

export type PlanResult =
  | { kind: "fits" }
  | { kind: "edit"; step: OverflowStep; edit: Edit; description: string }
  | { kind: "stuck"; message: string };

export interface PlanOptions {
  pageCountPreference: PageCountPreference;
  ids?: (prefix: IdPrefix) => string;
}

function maxPagesFor(spec: LayoutSpec, preference: PageCountPreference): number {
  const fixed = FORMATS[spec.format].pages;
  if (fixed !== "flow") return fixed;
  if (preference === "single") return 1;
  if (preference === "fit_content") return 24;
  return preference;
}

/**
 * Decide the next single fitting step for a measured layout. The caller applies the
 * edit, re-renders, re-measures and calls again until "fits" or "stuck".
 * Order: density → body font scale → rebalance columns → add a page.
 */
export function planFit(spec: LayoutSpec, measures: readonly PageMeasure[], options: PlanOptions): PlanResult {
  const over = overflowingPages(measures);
  if (!over.length) return { kind: "fits" };
  const ids = options.ids ?? shortId;
  const tokens = spec.tokens;

  // 1. Density
  const densityIndex = DENSITIES.indexOf(tokens.density);
  if (densityIndex < DENSITIES.length - 1) {
    const next = DENSITIES[densityIndex + 1] ?? "dense";
    return {
      kind: "edit",
      step: "density",
      description: `Tightened spacing to ${next}`,
      edit: { target: "spec", ops: [{ op: "replace", path: "/tokens/density", value: next }] },
    };
  }

  // 2. Body font scale, never below the print floor.
  const minScale = Math.max(0.8, MIN_BODY_PT_PRINT / BODY_PT[tokens.density]);
  const nextScale = Math.round((tokens.bodyScale - BODY_SCALE_STEP) * 100) / 100;
  if (nextScale >= minScale - 0.001) {
    return {
      kind: "edit",
      step: "font_scale",
      description: `Reduced body text to ${Math.round(nextScale * 100)}%`,
      edit: { target: "spec", ops: [{ op: "replace", path: "/tokens/bodyScale", value: Math.max(nextScale, round2(minScale)) }] },
    };
  }

  // 3. Rebalance columns on overflowing pages.
  const columns = pageColumns(spec.archetype, spec.format, spec.orientation);
  if (columns > 1 && spec.archetype !== "editorial") {
    const ops: JsonPatchOp[] = [];
    for (const measure of over) {
      const pageIndex = spec.pages.findIndex((p) => p.id === measure.pageId);
      const page = spec.pages[pageIndex];
      if (!page) continue;
      const flowBlocks = orderBlocks(page.blocks).filter((b) => b.gridArea.colSpan < columns);
      if (flowBlocks.length < 2) continue;
      const heights = new Map(measure.blocks.map((b) => [b.blockId, b.heightMm]));
      const currentColumns = new Array<number>(columns).fill(0);
      for (const b of measure.blocks) if (b.column >= 0) currentColumns[b.column] = (currentColumns[b.column] ?? 0) + b.heightMm + COLUMN_GAP_MM;
      const balanced = balanceColumns(flowBlocks.map((b) => ({ id: b.id, heightMm: heights.get(b.id) ?? 0 })), columns, COLUMN_GAP_MM);
      if (tallestColumn(balanced.columnHeightsMm) >= tallestColumn(currentColumns) - 1) continue;
      const nextRow = new Array<number>(columns).fill(Math.min(...flowBlocks.map((b) => b.gridArea.row)));
      for (const block of flowBlocks) {
        const col = balanced.assignments[block.id] ?? 0;
        const row = nextRow[col] ?? 1;
        nextRow[col] = row + 1;
        if (block.gridArea.col !== col + 1 || block.gridArea.row !== row) {
          const blockIndex = page.blocks.findIndex((b) => b.id === block.id);
          ops.push({ op: "test", path: `/pages/${pageIndex}/blocks/${blockIndex}/id`, value: block.id });
          ops.push({ op: "replace", path: `/pages/${pageIndex}/blocks/${blockIndex}/gridArea`, value: { ...block.gridArea, col: col + 1, row } });
        }
      }
    }
    if (ops.length) {
      return { kind: "edit", step: "rebalance", description: "Rebalanced columns by measured height", edit: { target: "spec", ops } };
    }
  }

  // 4. Add a page, if the format and preference allow it.
  const maxPages = maxPagesFor(spec, options.pageCountPreference);
  const first = over[0];
  if (!first) return { kind: "fits" };
  if (spec.pages.length >= maxPages) {
    const overflow = round(Math.max(...over.map((m) => m.usedMm - m.availableMm)));
    return {
      kind: "stuck",
      message: `Content is ${overflow} mm taller than the page and ${FORMATS[spec.format].label} allows ${maxPages} page${maxPages === 1 ? "" : "s"}. Remove items, shorten descriptions or choose a larger format.`,
    };
  }
  return addPageEdit(spec, first, columns, ids);
}

function round2(n: number): number {
  return Math.ceil(n * 100) / 100;
}

function addPageEdit(spec: LayoutSpec, measure: PageMeasure, columns: number, ids: (prefix: IdPrefix) => string): PlanResult {
  const pageIndex = spec.pages.findIndex((p) => p.id === measure.pageId);
  const page = spec.pages[pageIndex];
  if (!page) return { kind: "stuck", message: "Overflowing page not found" };
  const limit = measure.availableMm * (1 - HEADROOM);
  const byId = new Map(measure.blocks.map((b) => [b.blockId, b]));
  const ordered = orderBlocks(page.blocks);

  const moving = ordered.filter((b) => {
    const m = byId.get(b.id);
    return m ? m.topMm + m.heightMm > limit : false;
  });
  // Trailing full-width blocks (legend, notes, footer) travel with the overflow.
  const lastFlowIndex = Math.max(-1, ...moving.map((b) => ordered.indexOf(b)));
  for (const b of ordered.slice(lastFlowIndex + 1)) {
    if (!moving.includes(b) && ["legend", "note", "footer"].includes(b.type)) moving.push(b);
  }
  if (!moving.length) return { kind: "stuck", message: "Could not find content to move to a new page" };

  const ops: JsonPatchOp[] = [];
  const newBlocks: Block[] = [];
  const onlyContent = ordered.filter((b) => !["header", "legend", "note", "footer", "divider"].includes(b.type));

  // A single section taller than the page: split it with itemSlice instead of moving it whole.
  if (moving.length && onlyContent.length === 1 && onlyContent[0] && moving.includes(onlyContent[0]) && onlyContent[0].type === "section") {
    const block = onlyContent[0];
    const m = byId.get(block.id);
    if (m && m.heightMm > 0) {
      const available = Math.max(0, limit - m.topMm);
      const total = block.itemSlice ? block.itemSlice.end - block.itemSlice.start : 999;
      const start = block.itemSlice?.start ?? 0;
      const fraction = available / m.heightMm;
      const keep = Math.max(1, Math.floor(Math.min(total, 60) * fraction * 0.95));
      const blockIndex = page.blocks.indexOf(block);
      ops.push({ op: "test", path: `/pages/${pageIndex}/blocks/${blockIndex}/id`, value: block.id });
      ops.push({ op: "add", path: `/pages/${pageIndex}/blocks/${blockIndex}/itemSlice`, value: { start, end: start + keep } });
      newBlocks.push({
        ...block,
        id: ids("blk"),
        itemSlice: { start: start + keep, end: block.itemSlice?.end ?? 200 },
        gridArea: { col: 1, row: 1, colSpan: block.gridArea.colSpan, rowSpan: 1 },
      });
    }
  }

  const blocksToMove = newBlocks.length ? moving.filter((b) => b.type !== "section") : moving;
  const rowByCol = new Array<number>(columns).fill(1);
  let fullRow = newBlocks.length ? 2 : 1;
  for (const block of orderBlocks(blocksToMove)) {
    const full = block.gridArea.colSpan >= columns;
    const col = full ? 1 : block.gridArea.col;
    const row = full ? Math.max(fullRow, ...rowByCol) : Math.max(rowByCol[col - 1] ?? 1, fullRow);
    if (full) {
      fullRow = row + 1;
      rowByCol.fill(row + 1);
    } else rowByCol[col - 1] = row + 1;
    newBlocks.push({ ...block, gridArea: { ...block.gridArea, col, row } });
  }

  const removeIndexes = blocksToMove.map((b) => page.blocks.indexOf(b)).sort((a, b) => b - a);
  for (const index of removeIndexes) {
    const block = page.blocks[index];
    if (!block) continue;
    ops.push({ op: "test", path: `/pages/${pageIndex}/blocks/${index}/id`, value: block.id });
    ops.push({ op: "remove", path: `/pages/${pageIndex}/blocks/${index}` });
  }
  ops.push({ op: "add", path: `/pages/${pageIndex + 1}`, value: { id: ids("pg"), blocks: newBlocks } });
  return {
    kind: "edit",
    step: "add_page",
    description: `Moved ${newBlocks.length} block${newBlocks.length === 1 ? "" : "s"} to a new page`,
    edit: { target: "spec", ops },
  };
}
