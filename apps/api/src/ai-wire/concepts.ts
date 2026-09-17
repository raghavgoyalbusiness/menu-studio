import { BACKGROUND_TEXTURES, FONT_PAIRING_IDS, ORNAMENT_STYLES, PALETTE_IDS } from "@menu-studio/design-system/catalog";
import {
  ARCHETYPE_IDS,
  BLOCK_TYPES,
  conceptSetIssues,
  CONCEPT_COUNT,
  contentBoxMm,
  DENSITIES,
  drinkItems,
  EMPHASES,
  FORMATS,
  ICON_SETS,
  LayoutSpec,
  limitChars,
  limitSentences,
  pageColumns,
  PRICE_PLACEMENTS,
  PRICE_STYLES,
  resolveOrientation,
  shortId,
  TEXT_CASES,
  uuid,
  type ArchetypeId,
  type Block,
  type DesignBrief,
  type MenuDocument,
  type NoteRef,
  type StyleOverrides,
} from "@menu-studio/shared";
import { z } from "zod";
import type { Conversion } from "../services/anthropic.ts";
import { menuSummary } from "./menu-summary.ts";

const BlockWire = z.strictObject({
  type: z.enum(BLOCK_TYPES),
  sectionRef: z.string().nullable(),
  itemRefs: z.array(z.string()).nullable(),
  noteRef: z.string().nullable(),
  gridArea: z.strictObject({ col: z.number(), row: z.number(), colSpan: z.number(), rowSpan: z.number() }),
  emphasis: z.enum(EMPHASES),
  styleOverrides: z
    .strictObject({
      paletteRole: z.enum(["default", "accent", "accent2", "inverse"]).nullable(),
      density: z.enum(DENSITIES).nullable(),
      textCase: z.enum(TEXT_CASES).nullable(),
      ornament: z.enum(ORNAMENT_STYLES).nullable(),
      align: z.enum(["start", "center"]).nullable(),
    })
    .nullable(),
});

export const ConceptWire = z.strictObject({
  conceptName: z.string(),
  rationale: z.string(),
  archetype: z.enum(ARCHETYPE_IDS),
  tokens: z.strictObject({
    fontPairingId: z.enum(FONT_PAIRING_IDS),
    paletteId: z.enum(PALETTE_IDS),
    ornamentStyle: z.enum(ORNAMENT_STYLES),
    density: z.enum(DENSITIES),
    iconSet: z.enum(ICON_SETS),
    pricePlacement: z.enum(PRICE_PLACEMENTS),
    priceStyle: z.enum(PRICE_STYLES),
    textCase: z.enum(TEXT_CASES),
    backgroundTexture: z.enum(BACKGROUND_TEXTURES),
    bodyScale: z.number(),
  }),
  pages: z.array(z.strictObject({ blocks: z.array(BlockWire) })),
  matrix: z
    .strictObject({
      xAxis: z.strictObject({ negLabel: z.string(), posLabel: z.string() }),
      yAxis: z.strictObject({ negLabel: z.string(), posLabel: z.string() }),
      placements: z.array(z.strictObject({ itemId: z.string(), x: z.number(), y: z.number() })),
    })
    .nullable(),
  journey: z
    .strictObject({
      orientation: z.enum(["horizontal", "vertical"]),
      steps: z.array(z.strictObject({ label: z.string(), itemRefs: z.array(z.string()) })),
    })
    .nullable(),
});
export type ConceptWire = z.infer<typeof ConceptWire>;

export const ConceptsWire = z.strictObject({ concepts: z.array(ConceptWire) });
export type ConceptsWire = z.infer<typeof ConceptsWire>;

