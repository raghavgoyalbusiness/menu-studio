import { FORMATS, pageSizeMm, type FormatId } from "./formats.ts";
import { allItems, drinkItems } from "./menu-helpers.ts";
import type { Orientation } from "./schemas/common.ts";
import type { MenuDocument } from "./schemas/menu-document.ts";
import type { ArchetypeId } from "./schemas/layout-spec.ts";

export interface ArchetypeMeta {
  id: ArchetypeId;
  label: string;
  /** One-line description shown to owners and given to the concepts prompt. */
  summary: string;
  /** Documented layout rules, mirrored by the renderer component. */
  rules: readonly string[];
  formats: readonly FormatId[];
  /** Hard item ceiling before the archetype stops being offered. */
  maxItems?: number;
}

const PRINT_SHEETS: FormatId[] = ["A4", "A3", "A5", "US_LETTER", "US_LEGAL", "POSTER_A2"];

export const ARCHETYPES: Record<ArchetypeId, ArchetypeMeta> = {
  classic_list: {
    id: "classic_list",
    label: "Classic list",
    summary: "Single column, sections stacked top to bottom, optional dot leaders to the price.",
    rules: ["One column per panel", "Sections stack in order", "Dot leaders when priceStyle is dot_leaders"],
    formats: [...PRINT_SHEETS, "DL_TRIFOLD", "BIFOLD_A4", "TABLE_TENT", "CHALKBOARD_WIDE"],
  },
  two_column: {
    id: "two_column",
    label: "Two column",
    summary: "Two columns with sections balanced by measured height.",
    rules: ["Two columns", "Sections balanced across columns by measured height (greedy)", "Header and footer span both columns"],
    formats: ["A4", "A3", "A5", "US_LETTER", "US_LEGAL", "POSTER_A2", "BIFOLD_A4", "CHALKBOARD_WIDE"],
  },
  flavor_matrix: {
    id: "flavor_matrix",
    label: "Flavor matrix",
    summary: "Drinks plotted on a sweet↔bitter × refreshing↔boozy grid, with glassware icons.",
    rules: [
      "2×2 quadrant grid with axis labels on the edges",
      "Items placed by x/y in -1..1",
      "Glassware icon above each name",
      "Labels never overlap (iterative nudge, max 50 iterations, 8 mm minimum spacing)",
      "Locked placements never move",
    ],
    formats: ["A4", "A3", "US_LETTER", "US_LEGAL", "POSTER_A2", "BIFOLD_A4", "CHALKBOARD_WIDE"],
  },
  editorial: {
    id: "editorial",
    label: "Editorial",
    summary: "Magazine layout: a large hero, pull-quote descriptions and an asymmetric grid.",
    rules: ["Three-column asymmetric grid", "One hero feature", "Descriptions set as pull quotes"],
    formats: ["A4", "A3", "US_LETTER", "US_LEGAL", "POSTER_A2", "BIFOLD_A4"],
  },
  by_base_spirit: {
    id: "by_base_spirit",
    label: "By base spirit",
    summary: "Drinks grouped under their base spirit (gin, whisky, rum…), food listed after.",
    rules: ["Drinks auto-grouped by attributes.baseSpirit", "Groups ordered by size", "Non-drink sections follow"],
    formats: ["A4", "A3", "A5", "US_LETTER", "US_LEGAL", "POSTER_A2", "BIFOLD_A4", "DL_TRIFOLD"],
  },
  tasting_journey: {
    id: "tasting_journey",
    label: "Tasting journey",
    summary: "A step-by-step sequence with connectors, for tasting menus and flights.",
    rules: ["Steps in order with connectors", "Vertical on portrait pages, horizontal on landscape"],
    formats: [...PRINT_SHEETS, "BIFOLD_A4", "TABLE_TENT"],
    maxItems: 40,
  },
  poster: {
    id: "poster",
    label: "Poster",
    summary: "Single page with hero typography and a short list.",
    rules: ["One page", "Hero venue name", "Warns above 15 items"],
    formats: ["POSTER_A2", "A3", "A4", "US_LETTER", "TABLE_TENT", "CHALKBOARD_WIDE"],
    maxItems: 15,
  },
  chalkboard: {
    id: "chalkboard",
    label: "Chalkboard",
    summary: "Dark textured board with handwritten type, for wide formats.",
    rules: ["Dark background with chalk texture", "Handwritten pairing", "Columns by width"],
    formats: ["CHALKBOARD_WIDE", "POSTER_A2", "A3", "A4"],
  },
  grid_cards: {
    id: "grid_cards",
    label: "Grid cards",
    summary: "A card per item in a grid, good for cafes and bakeries with short lists.",
    rules: ["Section headings span the page", "Items as cards in an even grid", "Card count per row from page width"],
    formats: ["A4", "A3", "US_LETTER", "US_LEGAL", "POSTER_A2", "BIFOLD_A4", "CHALKBOARD_WIDE"],
    maxItems: 48,
  },
  mobile_stack: {
    id: "mobile_stack",
    label: "Mobile stack",
    summary: "Phone layout with sticky section tabs and collapsible sections, for QR menus.",
    rules: ["Single column", "Sticky section navigation", "Collapsible sections"],
    formats: ["MOBILE"],
  },
};

