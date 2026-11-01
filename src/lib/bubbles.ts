export interface BubbleIn {
  id: string;
  /** money in the place; below zero counts as nothing */
  value: number;
}

export interface Bubble {
  id: string;
  x: number;
  y: number;
  r: number;
}

const GAP = 5;

/**
 * Circles sized by area (so twice the money is twice the area, not twice the width), packed into a
 * `width` x `height` box with no overlap: biggest first, each one at the free spot nearest the centre.
 * Empty places keep a small visible circle so they can still be tapped. Deterministic.
 */
export function packBubbles(items: BubbleIn[], width: number, height: number): Bubble[] {
  if (!items.length || width <= 0 || height <= 0) return [];
  const sorted = items.map((i) => ({ id: i.id, v: Math.max(0, i.value) })).sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  const max = sorted[0].v;
  const minR = Math.min(26, Math.min(width, height) / 6);
  const cx = width / 2;
  const cy = height / 2;

  // how big the biggest may be: its diameter never beats the shorter side
  const cap = Math.min(width, height) / 2;
  let scale = max > 0 ? Math.min(cap / Math.sqrt(max), Math.sqrt((width * height * 0.5) / (Math.PI * sorted.reduce((s, i) => s + i.v, 0)))) : 0;

  for (let attempt = 0; attempt < 60; attempt++) {
    const placed = tryPack(sorted, scale, minR, width, height, cx, cy, max);
    if (placed) return placed;
    scale *= 0.92;
  }
  // always give an answer: a row of minimum circles (cannot happen with sane sizes, but never throw in render)
  return sorted.map((i, n) => ({ id: i.id, x: Math.min(width - minR, minR + n * minR * 2.2), y: cy, r: minR * 0.8 }));
}

function tryPack(sorted: { id: string; v: number }[], scale: number, minR: number, w: number, h: number, cx: number, cy: number, max: number): Bubble[] | null {
  const out: Bubble[] = [];
  for (const it of sorted) {
    const r = max > 0 ? Math.max(minR, Math.sqrt(it.v) * scale) : minR * 1.4;
    const spot = findSpot(out, r, w, h, cx, cy);
    if (!spot) return null;
    out.push({ id: it.id, x: spot.x, y: spot.y, r });
  }
  return out;
}

/** Spiral out from the centre in small steps and take the first position that fits. */
function findSpot(placed: Bubble[], r: number, w: number, h: number, cx: number, cy: number): { x: number; y: number } | null {
  if (!placed.length) return r * 2 <= Math.min(w, h) ? { x: cx, y: cy } : null;
  const step = Math.max(2, r / 6);
  const maxR = Math.hypot(w, h);
  for (let d = 0; d <= maxR; d += step) {
    const turns = Math.max(8, Math.round((2 * Math.PI * d) / step));
    for (let k = 0; k < turns; k++) {
      const a = (k / turns) * Math.PI * 2;
      const x = cx + Math.cos(a) * d * 1.15; // a little wider than tall: phones are portrait but the box is wide
      const y = cy + Math.sin(a) * d;
      if (x - r < 0 || x + r > w || y - r < 0 || y + r > h) continue;
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAP)) return { x, y };
    }
  }
  return null;
}
