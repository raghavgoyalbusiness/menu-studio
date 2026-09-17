import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_IDS,
  applyEdits,
  archetypeEligibility,
  buildDefaultSpec,
  canCreateVenue,
  canUseAiEdit,
  computeQuadrants,
  conceptSetIssues,
  contentFieldsChanged,
  defaultBrief,
  DesignBrief,
  engineeringEditViolations,
  estimateFlavor,
  formatMoney,
  FORMATS,
  inverseEdit,
  isAvailableAt,
  LayoutSpec,
  limitSentences,
  MenuDocument,
  pageSizeMm,
  parseCsv,
  parseMoney,
  sequentialIds,
  signPrintToken,
  verifyPrintToken,
  type Edit,
} from "./index.ts";
import { SEED_IDS, SEEDS } from "./seeds/index.ts";

describe("seeds", () => {
  it.each(SEED_IDS)("%s document, brief and spec validate", (id) => {
    const seed = SEEDS[id];
    expect(MenuDocument.safeParse(seed.document).error?.issues ?? []).toEqual([]);
    expect(DesignBrief.safeParse(seed.brief).error?.issues ?? []).toEqual([]);
    expect(LayoutSpec.safeParse(seed.spec).error?.issues ?? []).toEqual([]);
  });

  it("gives the cocktail bar 12 signature cocktails including Genko", () => {
    const signatures = SEEDS["cocktail-bar-london"].document.sections[0];
    expect(signatures?.items).toHaveLength(12);
    expect(signatures?.items.some((i) => i.name === "Genko")).toBe(true);
    expect(signatures?.items.every((i) => i.attributes.glassware && i.attributes.colorHex && i.attributes.baseSpirit)).toBe(true);
  });

  it("builds deterministic seed specs", () => {
    const a = buildDefaultSpec({ archetype: "two_column", document: SEEDS["restaurant-delhi"].document, format: "A4", orientation: "portrait", ids: sequentialIds("zz") });
    const b = buildDefaultSpec({ archetype: "two_column", document: SEEDS["restaurant-delhi"].document, format: "A4", orientation: "portrait", ids: sequentialIds("zz") });
    expect(a).toEqual(b);
  });
});

describe("default specs", () => {
  const formatsFor = { mobile_stack: "MOBILE", chalkboard: "CHALKBOARD_WIDE" } as const;
  it.each(ARCHETYPE_IDS)("%s builds a valid spec for every seed where eligible", (archetype) => {
    for (const id of SEED_IDS) {
      const seed = SEEDS[id];
      const format = archetype in formatsFor ? formatsFor[archetype as keyof typeof formatsFor] : "A4";
      if (!archetypeEligibility(archetype, seed.document, format).eligible) continue;
      const spec = buildDefaultSpec({ archetype, document: seed.document, format, orientation: "portrait" });
      const result = LayoutSpec.safeParse(spec);
      expect(result.error?.issues ?? [], `${archetype} × ${id}`).toEqual([]);
    }
  });

  it("offers flavor_matrix only with 6+ drinks", () => {
    expect(archetypeEligibility("flavor_matrix", SEEDS["cocktail-bar-london"].document, "A4").eligible).toBe(true);
    expect(archetypeEligibility("flavor_matrix", SEEDS["restaurant-delhi"].document, "A4").eligible).toBe(false);
  });

  it("offers poster only for 15 items or fewer", () => {
    expect(archetypeEligibility("poster", SEEDS["restaurant-delhi"].document, "A4").eligible).toBe(false);
  });
});

describe("formats", () => {
  it("swaps free-orientation formats and locks folded ones", () => {
    expect(pageSizeMm("A4", "portrait")).toEqual({ width: 210, height: 297 });
    expect(pageSizeMm("A4", "landscape")).toEqual({ width: 297, height: 210 });
    expect(pageSizeMm("DL_TRIFOLD", "portrait")).toEqual({ width: 297, height: 210 });
    expect(FORMATS.DL_TRIFOLD.panelsMm?.reduce((a, b) => a + b, 0)).toBe(297);
  });
});

describe("money", () => {
  it.each([
    ["£12.50", "GBP", 1250],
    ["12", "GBP", 1200],
    ["₹1,250", "INR", 125000],
    ["1,00,000", "INR", 10000000],
    ["12,50 €", "EUR", 1250],
    ["1.250,00", "EUR", 125000],
    ["1,250.75", "USD", 125075],
    ["¥1,200", "JPY", 1200],
    ["KD 1.250", "KWD", 1250],
    ["12.505", "GBP", null],
    ["MP", "GBP", null],
  ])("parses %s (%s) → %s", (input, currency, expected) => {
    expect(parseMoney(input, currency)).toBe(expected);
  });

  it("formats integer minor units without float division", () => {
    expect(formatMoney(1250, { locale: "en-GB", currency: "GBP", symbol: true, trimDecimals: false })).toBe("£12.50");
    expect(formatMoney(1200, { locale: "en-GB", currency: "GBP", symbol: true, trimDecimals: true })).toBe("£12");
    expect(formatMoney(1250, { locale: "en-GB", currency: "GBP", symbol: false, trimDecimals: true })).toBe("12.5");
    expect(formatMoney(12500000, { locale: "en-IN", currency: "INR", symbol: true, trimDecimals: true })).toBe("₹1,25,000");
    expect(formatMoney(1200, { locale: "en-US", currency: "JPY", symbol: true, trimDecimals: false })).toBe("¥1,200");
  });
});

