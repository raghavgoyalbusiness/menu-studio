import { ARCHETYPE_IDS, archetypeEligibility, buildDefaultSpec, sequentialIds, type LayoutSpec } from "@menu-studio/shared";
import { SEED_IDS, SEEDS } from "@menu-studio/shared/seeds";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MenuRenderer } from "./MenuRenderer.tsx";
import { balanceColumns } from "./overflow/balance.ts";
import { planFit, type PageMeasure } from "./overflow/plan.ts";
import { countOverlaps, resolveCollisions } from "./matrix/collide.ts";
import { pageGeometry } from "./geometry.ts";
import { toBands } from "./layout/flow.ts";

const FORMAT_FOR = { mobile_stack: "MOBILE", chalkboard: "CHALKBOARD_WIDE" } as const;

function specFor(archetype: (typeof ARCHETYPE_IDS)[number], seedId: (typeof SEED_IDS)[number]): LayoutSpec | null {
  const seed = SEEDS[seedId];
  const format = archetype in FORMAT_FOR ? FORMAT_FOR[archetype as keyof typeof FORMAT_FOR] : "A4";
  if (!archetypeEligibility(archetype, seed.document, format).eligible) return null;
  return buildDefaultSpec({ archetype, document: seed.document, format, orientation: "portrait", ids: sequentialIds("sn") });
}

describe("renderer snapshots", () => {
  for (const archetype of ARCHETYPE_IDS) {
    for (const seedId of SEED_IDS) {
      const spec = specFor(archetype, seedId);
      if (!spec) continue;
      it(`${archetype} × ${seedId}`, () => {
        const html = renderToStaticMarkup(<MenuRenderer document={SEEDS[seedId].document} spec={spec} mode="print" />);
        expect(html).toMatchSnapshot();
      });
    }
  }

  it("is deterministic", () => {
    const seed = SEEDS["restaurant-delhi"];
    const a = renderToStaticMarkup(<MenuRenderer document={seed.document} spec={seed.spec} mode="print" />);
    const b = renderToStaticMarkup(<MenuRenderer document={seed.document} spec={seed.spec} mode="print" />);
    expect(a).toBe(b);
  });

  it("renders translations and RTL direction", () => {
    const seed = SEEDS["restaurant-delhi"];
    const hi = renderToStaticMarkup(<MenuRenderer document={seed.document} spec={seed.spec} mode="print" lang="hi" />);
    expect(hi).toContain("दाल मखनी");
    expect(hi).toContain('dir="ltr"');
    const ar = renderToStaticMarkup(<MenuRenderer document={{ ...seed.document, additionalLanguages: ["ar"] }} spec={seed.spec} mode="print" lang="ar" />);
    expect(ar).toContain('dir="rtl"');
  });

  it("keeps inferred dietary tags out of the output until confirmed", () => {
    const seed = SEEDS["restaurant-delhi"];
    const document = structuredClone(seed.document);
    const item = document.sections[0]?.items[0];
    if (!item) throw new Error("fixture");
    item.inferredFields = ["dietaryTags"];
    const html = renderToStaticMarkup(<MenuRenderer document={document} spec={seed.spec} mode="print" />);
    const itemHtml = html.split('data-ms-item="itm_hr000001"')[1]?.split("data-ms-item=")[0] ?? "";
    expect(itemHtml).not.toContain("ms-mark--veg");
  });

  it("renders the watermark only when asked", () => {
    const seed = SEEDS["bistro-paris"];
    expect(renderToStaticMarkup(<MenuRenderer document={seed.document} spec={seed.spec} mode="print" />)).not.toContain("Made with Menu Studio");
    expect(renderToStaticMarkup(<MenuRenderer document={seed.document} spec={seed.spec} mode="print" watermark />)).toContain("Made with Menu Studio");
  });

  it("hides 86'd items on QR but keeps them in print", () => {
    const seed = SEEDS["cafe-bangalore"];
    const document = structuredClone(seed.document);
    const cookie = document.sections[3]?.items[4];
    if (!cookie) throw new Error("fixture");
    cookie.available = false;
    const spec = buildDefaultSpec({ archetype: "mobile_stack", document, format: "MOBILE", orientation: "portrait" });
    expect(renderToStaticMarkup(<MenuRenderer document={document} spec={spec} mode="qr" />)).not.toContain("Chocolate Chip Cookie");
    expect(renderToStaticMarkup(<MenuRenderer document={document} spec={seed.spec} mode="print" />)).toContain("Chocolate Chip Cookie");
  });
});

