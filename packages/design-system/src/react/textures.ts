import type { BackgroundTexture } from "../catalog/index.ts";

function svgData(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const noise = (frequency: number, opacity: number, octaves = 3) =>
  svgData(
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${opacity} 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
  );

const linen = (opacity: number) =>
  svgData(
    `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><path d='M0 0.5H6M0.5 0V6' stroke='black' stroke-opacity='${opacity}' stroke-width='0.6'/></svg>`,
  );

/**
 * Lightweight CSS textures (a few hundred bytes each, never raster images).
 * Returns a background-image value, or null for "none".
 */
export function textureBackground(texture: BackgroundTexture, dark: boolean): string | null {
  switch (texture) {
    case "none":
      return null;
    case "paper":
      return noise(0.9, dark ? 0.1 : 0.07);
    case "linen":
      return `${linen(dark ? 0.12 : 0.05)}, ${noise(0.8, dark ? 0.06 : 0.04, 2)}`;
    case "kraft":
      return `${noise(0.55, dark ? 0.16 : 0.12, 4)}, ${noise(1.8, 0.05, 2)}`;
  }
}

/** Chalk dust for the chalkboard archetype. */
export function chalkDust(): string {
  return `${noise(0.6, 0.12, 4)}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.06), transparent 60%)`;
}
