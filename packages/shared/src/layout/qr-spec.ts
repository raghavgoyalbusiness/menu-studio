import type { LayoutSpec, MenuDocument } from "../index.ts";
import { buildDefaultSpec, DEFAULT_TOKENS } from "./default-spec.ts";

export type QrThemeMode = "match_print" | "mobile_optimized";

/**
 * The QR menu layout: always the mobile_stack archetype. "match_print" keeps the print
 * design's fonts, colours and ornament; "mobile_optimized" keeps the brand but tunes
 * spacing, icons and prices for small screens. Shared by the web preview and the worker.
 */
export function buildQrSpec(document: MenuDocument, printSpec: LayoutSpec | null, themeMode: QrThemeMode): LayoutSpec {
  const base = printSpec?.tokens ?? DEFAULT_TOKENS;
  const tokens =
    themeMode === "match_print"
      ? { ...base, bodyScale: 1 }
      : {
          ...base,
          density: "balanced" as const,
          iconSet: base.iconSet === "none" ? ("dietary_only" as const) : base.iconSet,
          pricePlacement: "right_aligned" as const,
          priceStyle: "no_decimals" as const,
          textCase: "as_written" as const,
          backgroundTexture: "none" as const,
          bodyScale: 1,
        };
  return buildDefaultSpec({
    archetype: "mobile_stack",
    document,
    format: "MOBILE",
    orientation: "portrait",
    tokens,
    conceptName: printSpec?.conceptName ?? "QR menu",
    specId: `qr-${printSpec?.id ?? document.id}`,
    ids: (() => {
      let n = 0;
      return (prefix) => `${prefix}_qr${String(++n).padStart(prefix === "pg" ? 6 : 6, "0")}`;
    })(),
  });
}