export function conceptsUserText(input: {
  document: MenuDocument;
  brief: DesignBrief;
  allowed: readonly ArchetypeId[];
  excluded: { id: ArchetypeId; reason: string }[];
  reference: LayoutSpec | null;
}): string {
  const { brief } = input;
  const orientation = resolveOrientation(brief.format, brief.orientation);
  const box = contentBoxMm(brief.format, orientation);
  const columns = input.allowed.map((id) => `${id}=${pageColumns(id, brief.format, orientation)}`).join(", ");
  const lines = [
    `Format: ${FORMATS[brief.format].label} (${FORMATS[brief.format].description}), ${orientation}. Content area per page about ${Math.round(box.width)} × ${Math.round(box.height)} mm.`,
    `Page count preference: ${String(brief.pageCountPreference)}.`,
    `Allowed archetypes: ${input.allowed.join(", ")}.`,
    input.excluded.length ? `Not allowed for this menu: ${input.excluded.map((e) => `${e.id} (${e.reason})`).join("; ")}.` : "",
    `Grid columns per archetype for this format: ${columns}.`,
    "",
    "Design brief:",
    JSON.stringify(
      {
        minimalToMaximal: brief.minimalToMaximal,
        classicToExperimental: brief.classicToExperimental,
        vibeKeywords: brief.vibeKeywords,
        cuisine: brief.cuisine,
        priceTier: brief.priceTier,
        brandColors: brief.brandAssets?.brandColors ?? [],
        preferredFontPairings: brief.brandAssets?.brandFonts ?? [],
        mustInclude: brief.mustInclude,
        avoid: brief.avoid,
        referenceStyle: brief.referenceStyle,
      },
      null,
      1,
    ),
    "",
    "Menu:",
    menuSummary(input.document),
  ];
  if (input.reference) {
    lines.push(
      "",
      "Create 3 variations of this reference concept. Keep its archetype and overall idea; vary palette, typography, density, ornament and emphasis so every variation is clearly different from the reference and from each other:",
      JSON.stringify({ archetype: input.reference.archetype, conceptName: input.reference.conceptName, tokens: input.reference.tokens }),
    );
  }
  return lines.filter((l) => l !== "").join("\n");
}

function parseNoteRef(value: string | null): NoteRef | undefined {
  if (!value) return undefined;
  if (value === "taxNote" || value === "allergenDisclaimer") return value;
  const match = /^footer:(\d)$/.exec(value);
  return match ? Number(match[1]) : undefined;
}

const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));
const clamp1 = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 100) / 100));

