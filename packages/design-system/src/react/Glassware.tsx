import { useId } from "react";
import type { GlasswareType } from "../catalog/index.ts";

interface GlassShape {
  /** Stroke paths, drawn over the liquid. */
  outline: string;
  /** Closed interior region the liquid is clipped to. */
  bowl: string;
  liquidTop: number;
  liquidBottom: number;
}

const STEM_FOOT = "M24 {y} V41 M16 42 H32";
const stem = (y: number) => STEM_FOOT.replace("{y}", String(y));

export const GLASS_SHAPES: Record<GlasswareType, GlassShape> = {
  coupe: {
    bowl: "M8 13 H40 C40 21 33.5 26 24 26 C14.5 26 8 21 8 13 Z",
    outline: `M8 13 H40 C40 21 33.5 26 24 26 C14.5 26 8 21 8 13 Z ${stem(26)}`,
    liquidTop: 14.5,
    liquidBottom: 26,
  },
  martini: {
    bowl: "M7 10 H41 L24 27 Z",
    outline: `M7 10 H41 L24 27 Z ${stem(27)}`,
    liquidTop: 11.5,
    liquidBottom: 27,
  },
  nick_and_nora: {
    bowl: "M13 9 H35 C35 19 31.5 25.5 24 25.5 C16.5 25.5 13 19 13 9 Z",
    outline: `M13 9 H35 C35 19 31.5 25.5 24 25.5 C16.5 25.5 13 19 13 9 Z ${stem(25.5)}`,
    liquidTop: 11,
    liquidBottom: 25.5,
  },
  rocks: {
    bowl: "M11.5 17 H36.5 L35 36 H13 Z",
    outline: "M11 16 H37 L35.4 38.6 C35.3 39.4 34.6 40 33.8 40 H14.2 C13.4 40 12.7 39.4 12.6 38.6 Z M13.2 36 H34.8",
    liquidTop: 19,
    liquidBottom: 36,
  },
  double_rocks: {
    bowl: "M9.5 13 H38.5 L37 36 H11 Z",
    outline: "M9 12 H39 L37.4 38.6 C37.3 39.4 36.6 40 35.8 40 H12.2 C11.4 40 10.7 39.4 10.6 38.6 Z M11.2 36 H36.8",
    liquidTop: 15,
    liquidBottom: 36,
  },
  highball: {
    bowl: "M14.5 8 H33.5 L32.6 38 H15.4 Z",
    outline: "M14 7 H34 L33 40.6 C33 41.4 32.3 42 31.5 42 H16.5 C15.7 42 15 41.4 15 40.6 Z M15.4 38 H32.6",
    liquidTop: 10,
    liquidBottom: 38,
  },
  collins: {
    bowl: "M16.5 5 H31.5 L30.8 39 H17.2 Z",
    outline: "M16 4 H32 L31.2 41.6 C31.2 42.4 30.6 43 29.8 43 H18.2 C17.4 43 16.8 42.4 16.8 41.6 Z M17.2 39 H30.8",
    liquidTop: 7,
    liquidBottom: 39,
  },
  wine: {
    bowl: "M13.5 7 C12.8 10 12.5 13.5 12.5 16.5 C12.5 23 17.5 28 24 28 C30.5 28 35.5 23 35.5 16.5 C35.5 13.5 35.2 10 34.5 7 Z",
    outline: `M13.5 7 C12.8 10 12.5 13.5 12.5 16.5 C12.5 23 17.5 28 24 28 C30.5 28 35.5 23 35.5 16.5 C35.5 13.5 35.2 10 34.5 7 Z ${stem(28)}`,
    liquidTop: 13,
    liquidBottom: 28,
  },
  flute: {
    bowl: "M19 4 H29 C29.6 12 29.2 20 27.3 25 C26.6 26.8 25.4 28 24 28 C22.6 28 21.4 26.8 20.7 25 C18.8 20 18.4 12 19 4 Z",
    outline: "M19 4 H29 C29.6 12 29.2 20 27.3 25 C26.6 26.8 25.4 28 24 28 C22.6 28 21.4 26.8 20.7 25 C18.8 20 18.4 12 19 4 Z M24 28 V41 M18 42 H30",
    liquidTop: 8,
    liquidBottom: 28,
  },
  tiki: {
    bowl: "M13.5 9 H34.5 L33.2 39 H14.8 Z",
    outline:
      "M13 8 H35 L33.6 40.6 C33.6 41.4 32.9 42 32.1 42 H15.9 C15.1 42 14.4 41.4 14.4 40.6 Z M18 17 H22 M26 17 H30 M19 25 H29 M21 25 V29 M24 25 V29 M27 25 V29 M15.5 34 H32.5",
    liquidTop: 10,
    liquidBottom: 39,
  },
  copper_mug: {
    bowl: "M11.5 13 H32.5 L31.6 39 H12.4 Z",
    outline:
      "M11 12 H33 L32 40.6 C32 41.4 31.3 42 30.5 42 H13.5 C12.7 42 12 41.4 12 40.6 Z M33 17 H37 C38.7 17 40 18.3 40 20 V29 C40 30.7 38.7 32 37 32 H32.4",
    liquidTop: 15,
    liquidBottom: 39,
  },
  shot: {
    bowl: "M17.5 19 H30.5 L29.3 35 H18.7 Z",
    outline: "M17 18 H31 L29.6 38.8 C29.5 39.5 28.9 40 28.2 40 H19.8 C19.1 40 18.5 39.5 18.4 38.8 Z M18.7 35 H29.3",
    liquidTop: 21,
    liquidBottom: 35,
  },
  teacup: {
    bowl: "M9.5 18 H34.5 C34.5 26.5 29.8 32 22 32 C14.2 32 9.5 26.5 9.5 18 Z",
    outline:
      "M9.5 18 H34.5 C34.5 26.5 29.8 32 22 32 C14.2 32 9.5 26.5 9.5 18 Z M34.3 21 C38.5 21 40.5 23 40 25.6 C39.5 28.2 36.8 29.3 33.4 28.6 M5 36.5 C9 38.6 35 38.6 39 36.5",
    liquidTop: 19.5,
    liquidBottom: 32,
  },
  coffee_cup: {
    bowl: "M10.5 15 H31.5 V35 C31.5 38.3 28.8 41 25.5 41 H16.5 C13.2 41 10.5 38.3 10.5 35 Z",
    outline:
      "M10.5 15 H31.5 V35 C31.5 38.3 28.8 41 25.5 41 H16.5 C13.2 41 10.5 38.3 10.5 35 Z M31.5 19 H35 C37.8 19 40 21.2 40 24 V27 C40 29.8 37.8 32 35 32 H31.5 M16 5.5 C14.6 7.3 17.4 8.7 16 10.5 M21 5.5 C19.6 7.3 22.4 8.7 21 10.5 M26 5.5 C24.6 7.3 27.4 8.7 26 10.5",
    liquidTop: 17,
    liquidBottom: 41,
  },
  beer_pint: {
    bowl: "M12.5 7 H35.5 L34.2 20 L35 24 L33.3 40 H14.7 L13 24 L13.8 20 Z",
    outline: "M12 6 H36 L34.6 20 L35.4 24 L33.6 41.2 C33.5 41.7 33.1 42 32.6 42 H15.4 C14.9 42 14.5 41.7 14.4 41.2 L12.6 24 L13.4 20 Z",
    liquidTop: 9,
    liquidBottom: 40,
  },
};

export interface GlassIconProps {
  type: GlasswareType;
  /** Liquid colour; omitted means an empty glass. */
  colorHex?: string | undefined;
  /** 0..1 fill level. */
  fill?: number;
  size?: string;
  strokeWidth?: number;
  title?: string;
}

export function GlassIcon({ type, colorHex, fill = 0.72, size = "1em", strokeWidth = 1.5, title }: GlassIconProps) {
  const shape = GLASS_SHAPES[type];
  const clipId = `glass-${useId().replace(/:/g, "")}`;
  const level = Math.max(0, Math.min(1, fill));
  const top = shape.liquidBottom - (shape.liquidBottom - shape.liquidTop) * level;
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      className="ms-glass"
    >
      {title ? <title>{title}</title> : null}
      {colorHex && level > 0 ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={shape.bowl} />
            </clipPath>
          </defs>
          <rect x="0" y={top} width="48" height={48 - top} fill={colorHex} stroke="none" clipPath={`url(#${clipId})`} opacity={0.9} />
        </>
      ) : null}
      <path d={shape.outline} />
    </svg>
  );
}
