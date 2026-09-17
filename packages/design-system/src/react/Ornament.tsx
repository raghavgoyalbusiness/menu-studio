import type { OrnamentStyle } from "../catalog/index.ts";

const CENTERPIECES: Record<Exclude<OrnamentStyle, "none" | "hairline" | "double_rule">, { viewBox: string; d: string; filled?: boolean }> = {
  geometric: { viewBox: "0 0 24 12", d: "M12 1 L17 6 L12 11 L7 6 Z M2 6 H5 M19 6 H22", filled: false },
  botanical: {
    viewBox: "0 0 40 14",
    d: "M4 7 H36 M20 7 C17 3 13 2 10 3 C12 6 16 7 20 7 Z M20 7 C23 3 27 2 30 3 C28 6 24 7 20 7 Z M20 7 C18 9.5 15.5 11 12.5 11 M20 7 C22 9.5 24.5 11 27.5 11",
  },
  deco: {
    viewBox: "0 0 40 14",
    d: "M20 2 L26 7 L20 12 L14 7 Z M20 5 L22.5 7 L20 9 L17.5 7 Z M6 7 H12 M28 7 H34 M9 4.5 V9.5 M31 4.5 V9.5",
  },
};

export interface DividerProps {
  style: OrnamentStyle;
  className?: string;
}

/** Horizontal divider. Lines flex; the centrepiece keeps its proportions. */
export function Divider({ style, className }: DividerProps) {
  if (style === "none") return null;
  const cls = `ms-divider ms-divider--${style}${className ? ` ${className}` : ""}`;
  if (style === "hairline") return <div className={cls} role="separator" />;
  if (style === "double_rule") {
    return (
      <div className={cls} role="separator">
        <span />
        <span />
      </div>
    );
  }
  const piece = CENTERPIECES[style];
  return (
    <div className={cls} role="separator">
      <span className="ms-divider__line" />
      <svg viewBox={piece.viewBox} className="ms-divider__piece" fill="none" stroke="currentColor" strokeWidth={1} aria-hidden>
        <path d={piece.d} />
      </svg>
      <span className="ms-divider__line" />
    </div>
  );
}

/** Page corner flourishes for rich ornament styles. */
export function FrameCorners({ style }: { style: OrnamentStyle }) {
  if (style !== "deco" && style !== "geometric" && style !== "botanical") return null;
  const d =
    style === "deco"
      ? "M2 30 V2 H30 M7 30 V7 H30 M2 2 L12 12 M12 7 V12 H7"
      : style === "geometric"
        ? "M2 22 V2 H22 M8 8 L14 8 L14 14 L8 14 Z"
        : "M2 26 C2 12 12 2 26 2 M6 20 C9 18 10 14 9 10 M20 6 C18 9 14 10 10 9";
  return (
    <div className={`ms-corners ms-corners--${style}`} aria-hidden>
      {["tl", "tr", "bl", "br"].map((pos) => (
        <svg key={pos} viewBox="0 0 32 32" className={`ms-corner ms-corner--${pos}`} fill="none" stroke="currentColor" strokeWidth={0.9}>
          <path d={d} />
        </svg>
      ))}
    </div>
  );
}