export function convertConcept(wire: ConceptWire, document: MenuDocument, brief: DesignBrief, index: number): { spec: LayoutSpec | null; issues: string[] } {
  const label = `concepts[${index}]`;
  const issues: string[] = [];
  const orientation = resolveOrientation(brief.format, brief.orientation);

  const pages = wire.pages.map((page) => ({
    id: shortId("pg"),
    blocks: page.blocks.map((b, bi): Block => {
      const block: Block = {
        id: shortId("blk"),
        type: b.type,
        gridArea: {
          col: clampInt(b.gridArea.col, 1, 6),
          row: clampInt(b.gridArea.row, 1, 80),
          colSpan: clampInt(b.gridArea.colSpan, 1, 6),
          rowSpan: clampInt(b.gridArea.rowSpan, 1, 20),
        },
        emphasis: b.emphasis,
      };
      if (b.sectionRef) block.sectionRef = b.sectionRef;
      if (b.itemRefs?.length) block.itemRefs = b.itemRefs.slice(0, 60);
      const noteRef = parseNoteRef(b.noteRef);
      if (noteRef !== undefined) block.noteRef = noteRef;
      else if (b.type === "note") issues.push(`${label}.pages.blocks[${bi}]: noteRef must be "taxNote", "allergenDisclaimer" or "footer:N".`);
      if (b.styleOverrides) {
        const o: StyleOverrides = {};
        if (b.styleOverrides.paletteRole) o.paletteRole = b.styleOverrides.paletteRole;
        if (b.styleOverrides.density) o.density = b.styleOverrides.density;
        if (b.styleOverrides.textCase) o.textCase = b.styleOverrides.textCase;
        if (b.styleOverrides.ornament) o.ornament = b.styleOverrides.ornament;
        if (b.styleOverrides.align) o.align = b.styleOverrides.align;
        if (Object.keys(o).length) block.styleOverrides = o;
      }
      return block;
    }),
  }));

  const spec: LayoutSpec = {
    schemaVersion: 1,
    id: uuid(),
    format: brief.format,
    orientation,
    archetype: wire.archetype,
    tokens: { ...wire.tokens, bodyScale: Math.max(0.9, Math.min(1.1, Math.round(wire.tokens.bodyScale * 100) / 100 || 1)) },
    pages: pages.length ? pages : [{ id: shortId("pg"), blocks: [] }],
    conceptName: limitChars(wire.conceptName.trim() || "Untitled concept", 60),
    rationale: limitChars(limitSentences(wire.rationale, 2) || "A layout shaped around your menu.", 400),
    engineeringApplied: false,
  };

  if (wire.archetype === "flavor_matrix") {
    if (!wire.matrix) issues.push(`${label}: flavor_matrix needs a matrix with a placement for every drink.`);
    else {
      const drinks = new Set(drinkItems(document).map((i) => i.id));
      const seen = new Set<string>();
      const placements = wire.matrix.placements
        .filter((p) => {
          if (!drinks.has(p.itemId) || seen.has(p.itemId)) return false;
          seen.add(p.itemId);
          return true;
        })
        .map((p) => ({ itemId: p.itemId, x: clamp1(p.x), y: clamp1(p.y), locked: false, ai: { x: clamp1(p.x), y: clamp1(p.y) } }));
      const missing = [...drinks].filter((id) => !seen.has(id));
      if (missing.length > drinks.size / 2) issues.push(`${label}: place every drink on the matrix; missing ${missing.join(", ")}.`);
      spec.matrix = {
        xAxis: { negLabel: limitChars(wire.matrix.xAxis.negLabel || "Sweet", 24), posLabel: limitChars(wire.matrix.xAxis.posLabel || "Bitter", 24) },
        yAxis: { negLabel: limitChars(wire.matrix.yAxis.negLabel || "Refreshing", 24), posLabel: limitChars(wire.matrix.yAxis.posLabel || "Boozy", 24) },
        placements,
      };
    }
  }
  if (wire.archetype === "tasting_journey") {
    if (!wire.journey || wire.journey.steps.length < 2) issues.push(`${label}: tasting_journey needs journey with 2 to 8 steps.`);
    else {
      spec.journey = {
        orientation: wire.journey.orientation,
        steps: wire.journey.steps.slice(0, 8).map((s) => ({ label: limitChars(s.label || "Course", 40), itemRefs: s.itemRefs.slice(0, 12) })),
      };
    }
  }

  const parsed = LayoutSpec.safeParse(spec);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((i) => `${label}.${i.path.join(".")}: ${i.message}`));
    return { spec: null, issues };
  }
  return { spec: parsed.data, issues };
}

export function convertConcepts(wire: ConceptsWire, ctx: { document: MenuDocument; brief: DesignBrief; allowed: readonly ArchetypeId[] }): Conversion<LayoutSpec[]> {
  const issues: string[] = [];
  if (wire.concepts.length !== CONCEPT_COUNT) issues.push(`Return exactly ${CONCEPT_COUNT} concepts (got ${wire.concepts.length}).`);
  const specs: LayoutSpec[] = [];
  wire.concepts.slice(0, CONCEPT_COUNT).forEach((concept, i) => {
    const result = convertConcept(concept, ctx.document, ctx.brief, i);
    issues.push(...result.issues);
    if (result.spec) specs.push(result.spec);
  });
  if (specs.length === wire.concepts.slice(0, CONCEPT_COUNT).length) {
    issues.push(...conceptSetIssues(specs, ctx.document, ctx.brief, ctx.allowed));
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: specs };
}
