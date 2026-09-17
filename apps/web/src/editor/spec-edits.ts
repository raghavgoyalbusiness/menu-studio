import {
  buildDefaultSpec,
  getByPointer,
  type ArchetypeId,
  type Block,
  type Edit,
  type Emphasis,
  type JsonPatchOp,
  type LayoutSpec,
  type MenuDocument,
  type StyleOverrides,
  type Tokens,
} from "@menu-studio/shared";

function blockPath(spec: LayoutSpec, blockId: string): { path: string; block: Block; pageIndex: number; blockIndex: number } | null {
  for (const [pageIndex, page] of spec.pages.entries()) {
    const blockIndex = page.blocks.findIndex((b) => b.id === blockId);
    const block = page.blocks[blockIndex];
    if (block) return { path: `/pages/${pageIndex}/blocks/${blockIndex}`, block, pageIndex, blockIndex };
  }
  return null;
}

export function setToken<K extends keyof Tokens>(spec: LayoutSpec, key: K, value: Tokens[K]): Edit | null {
  if (spec.tokens[key] === value) return null;
  return { target: "spec", ops: [{ op: key in spec.tokens ? "replace" : "add", path: `/tokens/${key}`, value }] };
}

export function setBlockEmphasis(spec: LayoutSpec, blockId: string, emphasis: Emphasis): Edit | null {
  const found = blockPath(spec, blockId);
  if (!found || found.block.emphasis === emphasis) return null;
  return { target: "spec", ops: [{ op: "test", path: `${found.path}/id`, value: blockId }, { op: "replace", path: `${found.path}/emphasis`, value: emphasis }] };
}

export function setBlockOverride<K extends keyof StyleOverrides>(spec: LayoutSpec, blockId: string, key: K, value: StyleOverrides[K] | undefined): Edit | null {
  const found = blockPath(spec, blockId);
  if (!found) return null;
  const next: StyleOverrides = { ...found.block.styleOverrides };
  if (value === undefined) delete next[key];
  else next[key] = value;
  const ops: JsonPatchOp[] = [{ op: "test", path: `${found.path}/id`, value: blockId }];
  ops.push(Object.keys(next).length ? { op: found.block.styleOverrides ? "replace" : "add", path: `${found.path}/styleOverrides`, value: next } : { op: "remove", path: `${found.path}/styleOverrides` });
  if (ops[1]?.op === "remove" && !found.block.styleOverrides) return null;
  return { target: "spec", ops };
}

/** Reorder blocks on a page: rows follow the given order, columns stay as they are. */
export function reorderBlocks(spec: LayoutSpec, pageIndex: number, orderedIds: string[]): Edit | null {
  const page = spec.pages[pageIndex];
  if (!page) return null;
  const ops: JsonPatchOp[] = [{ op: "test", path: `/pages/${pageIndex}/id`, value: page.id }];
  orderedIds.forEach((id, i) => {
    const blockIndex = page.blocks.findIndex((b) => b.id === id);
    const block = page.blocks[blockIndex];
    if (!block || block.gridArea.row === i + 1) return;
    ops.push({ op: "test", path: `/pages/${pageIndex}/blocks/${blockIndex}/id`, value: id }, { op: "replace", path: `/pages/${pageIndex}/blocks/${blockIndex}/gridArea/row`, value: i + 1 });
  });
  return ops.length > 1 ? { target: "spec", ops } : null;
}

export function moveBlockBy(spec: LayoutSpec, blockId: string, delta: -1 | 1): Edit | null {
  const found = blockPath(spec, blockId);
  if (!found) return null;
  const page = spec.pages[found.pageIndex];
  if (!page) return null;
  const ordered = [...page.blocks].sort((a, b) => a.gridArea.row - b.gridArea.row || a.gridArea.col - b.gridArea.col).map((b) => b.id);
  const index = ordered.indexOf(blockId);
  const target = index + delta;
  if (target < 0 || target >= ordered.length) return null;
  [ordered[index], ordered[target]] = [ordered[target] ?? blockId, ordered[index] ?? blockId];
  return reorderBlocks(spec, found.pageIndex, ordered);
}

