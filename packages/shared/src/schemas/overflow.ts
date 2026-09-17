import { z } from "zod";

export const OVERFLOW_STEPS = ["density", "font_scale", "rebalance", "add_page"] as const;
export const OverflowStep = z.enum(OVERFLOW_STEPS);
export type OverflowStep = z.infer<typeof OverflowStep>;

export const PageOverflow = z.strictObject({
  pageId: z.string(),
  availableMm: z.number(),
  usedMm: z.number(),
  overflowMm: z.number(),
  blockIds: z.array(z.string()),
});
export type PageOverflow = z.infer<typeof PageOverflow>;

export const OverflowReport = z.strictObject({
  fits: z.boolean(),
  fontsLoaded: z.boolean(),
  pages: z.array(PageOverflow),
  appliedSteps: z.array(OverflowStep),
  /** Human-readable reason when the engine could not make it fit. */
  message: z.string().optional(),
});
export type OverflowReport = z.infer<typeof OverflowReport>;
