import { createContext, useContext } from "react";
import type { LayoutSpec, MenuDocument, MenuItem, MenuSection } from "@menu-studio/shared";
import type { RenderMode } from "./geometry.ts";
import type { ResolvedTokens } from "./tokens.ts";

/** Callbacks the editor provides. Absent in print, PNG and QR modes. */
export interface EditingBridge {
  /** Commit a plain text field at a MenuDocument JSON Pointer. */
  commitText(pointer: string, value: string): void;
  /** Commit a price typed by the owner at a MenuDocument JSON Pointer. */
  commitPrice(pointer: string, raw: string): void;
  selectBlock(blockId: string | null): void;
  selectItem?(itemId: string | null): void;
  /** Flavor matrix drag end, coordinates in -1..1. */
  moveMatrixItem?(itemId: string, x: number, y: number): void;
}

export interface ItemLocation {
  item: MenuItem;
  section: MenuSection;
  sectionIndex: number;
  itemIndex: number;
}

export interface RenderContextValue {
  document: MenuDocument;
  spec: LayoutSpec;
  mode: RenderMode;
  /** Language to display; translations fall back to the original. */
  lang: string;
  /** Injected clock for availability windows (QR). Null disables availability checks. */
  now: Date | null;
  timezone: string;
  tokens: ResolvedTokens;
  editing: EditingBridge | null;
  selectedBlockId: string | null;
  selectedItemId: string | null;
  highlightBlockIds: ReadonlySet<string>;
  items: ReadonlyMap<string, ItemLocation>;
  sections: ReadonlyMap<string, { section: MenuSection; index: number }>;
  logoUrl: string | null;
  qrCode: { src: string; caption: string } | null;
  cropMarks: boolean;
  showGuides: { bleed: boolean; safe: boolean };
  watermark: boolean;
}

export const RenderContext = createContext<RenderContextValue | null>(null);

export function useRenderContext(): RenderContextValue {
  const ctx = useContext(RenderContext);
  if (!ctx) throw new Error("Renderer components must be used inside <MenuRenderer>");
  return ctx;
}

export function buildItemIndex(document: MenuDocument): Map<string, ItemLocation> {
  const map = new Map<string, ItemLocation>();
  document.sections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => map.set(item.id, { item, section, sectionIndex, itemIndex }));
  });
  return map;
}

/** Whether the display language differs from the source, in which case text is read-only. */
export function isTranslated(ctx: RenderContextValue): boolean {
  return ctx.lang !== ctx.document.primaryLanguage;
}
