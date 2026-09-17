import { MenuRenderer, pageGeometry, PX_PER_MM, type RenderMode } from "@menu-studio/renderer";
import type { LayoutSpec, MenuDocument, OverflowReport } from "@menu-studio/shared";
import { useMemo } from "react";

/** The real renderer, scaled to a fixed pixel width. Used for thumbnails and galleries. */
export function MenuPreview({
  document,
  spec,
  width,
  mode = "png",
  firstPageOnly = true,
  lang,
  onReport,
  className,
}: {
  document: MenuDocument;
  spec: LayoutSpec;
  width: number;
  mode?: RenderMode;
  firstPageOnly?: boolean;
  lang?: string;
  onReport?: (report: OverflowReport) => void;
  className?: string;
}) {
  const shown = useMemo(() => (firstPageOnly && spec.pages.length > 1 ? { ...spec, pages: spec.pages.slice(0, 1) } : spec), [spec, firstPageOnly]);
  const mobile = spec.format === "MOBILE" || spec.archetype === "mobile_stack";
  const geometry = pageGeometry(spec, mode);
  const naturalWidth = mobile ? 390 : geometry.sheet.width * PX_PER_MM;
  const pages = firstPageOnly ? 1 : spec.pages.length;
  const naturalHeight = mobile ? 780 : geometry.sheet.height * PX_PER_MM * pages + (mode === "editor" ? (pages - 1) * 14 * PX_PER_MM : 0);
  const scale = width / naturalWidth;

  return (
    <div className={className} style={{ width, height: naturalHeight * scale, overflow: "hidden", position: "relative" }}>
      <div style={{ width: naturalWidth, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }} aria-hidden>
        <MenuRenderer document={document} spec={shown} mode={mode === "qr" ? "qr" : mobile ? "editor" : mode} {...(lang ? { lang } : {})} {...(onReport ? { onReport } : {})} />
      </div>
    </div>
  );
}
