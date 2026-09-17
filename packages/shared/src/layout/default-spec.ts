import { pageColumns } from "../archetypes.ts";
import { FORMATS, pageSizeMm, ptToMm, resolveOrientation, type FormatId } from "../formats.ts";
import { shortId, type IdPrefix } from "../ids.ts";
import { confirmedAllergens, confirmedDietaryTags, drinkItems, isDrink } from "../menu-helpers.ts";
import type { Orientation } from "../schemas/common.ts";
import type { PageCountPreference } from "../schemas/design-brief.ts";
import type { ArchetypeId, Block, Density, JourneyConfig, LayoutSpec, MatrixConfig, Page, Tokens } from "../schemas/layout-spec.ts";
import type { MenuDocument, MenuSection } from "../schemas/menu-document.ts";
import { estimateFlavor } from "./flavor.ts";

export type IdFactory = (prefix: IdPrefix) => string;

export const DEFAULT_TOKENS: Tokens = {
  fontPairingId: "modern-serif",
  paletteId: "washi",
  ornamentStyle: "hairline",
  density: "balanced",
  iconSet: "dietary_only",
  pricePlacement: "right_aligned",
  priceStyle: "no_decimals",
  textCase: "as_written",
  backgroundTexture: "none",
  bodyScale: 1,
};

/** Base body size in points for each density (before bodyScale). Shared with the renderer. */
export const BODY_PT: Record<Density, number> = { airy: 10.5, balanced: 9.75, dense: 9 };
export const MIN_BODY_PT_PRINT = 8.5;
export const MIN_BODY_PX_MOBILE = 14;
/** Padding between the safe zone and content, mm. */
export const CONTENT_INSET_MM = 4;
export const COLUMN_GAP_MM = 8;

export interface DefaultSpecInput {
  archetype: ArchetypeId;
  document: MenuDocument;
  format: FormatId;
  orientation: Orientation;
  tokens?: Partial<Tokens>;
  conceptName?: string;
  rationale?: string;
  pageCountPreference?: PageCountPreference;
  ids?: IdFactory;
  specId?: string;
}

export function contentBoxMm(format: FormatId, orientation: Orientation): { width: number; height: number } {
  const page = pageSizeMm(format, orientation);
  const inset = FORMATS[format].safeMm + CONTENT_INSET_MM;
  return { width: page.width - inset * 2, height: page.height - inset * 2 };
}

/** Rough height estimate used only to pre-distribute content; the overflow engine measures. */
export function estimateSectionHeightMm(section: MenuSection, columnWidthMm: number, density: Density): number {
  const lineMm = ptToMm(BODY_PT[density] * 1.4);
  const charsPerLine = Math.max(18, Math.floor(columnWidthMm / ptToMm(BODY_PT[density] * 0.5)));
  const gap = density === "airy" ? 4 : density === "balanced" ? 3 : 2;
  let height = 16 + (section.subtitle ? lineMm : 0) + (section.description ? lineMm * 2 : 0);
  for (const item of section.items) {
    height += lineMm * 1.15 + gap;
    if (item.description) height += Math.ceil(item.description.length / charsPerLine) * lineMm;
    if (item.priceVariants.length > 1 && columnWidthMm < 120) height += lineMm;
  }
  return height;
}

interface Placement {
  pageIndex: number;
  block: Block;
}

