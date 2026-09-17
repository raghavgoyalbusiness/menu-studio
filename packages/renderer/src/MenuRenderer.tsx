import { chalkDust, textureBackground } from "@menu-studio/design-system/react";
import type { LayoutSpec, MenuDocument, OverflowReport } from "@menu-studio/shared";
import { textDirection } from "@menu-studio/i18n";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { MobileStack, PageContent } from "./archetypes.tsx";
import { PageView } from "./components/Page.tsx";
import { buildItemIndex, RenderContext, type EditingBridge, type RenderContextValue } from "./context.tsx";
import { pageGeometry, type RenderMode } from "./geometry.ts";
import { measurePages, nextFrames, waitForFonts } from "./overflow/measure.ts";
import { buildReport, type PageMeasure } from "./overflow/plan.ts";
import { publishRenderState } from "./ready.ts";
import { resolveTokens, specFontFamilies } from "./tokens.ts";

export interface MenuRendererProps {
  document: MenuDocument;
  spec: LayoutSpec;
  mode: RenderMode;
  lang?: string;
  /** ISO timestamp used for availability windows. Omit to show everything. */
  now?: string;
  timezone?: string;
  watermark?: boolean;
  cropMarks?: boolean;
  guides?: { bleed: boolean; safe: boolean };
  editing?: EditingBridge;
  selectedBlockId?: string | null;
  selectedItemId?: string | null;
  highlightBlockIds?: readonly string[];
  logoUrl?: string | null;
  /** A QR code image shown in the footer (table tents, posters). */
  qrCode?: { src: string; caption: string } | null;
  /** Called after fonts load and layout settles, with the measured overflow report. */
  onReport?: (report: OverflowReport, measures: PageMeasure[]) => void;
  /** Publish window.__MENU_RENDER__ and the menu:ready event (print route). */
  signalReady?: boolean;
  className?: string;
}

async function waitForMatrices(root: HTMLElement): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (!root.querySelector('[data-ms-matrix-ready="false"]')) return;
    await nextFrames();
  }
}

export function MenuRenderer(props: MenuRendererProps) {
  const { document: doc, spec, mode, onReport, signalReady } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tokens = useMemo(() => resolveTokens(spec, mode), [spec, mode]);
  const lang = props.lang ?? doc.primaryLanguage;
  const highlight = props.highlightBlockIds;

  const ctx = useMemo<RenderContextValue>(
    () => ({
      document: doc,
      spec,
      mode,
      lang,
      now: props.now ? new Date(props.now) : null,
      timezone: props.timezone ?? "UTC",
      tokens,
      editing: mode === "editor" ? (props.editing ?? null) : null,
      selectedBlockId: props.selectedBlockId ?? null,
      selectedItemId: props.selectedItemId ?? null,
      highlightBlockIds: new Set(highlight ?? []),
      items: buildItemIndex(doc),
      sections: new Map(doc.sections.map((section, index) => [section.id, { section, index }])),
      logoUrl: props.logoUrl ?? null,
      qrCode: props.qrCode ?? null,
      cropMarks: mode === "print" && Boolean(props.cropMarks),
      showGuides: props.guides ?? { bleed: true, safe: true },
      watermark: Boolean(props.watermark),
    }),
    [doc, spec, mode, lang, props.now, props.timezone, tokens, props.editing, props.selectedBlockId, props.selectedItemId, highlight, props.logoUrl, props.qrCode, props.cropMarks, props.guides, props.watermark],
  );

  // Kept in a ref so a new callback identity does not re-run the measurement pass.
  const onReportRef = useRef(onReport);
  useEffect(() => {
    onReportRef.current = onReport;
  }, [onReport]);

  useEffect(() => {
    if (!onReportRef.current && !signalReady) return;
    let cancelled = false;
    if (signalReady) publishRenderState({ status: "pending", fontsLoaded: false, report: null });
    void (async () => {
      const fontsLoaded = await waitForFonts(specFontFamilies(spec));
      await nextFrames();
      const root = rootRef.current;
      if (cancelled || !root) return;
      await waitForMatrices(root);
      await nextFrames();
      if (cancelled || !rootRef.current) return;
      const measures = mode === "qr" ? [] : measurePages(rootRef.current);
      const report = buildReport(measures, fontsLoaded, []);
      onReportRef.current?.(report, measures);
      if (signalReady) publishRenderState({ status: "ready", fontsLoaded, report });
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, spec, mode, lang, signalReady]);

  const texture = spec.archetype === "chalkboard" ? chalkDust() : textureBackground(spec.tokens.backgroundTexture, tokens.dark);
  const style = { ...tokens.vars, ...(texture ? { "--ms-texture": texture } : {}) } as CSSProperties;
  const classes = [
    "ms-root",
    `ms-mode-${mode}`,
    `ms-arch-${spec.archetype}`,
    `ms-format-${spec.format}`,
    `ms-case-${spec.tokens.textCase}`,
    `ms-density-${spec.tokens.density}`,
    `ms-price-${spec.tokens.pricePlacement}`,
    tokens.dark ? "ms-dark" : "ms-light",
    props.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const useMobile = mode === "qr" || spec.archetype === "mobile_stack";
  const geometry = pageGeometry(spec, mode, props.cropMarks);

  return (
    <RenderContext.Provider value={ctx}>
      <div ref={rootRef} className={classes} style={style} lang={lang} dir={textDirection(lang)} data-ms-root>
        {mode === "print" ? <style>{`@page { size: ${geometry.sheet.width}mm ${geometry.sheet.height}mm; margin: 0; }`}</style> : null}
        {useMobile ? (
          mode === "qr" ? (
            <MobileStack />
          ) : (
            <div className="ms-phone" data-ms-page={spec.pages[0]?.id ?? "mobile"}>
              <div className="ms-phone__content" data-ms-content>
                <MobileStack />
              </div>
            </div>
          )
        ) : (
          <div className="ms-pages">
            {spec.pages.map((page, index) => (
              <PageView key={page.id} pageId={page.id} index={index} geometry={geometry}>
                <PageContent page={page} index={index} />
              </PageView>
            ))}
          </div>
        )}
      </div>
    </RenderContext.Provider>
  );
}
