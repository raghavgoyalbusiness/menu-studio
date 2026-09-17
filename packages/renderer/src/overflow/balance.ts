export interface BalanceInput {
  id: string;
  heightMm: number;
}

export interface BalanceResult {
  /** Column index (0-based) per block id, in original order. */
  assignments: Record<string, number>;
  columnHeightsMm: number[];
}

/**
 * Greedy bin-balance that keeps reading order: each block goes to the currently
 * shortest column. Ties go to the leftmost column so results are deterministic.
 */
export function balanceColumns(blocks: readonly BalanceInput[], columns: number, gapMm = 0): BalanceResult {
  const heights = new Array<number>(Math.max(1, columns)).fill(0);
  const assignments: Record<string, number> = {};
  for (const block of blocks) {
    let target = 0;
    for (let c = 1; c < heights.length; c++) {
      if ((heights[c] ?? 0) < (heights[target] ?? 0) - 0.01) target = c;
    }
    assignments[block.id] = target;
    heights[target] = (heights[target] ?? 0) + block.heightMm + ((heights[target] ?? 0) > 0 ? gapMm : 0);
  }
  return { assignments, columnHeightsMm: heights };
}

export function tallestColumn(heights: readonly number[]): number {
  return heights.reduce((max, h) => Math.max(max, h), 0);
}
