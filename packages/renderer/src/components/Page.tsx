import { FrameCorners } from "@menu-studio/design-system/react";
import type { ReactNode } from "react";
import { useRenderContext } from "../context.tsx";
import type { PageGeometry } from "../geometry.ts";

const mm = (n: number) => `${Math.round(n * 1000) / 1000}mm`;

function CropMarks({ g }: { g: PageGeometry }) {
  const length = 5;
  const offset = g.bleed + 1;
  const t = g.trimOffset;
  const w = g.sheet.width;
  const h = g.sheet.height;
  const right = t + g.trim.width;
  const bottom = t + g.trim.height;
  const lines: [number, number, number, number][] = [
    // top-left
    [t - offset - length, t, t - offset, t],
    [t, t - offset - length, t, t - offset],
    // top-right
    [right + offset, t, right + offset + length, t],
    [right, t - offset - length, right, t - offset],
    // bottom-left
    [t - offset - length, bottom, t - offset, bottom],
    [t, bottom + offset, t, bottom + offset + length],
    // bottom-right
    [right + offset, bottom, right + offset + length, bottom],
    [right, bottom + offset, right, bottom + offset + length],
  ];
  return (
    <svg className="ms-cropmarks" viewBox={`0 0 ${w} ${h}`} width={mm(w)} height={mm(h)} aria-hidden>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth={0.09} />
      ))}
    </svg>
  );
}

export interface PageViewProps {
  pageId: string;
  index: number;
  geometry: PageGeometry;
  children: ReactNode;
  /** Mirror of the content for the upside-down face of a table tent. */
  mirrorChildren?: ReactNode;
}

export function PageView({ pageId, index, geometry: g, children, mirrorChildren }: PageViewProps) {
  const ctx = useRenderContext();
  const editor = ctx.mode === "editor";
  const ornament = ctx.spec.tokens.ornamentStyle;
  const tent: number | null = g.horizontalFolds?.[0] ?? null;

  const contentStyle = (height: number) =>
    g.panels
      ? { left: 0, right: 0, top: mm(g.contentInset), height: mm(height - g.contentInset * 2) }
      : { left: mm(g.contentInset), right: mm(g.contentInset), top: mm(g.contentInset), height: mm(height - g.contentInset * 2) };

  return (
    <section
      className={`ms-page${editor ? " ms-page--editor" : ""}`}
      data-ms-page={pageId}
      data-ms-page-index={index}
      style={{ width: mm(g.sheet.width), height: mm(g.sheet.height) }}
      onClick={editor ? () => ctx.editing?.selectBlock(null) : undefined}
    >
      <div
        className="ms-page__bg"
        style={{ left: mm(g.slug), top: mm(g.slug), width: mm(g.trim.width + g.bleed * 2), height: mm(g.trim.height + g.bleed * 2) }}
      />
      <div className="ms-page__trim" style={{ left: mm(g.trimOffset), top: mm(g.trimOffset), width: mm(g.trim.width), height: mm(g.trim.height) }}>
        {tent !== null ? (
          <>
            <div className="ms-face ms-face--mirror" style={{ height: mm(tent) }}>
              <FrameCorners style={ornament} />
              <div className="ms-page__content" style={contentStyle(tent)}>
                {mirrorChildren ?? children}
              </div>
            </div>
            <div className="ms-face" style={{ top: mm(tent), height: mm(g.trim.height - tent) }}>
              <FrameCorners style={ornament} />
              <div className="ms-page__content" data-ms-content style={contentStyle(g.trim.height - tent)}>
                {children}
              </div>
            </div>
          </>
        ) : (
          <>
            <FrameCorners style={ornament} />
            <div
              className={`ms-page__content${g.panels ? " ms-page__content--panels" : ""}`}
              data-ms-content
              style={{
                ...contentStyle(g.trim.height),
                ...(g.panels ? { gridTemplateColumns: g.panels.map(mm).join(" "), ["--ms-panel-pad" as string]: mm(g.contentInset) } : {}),
              }}
            >
              {children}
            </div>
          </>
        )}
        {ctx.watermark ? <div className="ms-watermark">Made with Menu Studio</div> : null}
        {editor && ctx.showGuides.safe && g.safe > 0 ? <div className="ms-guide ms-guide--safe" style={{ inset: mm(g.safe) }} aria-hidden /> : null}
        {editor && g.panels
          ? g.panels.slice(0, -1).map((_, i) => {
              const x = g.panels?.slice(0, i + 1).reduce((a, b) => a + b, 0) ?? 0;
              return <div key={i} className="ms-guide ms-guide--fold-v" style={{ left: mm(x) }} aria-hidden />;
            })
          : null}
        {editor && tent !== null ? <div className="ms-guide ms-guide--fold-h" style={{ top: mm(tent) }} aria-hidden /> : null}
      </div>
      {editor && ctx.showGuides.bleed && g.bleed > 0 ? (
        <div className="ms-guide ms-guide--bleed" style={{ inset: 0, borderWidth: mm(g.bleed) }} aria-hidden />
      ) : null}
      {ctx.cropMarks && g.slug > 0 ? <CropMarks g={g} /> : null}
    </section>
  );
}
