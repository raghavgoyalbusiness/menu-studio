export interface MatrixLabel {
  id: string;
  /** Anchor (the item's true coordinate) in mm within the plot. */
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  locked: boolean;
}

export interface ResolvedLabel {
  id: string;
  x: number;
  y: number;
  displacedMm: number;
}

export interface CollisionOptions {
  plotWidth: number;
  plotHeight: number;
  /** Minimum distance between label centres, mm. */
  minSpacingMm: number;
  /** Clear gap kept between label boxes, mm. */
  paddingMm: number;
  /** Relaxation iterations before the nearest-free-spot pass. */
  maxIterations: number;
}

export const DEFAULT_COLLISION: Omit<CollisionOptions, "plotWidth" | "plotHeight"> = {
  minSpacingMm: 8,
  paddingMm: 1,
  maxIterations: 50,
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Body {
  label: MatrixLabel;
  x: number;
  y: number;
}

function penetration(a: Body, b: Body, pad: number): { dx: number; dy: number } | null {
  const dx = (a.label.width + b.label.width) / 2 + pad - Math.abs(a.x - b.x);
  const dy = (a.label.height + b.label.height) / 2 + pad - Math.abs(a.y - b.y);
  return dx > 0 && dy > 0 ? { dx, dy } : null;
}

function conflicts(a: Body, b: Body, opts: CollisionOptions): boolean {
  return penetration(a, b, opts.paddingMm) !== null || Math.hypot(a.x - b.x, a.y - b.y) < opts.minSpacingMm;
}

function clampPoint(label: MatrixLabel, x: number, y: number, opts: CollisionOptions): { x: number; y: number } {
  const hw = Math.min(label.width / 2, opts.plotWidth / 2);
  const hh = Math.min(label.height / 2, opts.plotHeight / 2);
  return {
    x: Math.min(opts.plotWidth - hw, Math.max(hw, x)),
    y: Math.min(opts.plotHeight - hh, Math.max(hh, y)),
  };
}

function clamp(body: Body, opts: CollisionOptions): void {
  if (body.label.locked) return;
  const p = clampPoint(body.label, body.x, body.y, opts);
  body.x = p.x;
  body.y = p.y;
}

/** Count of overlapping label pairs (boxes including padding). */
export function countOverlaps(labels: readonly ResolvedLabel[], sizes: ReadonlyMap<string, { width: number; height: number }>, paddingMm = 0): number {
  let n = 0;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      const sa = a && sizes.get(a.id);
      const sb = b && sizes.get(b.id);
      if (!a || !b || !sa || !sb) continue;
      const ox = (sa.width + sb.width) / 2 + paddingMm - Math.abs(a.x - b.x);
      const oy = (sa.height + sb.height) / 2 + paddingMm - Math.abs(a.y - b.y);
      if (ox > 0.01 && oy > 0.01) n++;
    }
  }
  return n;
}

/**
 * Label collision avoidance for the flavor matrix.
 *
 * 1. Relaxation (up to maxIterations): conflicting pairs are pushed apart along the axis
 *    of least penetration, locked labels never move, and unlocked labels spring gently
 *    back toward their anchors so clusters spread symmetrically.
 * 2. Guarantee pass: any label still in conflict moves to the nearest free spot around
 *    its anchor (spiral search), so the result has no overlaps whenever space exists.
 *
 * Deterministic: bodies are processed in id order and ties separate along golden-angle
 * directions.
 */
export function resolveCollisions(labels: readonly MatrixLabel[], opts: CollisionOptions): ResolvedLabel[] {
  const bodies: Body[] = [...labels]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((label) => ({ label, x: label.anchorX, y: label.anchorY }));
  for (const body of bodies) clamp(body, opts);

  for (let iteration = 0; iteration < opts.maxIterations; iteration++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (!a || !b || (a.label.locked && b.label.locked) || !conflicts(a, b, opts)) continue;
        const o = penetration(a, b, opts.paddingMm);
        let nx: number;
        let ny: number;
        let push: number;
        const tie = GOLDEN_ANGLE * (i * 7 + j + 1);
        if (o) {
          if (o.dx < o.dy) {
            nx = Math.sign(b.x - a.x) || (Math.cos(tie) >= 0 ? 1 : -1);
            ny = 0;
            push = o.dx;
          } else {
            nx = 0;
            ny = Math.sign(b.y - a.y) || (Math.sin(tie) >= 0 ? 1 : -1);
            push = o.dy;
          }
        } else {
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          nx = distance ? (b.x - a.x) / distance : Math.cos(tie);
          ny = distance ? (b.y - a.y) / distance : Math.sin(tie);
          push = opts.minSpacingMm - distance;
        }
        const [shareA, shareB] = a.label.locked ? [0, 1] : b.label.locked ? [1, 0] : [0.5, 0.5];
        const step = push + 0.1;
        a.x -= nx * step * shareA;
        a.y -= ny * step * shareA;
        b.x += nx * step * shareB;
        b.y += ny * step * shareB;
        clamp(a, opts);
        clamp(b, opts);
        moved = true;
      }
    }
    if (!moved) break;
    for (const body of bodies) {
      if (body.label.locked) continue;
      body.x += (body.label.anchorX - body.x) * 0.04;
      body.y += (body.label.anchorY - body.y) * 0.04;
      clamp(body, opts);
    }
  }

  // Guarantee pass: keep the least-displaced labels, relocate the rest to the nearest free spot.
  const order = [...bodies].sort((a, b) => {
    if (a.label.locked !== b.label.locked) return a.label.locked ? -1 : 1;
    const da = Math.hypot(a.x - a.label.anchorX, a.y - a.label.anchorY);
    const db = Math.hypot(b.x - b.label.anchorX, b.y - b.label.anchorY);
    return da - db || (a.label.id < b.label.id ? -1 : 1);
  });
  const placed: Body[] = [];
  const maxRadius = Math.hypot(opts.plotWidth, opts.plotHeight);
  for (const body of order) {
    if (body.label.locked || !placed.some((p) => conflicts(body, p, opts))) {
      placed.push(body);
      continue;
    }
    let found = false;
    for (let radius = 1; radius <= maxRadius && !found; radius += 1) {
      const steps = Math.max(12, Math.round((2 * Math.PI * radius) / 2));
      for (let s = 0; s < steps; s++) {
        const angle = (s / steps) * Math.PI * 2;
        const candidate = clampPoint(body.label, body.label.anchorX + Math.cos(angle) * radius, body.label.anchorY + Math.sin(angle) * radius, opts);
        const probe: Body = { label: body.label, x: candidate.x, y: candidate.y };
        if (!placed.some((p) => conflicts(probe, p, opts))) {
          body.x = candidate.x;
          body.y = candidate.y;
          found = true;
          break;
        }
      }
    }
    placed.push(body);
  }

  return bodies.map((b) => ({
    id: b.label.id,
    x: round(b.x),
    y: round(b.y),
    displacedMm: round(Math.hypot(b.x - b.label.anchorX, b.y - b.label.anchorY)),
  }));
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Matrix coordinate (-1..1, y up) → plot mm (y down). */
export function coordToPlot(x: number, y: number, plotWidth: number, plotHeight: number): { x: number; y: number } {
  return { x: ((x + 1) / 2) * plotWidth, y: (1 - (y + 1) / 2) * plotHeight };
}

export function plotToCoord(px: number, py: number, plotWidth: number, plotHeight: number): { x: number; y: number } {
  const clamp1 = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 100) / 100));
  return { x: clamp1((px / plotWidth) * 2 - 1), y: clamp1(1 - (py / plotHeight) * 2) };
}
