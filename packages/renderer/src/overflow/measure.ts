import { pxToMm } from "../geometry.ts";
import type { BlockMeasure, PageMeasure } from "./plan.ts";

/**
 * Measure every rendered page under `root`. Uses layout sizes (offset*, scroll*), which
 * ignore CSS transforms, so the editor's zoom does not affect results.
 */
export function measurePages(root: HTMLElement): PageMeasure[] {
  const pages = [...root.querySelectorAll<HTMLElement>("[data-ms-page]")];
  return pages.map((page) => {
    const content = page.querySelector<HTMLElement>("[data-ms-content]");
    const pageId = page.dataset.msPage ?? "";
    if (!content) return { pageId, availableMm: 0, usedMm: 0, blocks: [] };
    const contentRect = content.getBoundingClientRect();
    const scale = content.offsetHeight > 0 ? contentRect.height / content.offsetHeight : 1;
    const blocks: BlockMeasure[] = [];
    let used = 0;
    for (const el of content.querySelectorAll<HTMLElement>("[data-ms-block]")) {
      const rect = el.getBoundingClientRect();
      const topMm = pxToMm((rect.top - contentRect.top) / scale);
      const heightMm = pxToMm(rect.height / scale);
      const columnAttr = el.closest<HTMLElement>("[data-ms-column]")?.dataset.msColumn;
      blocks.push({
        blockId: el.dataset.msBlock ?? "",
        topMm,
        heightMm,
        column: columnAttr === undefined ? -1 : Number(columnAttr),
      });
      used = Math.max(used, topMm + heightMm);
    }
    const style = getComputedStyle(content);
    const paddingBottom = pxToMm(Number.parseFloat(style.paddingBottom) || 0);
    return {
      pageId,
      availableMm: pxToMm(content.clientHeight) - paddingBottom,
      usedMm: used,
      blocks,
    };
  });
}

const SCRIPT_SAMPLES = ["Menu Aa 123", "मेनू", "メニュー", "قائمة"];

/**
 * Wait until the given families have actually loaded (not merely "not needed").
 * Returns false if any family has no matching @font-face or fails to load in time.
 */
export async function waitForFonts(families: readonly string[], timeoutMs = 15000): Promise<boolean> {
  if (typeof document === "undefined" || !("fonts" in document)) return false;
  const load = async () => {
    const results = await Promise.all(
      families.map(async (family) => {
        const faces = await Promise.all(SCRIPT_SAMPLES.map((sample) => document.fonts.load(`16px "${family}"`, sample)));
        return faces.some((set) => set.length > 0);
      }),
    );
    await document.fonts.ready;
    return results.every(Boolean);
  };
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  try {
    return await Promise.race([load(), timeout]);
  } catch {
    return false;
  }
}

/** Two animation frames: enough for React commits and layout to settle. */
export function nextFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