describe("applyEdits", () => {
  const seed = SEEDS["bistro-paris"];
  const docs = { document: seed.document, spec: seed.spec };

  it("applies a content edit without touching the spec", () => {
    const edit: Edit = { target: "document", ops: [{ op: "replace", path: "/sections/1/items/0/name", value: "Soupe du Jour" }] };
    const result = applyEdits(docs, [edit]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.docs.document.sections[1]?.items[0]?.name).toBe("Soupe du Jour");
    expect(result.docs.spec).toEqual(docs.spec);
    expect(seed.document.sections[1]?.items[0]?.name).toBe("Soupe à l'Oignon Gratinée");
  });

  it("rejects id edits", () => {
    const result = applyEdits(docs, [{ target: "document", ops: [{ op: "replace", path: "/sections/0/id", value: "sec_zzzzzzzz" }] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("forbidden_path");
  });

  it("fails atomically when a test op fails", () => {
    const result = applyEdits(docs, [
      {
        target: "document",
        ops: [
          { op: "test", path: "/sections/1/items/0/id", value: "itm_cl999999" },
          { op: "replace", path: "/sections/1/items/0/price", value: 1 },
        ],
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("test_failed");
  });

  it("rejects schema-invalid results with readable issues", () => {
    const result = applyEdits(docs, [{ target: "document", ops: [{ op: "replace", path: "/sections/1/items/0/price", value: 12.5 }] }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("schema");
      expect(result.error.issues.join(" ")).toMatch(/price/);
    }
  });

  it("tolerates dangling refs after content deletes but not after strict spec edits", () => {
    const removeSection: Edit = { target: "document", ops: [{ op: "remove", path: "/sections/4" }] };
    const content = applyEdits(docs, [removeSection]);
    expect(content.ok).toBe(true);
    if (content.ok) expect(content.danglingRefs.length).toBeGreaterThan(0);

    const badRef: Edit = { target: "spec", ops: [{ op: "replace", path: "/pages/0/blocks/1/sectionRef", value: "sec_missing1" }] };
    const strict = applyEdits(docs, [badRef], { strictRefs: true });
    expect(strict.ok).toBe(false);
  });

  it("produces an inverse edit guarded by test ops", () => {
    const edit: Edit = { target: "spec", ops: [{ op: "replace", path: "/tokens/paletteId", value: "deco-noir" }] };
    const result = applyEdits(docs, [edit]);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.docs.spec) return;
    const inverse = inverseEdit(docs.spec, result.docs.spec, "spec");
    expect(inverse?.ops[0]).toEqual({ op: "test", path: "/tokens/paletteId", value: "deco-noir" });
    const reverted = applyEdits(result.docs, inverse ? [inverse] : []);
    expect(reverted.ok && reverted.docs.spec?.tokens.paletteId).toBe("bistro-cream");
  });

  it("reports which content fields an edit changes", () => {
    expect(contentFieldsChanged([{ target: "document", ops: [{ op: "replace", path: "/sections/0/items/0/priceVariants/1/price", value: 1 }] }])).toEqual({
      prices: true,
      names: false,
      descriptions: false,
    });
  });
});

describe("engineering guard", () => {
  it("allows emphasis changes and rejects removals", () => {
    const seed = SEEDS["bistro-paris"];
    const before = { document: seed.document, spec: seed.spec };
    const ok: Edit = { target: "spec", ops: [{ op: "replace", path: "/pages/0/blocks/1/emphasis", value: "high" }] };
    const applied = applyEdits(before, [ok]);
    expect(applied.ok).toBe(true);
    if (applied.ok && applied.docs.spec) {
      expect(engineeringEditViolations([ok], before, { document: applied.docs.document, spec: applied.docs.spec })).toEqual([]);
    }
    const bad: Edit = { target: "document", ops: [{ op: "remove", path: "/sections/1/items/0" }] };
    const removed = applyEdits(before, [bad]);
    if (removed.ok && removed.docs.spec) {
      const violations = engineeringEditViolations([bad], before, { document: removed.docs.document, spec: removed.docs.spec });
      expect(violations.some((v) => v.includes("removed"))).toBe(true);
    }
  });
});

describe("concept validation", () => {
  const seed = SEEDS["cocktail-bar-london"];
  const brief = defaultBrief();
  const make = (archetype: "classic_list" | "two_column" | "flavor_matrix", tokens: Partial<LayoutSpec["tokens"]> = {}) =>
    buildDefaultSpec({ archetype, document: seed.document, format: "A4", orientation: "portrait", tokens });

  it("accepts three distinct concepts", () => {
    const specs = [make("classic_list"), make("two_column"), make("flavor_matrix")];
    expect(conceptSetIssues(specs, seed.document, brief, ["classic_list", "two_column", "flavor_matrix"])).toEqual([]);
  });

  it("rejects same-archetype concepts that share tokens", () => {
    const specs = [make("classic_list"), make("classic_list"), make("two_column")];
    const issues = conceptSetIssues(specs, seed.document, brief, ["classic_list", "two_column"]);
    expect(issues.some((i) => i.includes("must differ"))).toBe(true);
  });

  it("rejects disallowed archetypes", () => {
    const specs = [make("classic_list"), make("two_column"), make("flavor_matrix")];
    const issues = conceptSetIssues(specs, seed.document, brief, ["classic_list", "two_column"]);
    expect(issues.some((i) => i.includes("not allowed"))).toBe(true);
  });
});

describe("print tokens", () => {
  it("round-trips, expires and rejects tampering", async () => {
    const token = await signPrintToken({ projectId: "p1", versionId: "v1", purpose: "print" }, "secret", 60, 1_000_000);
    expect(await verifyPrintToken(token, "secret", 1_000_000)).toMatchObject({ projectId: "p1", versionId: "v1" });
    expect(await verifyPrintToken(token, "secret", 1_000_000 + 61_000)).toBeNull();
    expect(await verifyPrintToken(token, "other", 1_000_000)).toBeNull();
    expect(await verifyPrintToken(`${token}x`, "secret", 1_000_000)).toBeNull();
  });
});

describe("menu engineering", () => {
  it("classifies deterministically from sales mix", () => {
    const doc = structuredClone(SEEDS["bistro-paris"].document);
    const plats = doc.sections[2];
    if (!plats) throw new Error("fixture");
    const inputs = [
      { cost: 900, units: 120 },
      { cost: 600, units: 40 },
      { cost: 1400, units: 110 },
      { cost: 500, units: 10 },
    ];
    plats.items.forEach((item, i) => {
      const input = inputs[i];
      if (input) item.engineering = { costPrice: input.cost, unitsSold: input.units };
    });
    const analysis = computeQuadrants(doc);
    expect(analysis.method).toBe("sales_mix");
    const byName = Object.fromEntries(analysis.results.map((r) => [r.name, r.quadrant]));
    expect(byName).toEqual({
      "Steak Frites": "star",
      "Moules Marinières": "puzzle",
      "Confit de Canard": "plowhorse",
      "Ratatouille Provençale": "dog",
    });
    expect(analysis.skipped.length).toBeGreaterThan(0);
  });

  it("parses quoted CSV", () => {
    expect(parseCsv('name,cost\n"Steak, frites",900\r\nKir,300\n')).toEqual([
      ["name", "cost"],
      ["Steak, frites", "900"],
      ["Kir", "300"],
    ]);
  });
});

describe("helpers", () => {
  it("limits sentences in code", () => {
    expect(limitSentences("One. Two! Three? Four.", 2)).toBe("One. Two!");
  });

  it("checks availability in the venue timezone, across midnight", () => {
    const window = { days: ["fri" as const], startTime: "22:00", endTime: "02:00" };
    // Friday 23:30 in London (BST) = 22:30 UTC
    expect(isAvailableAt(window, new Date("2026-09-18T22:30:00Z"), "Europe/London")).toBe(true);
    // Saturday 01:00 London = Saturday 00:00 UTC
    expect(isAvailableAt(window, new Date("2026-09-19T00:00:00Z"), "Europe/London")).toBe(true);
    expect(isAvailableAt(window, new Date("2026-09-19T12:00:00Z"), "Europe/London")).toBe(false);
  });

  it("estimates flavor from ingredients when none is given", () => {
    const negroni = structuredClone(SEEDS["cocktail-bar-london"].document.sections[0]?.items[5]);
    if (!negroni) throw new Error("fixture");
    delete negroni.attributes.flavor;
    const f = estimateFlavor(negroni);
    expect(f.sweetBitter).toBeGreaterThan(0);
    expect(f.refreshingBoozy).toBeGreaterThan(0);
  });

  it("enforces plan limits", () => {
    expect(canCreateVenue({ plan: "free", venues: 1, aiEditsThisMonth: 0, aiEditCredits: 0, exportCredits: 0 }).allowed).toBe(false);
    expect(canUseAiEdit({ plan: "free", venues: 1, aiEditsThisMonth: 20, aiEditCredits: 0, exportCredits: 0 }).allowed).toBe(false);
    expect(canUseAiEdit({ plan: "pro", venues: 1, aiEditsThisMonth: 400, aiEditCredits: 0, exportCredits: 0 }).allowed).toBe(true);
  });
});