export interface Eligibility {
  eligible: boolean;
  reason?: string;
}

function drinksWithFlavorSignal(document: MenuDocument): number {
  return drinkItems(document).filter((i) => i.attributes.flavor || i.ingredients.length >= 2).length;
}

export function archetypeEligibility(id: ArchetypeId, document: MenuDocument, format: FormatId): Eligibility {
  const meta = ARCHETYPES[id];
  if (!meta.formats.includes(format)) {
    return { eligible: false, reason: `${meta.label} does not support ${FORMATS[format].label}` };
  }
  const itemCount = allItems(document).filter((i) => i.available).length;
  if (meta.maxItems !== undefined && itemCount > meta.maxItems) {
    return { eligible: false, reason: `${meta.label} suits ${meta.maxItems} items or fewer (menu has ${itemCount})` };
  }
  switch (id) {
    case "flavor_matrix": {
      const n = drinksWithFlavorSignal(document);
      return n >= 6
        ? { eligible: true }
        : { eligible: false, reason: `Needs 6 or more drinks with flavor data or ingredients (found ${n})` };
    }
    case "by_base_spirit": {
      const spirits = drinkItems(document).filter((i) => i.attributes.baseSpirit);
      const distinct = new Set(spirits.map((i) => i.attributes.baseSpirit?.toLowerCase()));
      return spirits.length >= 6 && distinct.size >= 2
        ? { eligible: true }
        : { eligible: false, reason: "Needs 6 or more drinks across at least 2 base spirits" };
    }
    case "tasting_journey":
      return itemCount >= 3 ? { eligible: true } : { eligible: false, reason: "Needs at least 3 items" };
    case "grid_cards":
      return document.venueType === "cafe" || document.venueType === "bakery" || itemCount <= 30
        ? { eligible: true }
        : { eligible: false, reason: "Grid cards suit cafes, bakeries or menus of 30 items or fewer" };
    default:
      return { eligible: true };
  }
}

export function eligibleArchetypes(document: MenuDocument, format: FormatId, implemented: readonly ArchetypeId[]): ArchetypeId[] {
  return implemented.filter((id) => archetypeEligibility(id, document, format).eligible);
}

/** Column count a page grid uses for an archetype. */
export function pageColumns(archetype: ArchetypeId, format: FormatId, orientation: Orientation): number {
  const { width } = pageSizeMm(format, orientation);
  const panels = FORMATS[format].panelsMm?.length;
  switch (archetype) {
    case "classic_list":
      return panels ?? (width >= 400 ? 2 : 1);
    case "two_column":
    case "by_base_spirit":
      return panels && panels > 2 ? panels : width >= 400 ? 4 : width >= 170 ? 2 : 1;
    case "chalkboard":
      return width >= 500 ? 3 : width >= 280 ? 2 : 1;
    case "editorial":
      return 3;
    case "flavor_matrix":
      return width >= 400 ? 4 : 2;
    case "grid_cards":
    case "poster":
    case "tasting_journey":
    case "mobile_stack":
      return 1;
  }
}