/** Switch archetype: rebuild pages for the new layout, keeping tokens, format and copy. */
export function switchArchetype(document: MenuDocument, spec: LayoutSpec, archetype: ArchetypeId): Edit | null {
  if (spec.archetype === archetype) return null;
  const rebuilt = buildDefaultSpec({ archetype, document, format: spec.format, orientation: spec.orientation, tokens: spec.tokens });
  const ops: JsonPatchOp[] = [
    { op: "replace", path: "/archetype", value: archetype },
    { op: "replace", path: "/pages", value: rebuilt.pages },
  ];
  if (rebuilt.matrix) ops.push({ op: spec.matrix ? "replace" : "add", path: "/matrix", value: spec.matrix && archetype === "flavor_matrix" ? spec.matrix : rebuilt.matrix });
  else if (spec.matrix) ops.push({ op: "remove", path: "/matrix" });
  if (rebuilt.journey) ops.push({ op: spec.journey ? "replace" : "add", path: "/journey", value: rebuilt.journey });
  else if (spec.journey) ops.push({ op: "remove", path: "/journey" });
  return { target: "spec", ops };
}

function placementIndex(spec: LayoutSpec, itemId: string): number {
  return spec.matrix?.placements.findIndex((p) => p.itemId === itemId) ?? -1;
}

export function moveMatrixItem(spec: LayoutSpec, itemId: string, x: number, y: number): Edit | null {
  const i = placementIndex(spec, itemId);
  if (i < 0) return null;
  const clamp = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 100) / 100));
  return {
    target: "spec",
    ops: [
      { op: "test", path: `/matrix/placements/${i}/itemId`, value: itemId },
      { op: "replace", path: `/matrix/placements/${i}/x`, value: clamp(x) },
      { op: "replace", path: `/matrix/placements/${i}/y`, value: clamp(y) },
    ],
  };
}

export function setMatrixLock(spec: LayoutSpec, itemId: string, locked: boolean): Edit | null {
  const i = placementIndex(spec, itemId);
  if (i < 0) return null;
  return { target: "spec", ops: [{ op: "test", path: `/matrix/placements/${i}/itemId`, value: itemId }, { op: "replace", path: `/matrix/placements/${i}/locked`, value: locked }] };
}

export function resetMatrixItem(spec: LayoutSpec, itemId: string): Edit | null {
  const i = placementIndex(spec, itemId);
  const placement = spec.matrix?.placements[i];
  if (!placement?.ai) return null;
  return moveMatrixItem(spec, itemId, placement.ai.x, placement.ai.y);
}

/**
 * Guard an inline text edit at any document pointer: test the id of the array element it
 * lives in (item or section), or the previous value for id-less arrays such as footer notes.
 */
export function guardedReplace(document: MenuDocument, pointer: string, value: unknown): Edit {
  const ops: JsonPatchOp[] = [];
  const itemMatch = /^(\/sections\/\d+\/items\/\d+)\//.exec(pointer);
  const sectionMatch = /^(\/sections\/\d+)\//.exec(pointer);
  if (itemMatch?.[1]) ops.push({ op: "test", path: `${itemMatch[1]}/id`, value: getByPointer(document, `${itemMatch[1]}/id`) });
  else if (sectionMatch?.[1]) ops.push({ op: "test", path: `${sectionMatch[1]}/id`, value: getByPointer(document, `${sectionMatch[1]}/id`) });
  else if (/^\/footerNotes\/\d+$/.test(pointer)) ops.push({ op: "test", path: pointer, value: getByPointer(document, pointer) });
  const exists = getByPointer(document, pointer) !== undefined;
  ops.push({ op: exists ? "replace" : "add", path: pointer, value });
  return { target: "document", ops };
}
