import { z } from "zod";
import {
  BACKGROUND_TEXTURES,
  FONT_PAIRING_IDS,
  ORNAMENT_STYLES,
  PALETTE_IDS,
  isHexColor,
  paletteContrastIssues,
} from "@menu-studio/design-system/catalog";
import { FormatId } from "../formats.ts";
import { BlockId, HexColor, ItemId, Orientation, PageId, SectionId } from "./common.ts";

export const ARCHETYPE_IDS = [
  "classic_list",
  "two_column",
  "flavor_matrix",
  "editorial",
  "by_base_spirit",
  "tasting_journey",
  "poster",
  "chalkboard",
  "grid_cards",
  "mobile_stack",
] as const;
export const ArchetypeId = z.enum(ARCHETYPE_IDS);
export type ArchetypeId = z.infer<typeof ArchetypeId>;

export const DENSITIES = ["airy", "balanced", "dense"] as const;
export const Density = z.enum(DENSITIES);
export type Density = z.infer<typeof Density>;

export const ICON_SETS = ["none", "glassware", "food_minimal", "dietary_only"] as const;
export const PRICE_PLACEMENTS = ["right_aligned", "inline_after_desc", "below_name", "no_currency_symbol"] as const;
export const PRICE_STYLES = ["plain", "no_decimals", "dot_leaders"] as const;
export const TEXT_CASES = ["as_written", "lowercase", "uppercase_names", "small_caps_sections"] as const;
export const BLOCK_TYPES = [
  "header",
  "logo",
  "section",
  "itemList",
  "matrix",
  "divider",
  "note",
  "footer",
  "featuredItem",
  "legend",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export const EMPHASES = ["normal", "high", "hero"] as const;
export type Emphasis = (typeof EMPHASES)[number];

export const OrnamentStyle = z.enum(ORNAMENT_STYLES);
export const TextCase = z.enum(TEXT_CASES);

export const GridArea = z.strictObject({
  col: z.int().min(1).max(6),
  row: z.int().min(1).max(80),
  colSpan: z.int().min(1).max(6),
  rowSpan: z.int().min(1).max(20),
});
export type GridArea = z.infer<typeof GridArea>;

/** Closed, enum-valued overrides. Nothing CSS-shaped can reach the renderer. */
export const StyleOverrides = z.strictObject({
  paletteRole: z.enum(["default", "accent", "accent2", "inverse"]).optional(),
  density: Density.optional(),
  textCase: TextCase.optional(),
  ornament: OrnamentStyle.optional(),
  align: z.enum(["start", "center"]).optional(),
});
export type StyleOverrides = z.infer<typeof StyleOverrides>;

/** Notes render content that lives in the MenuDocument; the spec only points at it. */
export const NoteRef = z.union([z.literal("taxNote"), z.literal("allergenDisclaimer"), z.int().min(0).max(7)]);
export type NoteRef = z.infer<typeof NoteRef>;

export const ItemSlice = z.strictObject({ start: z.int().min(0), end: z.int().min(1) });

export const Block = z
  .strictObject({
    id: BlockId,
    type: z.enum(BLOCK_TYPES),
    sectionRef: SectionId.optional(),
    itemRefs: z.array(ItemId).max(60).optional(),
    itemSlice: ItemSlice.optional(),
    noteRef: NoteRef.optional(),
    gridArea: GridArea,
    emphasis: z.enum(EMPHASES),
    styleOverrides: StyleOverrides.optional(),
  })
  .superRefine((block, ctx) => {
    if (block.type === "section" && !block.sectionRef) {
      ctx.addIssue({ code: "custom", message: "section blocks need sectionRef", path: ["sectionRef"] });
    }
    if (block.type === "itemList" && !block.itemRefs?.length) {
      ctx.addIssue({ code: "custom", message: "itemList blocks need itemRefs", path: ["itemRefs"] });
    }
    if (block.type === "featuredItem" && block.itemRefs?.length !== 1) {
      ctx.addIssue({ code: "custom", message: "featuredItem blocks need exactly one itemRef", path: ["itemRefs"] });
    }
    if (block.type === "note" && block.noteRef === undefined) {
      ctx.addIssue({ code: "custom", message: "note blocks need noteRef", path: ["noteRef"] });
    }
    if (block.itemSlice && block.itemSlice.end <= block.itemSlice.start) {
      ctx.addIssue({ code: "custom", message: "itemSlice.end must be greater than start", path: ["itemSlice"] });
    }
  });
export type Block = z.infer<typeof Block>;

export const Page = z.strictObject({
  id: PageId,
  blocks: z.array(Block).max(80),
});
export type Page = z.infer<typeof Page>;

export const AxisLabels = z.strictObject({
  negLabel: z.string().min(1).max(24),
  posLabel: z.string().min(1).max(24),
});

export const Coordinate = z.number().min(-1).max(1);

export const MatrixPlacement = z.strictObject({
  itemId: ItemId,
  x: Coordinate,
  y: Coordinate,
  locked: z.boolean(),
  /** Where the AI originally placed the item, for "reset to AI placement". */
  ai: z.strictObject({ x: Coordinate, y: Coordinate }).optional(),
});
export type MatrixPlacement = z.infer<typeof MatrixPlacement>;

export const MatrixConfig = z.strictObject({
  xAxis: AxisLabels,
  yAxis: AxisLabels,
  placements: z.array(MatrixPlacement).max(60),
});
export type MatrixConfig = z.infer<typeof MatrixConfig>;

export const JourneyConfig = z.strictObject({
  orientation: z.enum(["horizontal", "vertical"]),
  steps: z
    .array(z.strictObject({ label: z.string().min(1).max(40), itemRefs: z.array(ItemId).min(1).max(12) }))
    .min(2)
    .max(8),
});
export type JourneyConfig = z.infer<typeof JourneyConfig>;

export const CustomPalette = z.strictObject({
  background: HexColor,
  surface: HexColor,
  text: HexColor,
  muted: HexColor,
  accent: HexColor,
  accent2: HexColor,
});
export type CustomPalette = z.infer<typeof CustomPalette>;

export const Tokens = z
  .strictObject({
    fontPairingId: z.enum(FONT_PAIRING_IDS),
    paletteId: z.enum(PALETTE_IDS),
    customPalette: CustomPalette.optional(),
    ornamentStyle: OrnamentStyle,
    density: Density,
    iconSet: z.enum(ICON_SETS),
    pricePlacement: z.enum(PRICE_PLACEMENTS),
    priceStyle: z.enum(PRICE_STYLES),
    textCase: TextCase,
    backgroundTexture: z.enum(BACKGROUND_TEXTURES),
    /** Body type scale used by the overflow engine; floors are enforced by the renderer. */
    bodyScale: z.number().min(0.8).max(1.25),
  })
  .superRefine((tokens, ctx) => {
    const palette = tokens.customPalette;
    if (!palette) return;
    // Zod 4 runs refinements even when an inner field already failed, and the contrast maths
    // throws on a malformed hex. Each bad colour reports its own regex issue; leave it at that.
    if (!Object.values(palette).every((colour) => isHexColor(colour))) return;
    const issues = paletteContrastIssues(palette, { accentForText: false, accent2ForText: false });
    for (const issue of issues) {
      ctx.addIssue({
        code: "custom",
        path: ["customPalette", issue.role],
        message: `${issue.role} on ${issue.against} has contrast ${issue.ratio}:1; WCAG AA needs 4.5:1`,
      });
    }
  });
export type Tokens = z.infer<typeof Tokens>;

export const LayoutSpec = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(64),
    format: FormatId,
    orientation: Orientation,
    archetype: ArchetypeId,
    tokens: Tokens,
    pages: z.array(Page).min(1).max(24),
    matrix: MatrixConfig.optional(),
    journey: JourneyConfig.optional(),
    conceptName: z.string().min(1).max(60),
    rationale: z.string().min(1).max(400),
    engineeringApplied: z.boolean(),
  })
  .superRefine((spec, ctx) => {
    const blocks = spec.pages.flatMap((p) => p.blocks);
    if (spec.archetype === "flavor_matrix") {
      if (!spec.matrix) ctx.addIssue({ code: "custom", path: ["matrix"], message: "flavor_matrix needs matrix config" });
      if (!blocks.some((b) => b.type === "matrix")) {
        ctx.addIssue({ code: "custom", path: ["pages"], message: "flavor_matrix needs a matrix block" });
      }
    }
    if (spec.archetype === "tasting_journey" && !spec.journey) {
      ctx.addIssue({ code: "custom", path: ["journey"], message: "tasting_journey needs journey config" });
    }
    if (spec.archetype !== "flavor_matrix" && blocks.some((b) => b.type === "matrix")) {
      ctx.addIssue({ code: "custom", path: ["pages"], message: "matrix blocks are only valid in flavor_matrix" });
    }
  });
export type LayoutSpec = z.infer<typeof LayoutSpec>;