export function buildDefaultSpec(input: DefaultSpecInput): LayoutSpec {
  const ids = input.ids ?? shortId;
  const { archetype, document, format } = input;
  const orientation = resolveOrientation(format, input.orientation);
  const tokens: Tokens = { ...DEFAULT_TOKENS, ...input.tokens };
  const formatSpec = FORMATS[format];
  const columns = pageColumns(archetype, format, orientation);
  const box = contentBoxMm(format, orientation);
  const columnWidth = (box.width - COLUMN_GAP_MM * (columns - 1)) / columns;
  const fixedPages = formatSpec.pages === "flow" ? null : formatSpec.pages;
  const preference = input.pageCountPreference ?? "fit_content";
  const maxPages = fixedPages ?? (preference === "single" ? 1 : preference === "fit_content" ? 24 : preference);

  const pages: Page[] = [{ id: ids("pg"), blocks: [] }];
  const colHeights: number[][] = [new Array<number>(columns).fill(0)];
  const colRows: number[][] = [new Array<number>(columns).fill(1)];

  const block = (type: Block["type"], extra: Partial<Block> = {}): Block => ({
    id: ids("blk"),
    type,
    gridArea: { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
    emphasis: "normal",
    ...extra,
  });

  const ensurePage = (index: number) => {
    while (pages.length <= index) {
      pages.push({ id: ids("pg"), blocks: [] });
      colHeights.push(new Array<number>(columns).fill(0));
      colRows.push(new Array<number>(columns).fill(1));
    }
  };

  const placeFullWidth = (pageIndex: number, b: Block, heightMm: number) => {
    ensurePage(pageIndex);
    const heights = colHeights[pageIndex] ?? [];
    const rows = colRows[pageIndex] ?? [];
    const row = Math.max(...rows);
    const top = Math.max(...heights);
    b.gridArea = { col: 1, row, colSpan: columns, rowSpan: 1 };
    pages[pageIndex]?.blocks.push(b);
    for (let c = 0; c < columns; c++) {
      heights[c] = top + heightMm;
      rows[c] = row + 1;
    }
  };

  let currentPage = 0;
  const placeFlow = (b: Block, heightMm: number, span = 1): Placement => {
    for (;;) {
      ensurePage(currentPage);
      const heights = colHeights[currentPage] ?? [];
      const rows = colRows[currentPage] ?? [];
      let best = 0;
      for (let c = 1; c <= columns - span; c++) {
        if ((heights[c] ?? 0) < (heights[best] ?? 0)) best = c;
      }
      const top = Math.max(...heights.slice(best, best + span));
      const pageHasContent = heights.some((h) => h > 0);
      const fits = top + heightMm <= box.height;
      if (!fits && pageHasContent && currentPage + 1 < maxPages && top > box.height * 0.25) {
        currentPage++;
        continue;
      }
      const row = Math.max(...rows.slice(best, best + span));
      b.gridArea = { col: best + 1, row, colSpan: span, rowSpan: 1 };
      pages[currentPage]?.blocks.push(b);
      for (let c = best; c < best + span; c++) {
        heights[c] = top + heightMm;
        rows[c] = row + 1;
      }
      return { pageIndex: currentPage, block: b };
    }
  };

  // Header always leads page one.
  placeFullWidth(0, block("header", { emphasis: archetype === "poster" ? "hero" : "high" }), archetype === "poster" ? 70 : 34);

  let matrix: MatrixConfig | undefined;
  let journey: JourneyConfig | undefined;

  const sections = document.sections.filter((s) => s.items.length > 0);

  switch (archetype) {
    case "flavor_matrix": {
      const drinks = drinkItems(document);
      matrix = {
        xAxis: { negLabel: "Sweet", posLabel: "Bitter" },
        yAxis: { negLabel: "Refreshing", posLabel: "Boozy" },
        placements: drinks.map((item) => {
          const f = estimateFlavor(item);
          return { itemId: item.id, x: f.sweetBitter, y: f.refreshingBoozy, locked: false, ai: { x: f.sweetBitter, y: f.refreshingBoozy } };
        }),
      };
      placeFullWidth(0, block("matrix", { emphasis: "hero" }), Math.min(box.height * 0.55, box.width * 0.9));
      for (const section of sections) {
        placeFlow(block("section", { sectionRef: section.id }), estimateSectionHeightMm(section, columnWidth, tokens.density));
      }
      break;
    }
    case "editorial": {
      const hero = document.sections.flatMap((s) => s.items).find((i) => i.isSignature || i.featured);
      let row = 2;
      if (hero) {
        const b = block("featuredItem", { itemRefs: [hero.id], emphasis: "hero" });
        b.gridArea = { col: 1, row, colSpan: 3, rowSpan: 1 };
        pages[0]?.blocks.push(b);
        row++;
      }
      let pageIndex = 0;
      let used = hero ? 34 + 60 : 34;
      sections.forEach((section, i) => {
        const wide = i % 3 === 0;
        const span = wide ? 2 : 1;
        const est = estimateSectionHeightMm(section, columnWidth * span, tokens.density);
        if (used + est > box.height * (wide ? 1 : 1.6) && used > box.height * 0.3 && pageIndex + 1 < maxPages) {
          pageIndex++;
          ensurePage(pageIndex);
          used = 0;
          row = 1;
        }
        const b = block("section", { sectionRef: section.id, emphasis: i === 0 ? "high" : "normal" });
        const col = wide ? (i % 2 === 0 ? 1 : 2) : i % 2 === 0 ? 3 : 1;
        b.gridArea = { col, row, colSpan: span, rowSpan: 1 };
        pages[pageIndex]?.blocks.push(b);
        if (!wide || col === 2) row++;
        used += wide ? est * 0.6 : est * 0.6;
      });
      currentPage = pageIndex;
      const heights = colHeights[pageIndex];
      const rows = colRows[pageIndex];
      if (heights && rows) {
        heights.fill(used);
        rows.fill(row + 1);
      }
      break;
    }
    case "by_base_spirit": {
      const groups = new Map<string, string[]>();
      for (const item of drinkItems(document)) {
        const spirit = item.attributes.baseSpirit?.trim().toLowerCase() || "other";
        groups.set(spirit, [...(groups.get(spirit) ?? []), item.id]);
      }
      const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
      for (const [, itemRefs] of ordered) {
        placeFlow(block("itemList", { itemRefs }), 16 + itemRefs.length * 11);
      }
      for (const section of sections.filter((s) => !s.items.every(isDrink))) {
        placeFlow(block("section", { sectionRef: section.id }), estimateSectionHeightMm(section, columnWidth, tokens.density));
      }
      break;
    }
    case "tasting_journey": {
      const steps = sections.slice(0, 8).map((s) => ({ label: s.title.slice(0, 40), itemRefs: s.items.slice(0, 12).map((i) => i.id) }));
      if (steps.length === 1 && steps[0]) {
        const items = steps[0].itemRefs;
        const chunks = Math.min(8, Math.max(2, Math.ceil(items.length / 3)));
        journey = {
          orientation: orientation === "landscape" ? "horizontal" : "vertical",
          steps: Array.from({ length: chunks }, (_, i) => ({
            label: `Course ${i + 1}`,
            itemRefs: items.slice(Math.floor((i * items.length) / chunks), Math.floor(((i + 1) * items.length) / chunks)),
          })).filter((s) => s.itemRefs.length > 0),
        };
      } else {
        journey = { orientation: orientation === "landscape" ? "horizontal" : "vertical", steps };
      }
      break;
    }
    default: {
      sections.forEach((section, i) => {
        if (archetype === "classic_list" && i > 0 && tokens.ornamentStyle !== "none") {
          placeFlow(block("divider"), 6);
        }
        placeFlow(block("section", { sectionRef: section.id }), estimateSectionHeightMm(section, columnWidth, tokens.density));
      });
    }
  }

  const lastPage = Math.max(currentPage, pages.length - 1);
  const items = document.sections.flatMap((s) => s.items);
  const hasMarks = items.some((i) => confirmedDietaryTags(i).length > 0);
  if (hasMarks && tokens.iconSet !== "none") placeFullWidth(lastPage, block("legend"), 10);
  if (document.taxNote) placeFullWidth(lastPage, block("note", { noteRef: "taxNote" }), 7);
  if (items.some((i) => confirmedAllergens(i).length > 0)) {
    placeFullWidth(lastPage, block("note", { noteRef: "allergenDisclaimer" }), 7);
  }
  placeFullWidth(lastPage, block("footer"), 12);

  const spec: LayoutSpec = {
    schemaVersion: 1,
    id: input.specId ?? `spc_${ids("blk").slice(4)}`,
    format,
    orientation,
    archetype,
    tokens,
    pages: fixedPages ? padPages(pages, fixedPages, ids) : pages.filter((p) => p.blocks.length > 0),
    conceptName: input.conceptName ?? defaultConceptName(archetype),
    rationale: input.rationale ?? "A clean starting layout built from your menu content.",
    engineeringApplied: false,
  };
  if (matrix) spec.matrix = matrix;
  if (journey) spec.journey = journey;
  return spec;
}

function padPages(pages: Page[], count: number, ids: IdFactory): Page[] {
  const out = pages.slice(0, count);
  while (out.length < count) out.push({ id: ids("pg"), blocks: [] });
  return out;
}

function defaultConceptName(archetype: ArchetypeId): string {
  const names: Record<ArchetypeId, string> = {
    classic_list: "Quiet Classic",
    two_column: "Balanced Columns",
    flavor_matrix: "Flavor Map",
    editorial: "The Feature",
    by_base_spirit: "Spirit Library",
    tasting_journey: "The Journey",
    poster: "Statement Poster",
    chalkboard: "Chalk Board",
    grid_cards: "Card Table",
    mobile_stack: "Pocket Menu",
  };
  return names[archetype];
}

/** Deterministic id factory for seeds and snapshot tests. */
export function sequentialIds(tag: string): IdFactory {
  const counters: Record<string, number> = {};
  return (prefix) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const n = String(counters[prefix]);
    return `${prefix}_${tag}${n.padStart(8 - tag.length, "0")}`;
  };
}
