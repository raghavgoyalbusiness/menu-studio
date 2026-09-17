import type { MenuDocument, Quadrant } from "../schemas/menu-document.ts";
import { allItems } from "../menu-helpers.ts";

export interface QuadrantResult {
  itemId: string;
  name: string;
  contributionMargin: number;
  marginTier: "high" | "mid" | "low";
  popularity: "high" | "low";
  quadrant: Quadrant;
}

export interface QuadrantAnalysis {
  results: QuadrantResult[];
  /** Items that could not be classified, with the missing input. */
  skipped: { itemId: string; name: string; reason: string }[];
  averageMargin: number;
  method: "sales_mix" | "owner_popularity";
}

/**
 * Deterministic menu-engineering classification (Kasavana & Smith).
 *
 * - Contribution margin = price − cost (integer minor units).
 * - Margin is "high" when it is at or above the average margin of classified items
 *   (weighted by units sold when sales data exists).
 * - With sales data for every classified item, popularity is "high" when an item's share
 *   of units is at least 70% of an equal share (0.7 / n). Otherwise the owner's
 *   popularity rating is used.
 * - marginTier adds a middle band: within ±15% of the average margin is "mid".
 */
export function computeQuadrants(document: MenuDocument): QuadrantAnalysis {
  const candidates: { itemId: string; name: string; cm: number; units?: number; popularity?: "high" | "low" }[] = [];
  const skipped: QuadrantAnalysis["skipped"] = [];

  for (const item of allItems(document)) {
    const eng = item.engineering;
    if (item.price === null) {
      skipped.push({ itemId: item.id, name: item.name, reason: "no price" });
      continue;
    }
    if (eng?.costPrice === undefined) {
      skipped.push({ itemId: item.id, name: item.name, reason: "no cost price" });
      continue;
    }
    if (eng.unitsSold === undefined && eng.popularity === undefined) {
      skipped.push({ itemId: item.id, name: item.name, reason: "no popularity or sales count" });
      continue;
    }
    const candidate: (typeof candidates)[number] = { itemId: item.id, name: item.name, cm: item.price - eng.costPrice };
    if (eng.unitsSold !== undefined) candidate.units = eng.unitsSold;
    if (eng.popularity !== undefined) candidate.popularity = eng.popularity;
    candidates.push(candidate);
  }

  if (!candidates.length) return { results: [], skipped, averageMargin: 0, method: "owner_popularity" };

  const salesMix = candidates.every((c) => c.units !== undefined);
  const totalUnits = salesMix ? candidates.reduce((n, c) => n + (c.units ?? 0), 0) : 0;
  const useSales = salesMix && totalUnits > 0;
  const averageMargin = useSales
    ? candidates.reduce((n, c) => n + c.cm * (c.units ?? 0), 0) / totalUnits
    : candidates.reduce((n, c) => n + c.cm, 0) / candidates.length;
  const popularityThreshold = 0.7 / candidates.length;

  const results = candidates.map((c): QuadrantResult => {
    const popularity: "high" | "low" = useSales
      ? (c.units ?? 0) / totalUnits >= popularityThreshold
        ? "high"
        : "low"
      : (c.popularity ?? "low");
    const highMargin = c.cm >= averageMargin;
    const marginTier = c.cm >= averageMargin * 1.15 ? "high" : c.cm <= averageMargin * 0.85 ? "low" : "mid";
    const quadrant: Quadrant = highMargin ? (popularity === "high" ? "star" : "puzzle") : popularity === "high" ? "plowhorse" : "dog";
    return { itemId: c.itemId, name: c.name, contributionMargin: c.cm, marginTier, popularity, quadrant };
  });

  return { results, skipped, averageMargin, method: useSales ? "sales_mix" : "owner_popularity" };
}

/** Parse a CSV of `item name or id, cost price, units sold or popularity`. RFC 4180 quoting. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}
