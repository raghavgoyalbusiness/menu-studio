import type { Block } from "@menu-studio/shared";

export type Band = { kind: "full"; block: Block } | { kind: "columns"; columns: Block[][] };

export function orderBlocks(blocks: readonly Block[]): Block[] {
  return [...blocks].sort((a, b) => a.gridArea.row - b.gridArea.row || a.gridArea.col - b.gridArea.col);
}

/**
 * Deterministic flow layout: blocks spanning every column form full-width bands;
 * runs of narrower blocks stack per column in row order until the next full band.
 */
export function toBands(blocks: readonly Block[], columns: number): Band[] {
  const bands: Band[] = [];
  let current: Block[][] | null = null;
  for (const block of orderBlocks(blocks)) {
    const full = columns <= 1 || block.gridArea.colSpan >= columns;
    if (full) {
      current = null;
      bands.push({ kind: "full", block });
      continue;
    }
    if (!current) {
      current = Array.from({ length: columns }, () => []);
      bands.push({ kind: "columns", columns: current });
    }
    const col = Math.min(columns, Math.max(1, block.gridArea.col)) - 1;
    current[col]?.push(block);
  }
  return bands;
}