describe("page geometry", () => {
  it("A4 print page with bleed is 216 × 303 mm and crop marks add a slug", () => {
    const spec = { format: "A4" as const, orientation: "portrait" as const };
    expect(pageGeometry(spec, "print").sheet).toEqual({ width: 216, height: 303 });
    expect(pageGeometry(spec, "print", true).sheet).toEqual({ width: 236, height: 323 });
    expect(pageGeometry(spec, "png").sheet).toEqual({ width: 210, height: 297 });
  });
});

describe("flow bands", () => {
  it("groups column blocks between full-width bands", () => {
    const spec = SEEDS["restaurant-delhi"].spec;
    const bands = toBands(spec.pages[0]?.blocks ?? [], 2);
    expect(bands[0]?.kind).toBe("full");
    expect(bands.some((b) => b.kind === "columns" && b.columns.every((c) => c.length > 0))).toBe(true);
  });
});

describe("column balancing", () => {
  it("assigns to the shortest column, deterministic and order-preserving", () => {
    const result = balanceColumns(
      [
        { id: "a", heightMm: 80 },
        { id: "b", heightMm: 30 },
        { id: "c", heightMm: 40 },
        { id: "d", heightMm: 20 },
      ],
      2,
    );
    expect(result.assignments).toEqual({ a: 0, b: 1, c: 1, d: 1 });
    expect(result.columnHeightsMm).toEqual([80, 90]);
  });
});

describe("overflow planning", () => {
  const seed = SEEDS["restaurant-delhi"];
  const measure = (usedMm: number): PageMeasure[] =>
    seed.spec.pages.map((p) => ({
      pageId: p.id,
      availableMm: 270,
      usedMm,
      blocks: p.blocks.map((b, i) => ({ blockId: b.id, topMm: i * 30, heightMm: 30, column: b.gridArea.colSpan > 1 ? -1 : b.gridArea.col - 1 })),
    }));

  it("fits when content is within headroom", () => {
    expect(planFit(seed.spec, measure(200), { pageCountPreference: "fit_content" }).kind).toBe("fits");
  });

  it("tightens density first, then scales type, never below the print floor", () => {
    const first = planFit(seed.spec, measure(300), { pageCountPreference: "fit_content" });
    expect(first.kind === "edit" && first.step).toBe("density");
    const dense = { ...seed.spec, tokens: { ...seed.spec.tokens, density: "dense" as const } };
    const second = planFit(dense, measure(300), { pageCountPreference: "fit_content" });
    expect(second.kind === "edit" && second.step).toBe("font_scale");
    const floor = { ...dense, tokens: { ...dense.tokens, bodyScale: 0.95 } };
    const third = planFit(floor, measure(300), { pageCountPreference: "fit_content" });
    expect(third.kind === "edit" && third.step).not.toBe("font_scale");
  });

  it("adds a page only when the preference allows, else reports stuck", () => {
    const tight = { ...seed.spec, tokens: { ...seed.spec.tokens, density: "dense" as const, bodyScale: 0.95 } };
    const single = planFit(tight, measure(400), { pageCountPreference: "single", ids: sequentialIds("pl") });
    expect(single.kind === "stuck" || (single.kind === "edit" && single.step === "rebalance")).toBe(true);
  });
});

describe("matrix collision avoidance", () => {
  const sizes = new Map<string, { width: number; height: number }>();
  const labels = Array.from({ length: 12 }, (_, i) => {
    const id = `itm_${String(i).padStart(8, "0")}`;
    sizes.set(id, { width: 26, height: 12 });
    return { id, anchorX: 80 + (i % 3), anchorY: 70 + (i % 2), width: 26, height: 12, locked: false };
  });

  it("separates a tight cluster of 12 labels without overlaps", () => {
    const resolved = resolveCollisions(labels, { plotWidth: 170, plotHeight: 136, minSpacingMm: 8, paddingMm: 1, maxIterations: 50 });
    expect(countOverlaps(resolved, sizes)).toBe(0);
    for (const r of resolved) {
      expect(r.x).toBeGreaterThanOrEqual(13 - 0.01);
      expect(r.x).toBeLessThanOrEqual(170 - 13 + 0.01);
    }
  });

  it("never moves locked labels and is deterministic", () => {
    const locked = labels.map((l, i) => (i === 0 ? { ...l, locked: true } : l));
    const opts = { plotWidth: 170, plotHeight: 136, minSpacingMm: 8, paddingMm: 1, maxIterations: 50 };
    const a = resolveCollisions(locked, opts);
    const b = resolveCollisions([...locked].reverse(), opts);
    expect(a).toEqual(b);
    const first = a.find((r) => r.id === locked[0]?.id);
    expect(first?.x).toBe(locked[0]?.anchorX);
    expect(first?.y).toBe(locked[0]?.anchorY);
  });
});
