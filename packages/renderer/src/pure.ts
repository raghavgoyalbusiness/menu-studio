export { pageGeometry, pxToMm, PX_PER_MM, type PageGeometry, type RenderMode } from "./geometry.ts";
export { toBands, orderBlocks, type Band } from "./layout/flow.ts";
export { balanceColumns, tallestColumn } from "./overflow/balance.ts";
export { planFit, buildReport, overflowingPages, HEADROOM, type PageMeasure, type BlockMeasure, type PlanResult } from "./overflow/plan.ts";
export { resolveCollisions, countOverlaps, coordToPlot, plotToCoord, DEFAULT_COLLISION, type MatrixLabel, type ResolvedLabel } from "./matrix/collide.ts";
export { specFontFamilies } from "./tokens.ts";
export type { RenderState } from "./ready.ts";
