import type { Jar } from './types';

export interface JarStatus {
  /** 0..1 fill shown by the art: money left (spend) or progress (save) */
  fill: number;
  /** spend jar at 85% or more of its limit used */
  low: boolean;
  over: boolean;
  /** 0..100+ share of the limit used (spend) or of the target reached (save) */
  pct: number;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** `funded`: money has been put into the jar at least once. A new, empty spending jar is not "used up". */
export function jarStatus(jar: Jar, balance: number, funded = true): JarStatus {
  const ratio = jar.goal > 0 ? balance / jar.goal : 0;
  if (jar.kind === 'spend') {
    if (!funded && balance === 0) return { fill: 0, low: false, over: false, pct: 0 };
    const usedPct = Math.round((1 - ratio) * 100);
    return { fill: clamp(ratio), low: ratio <= 0.15, over: balance < 0, pct: Math.max(0, usedPct) };
  }
  return { fill: clamp(ratio), low: false, over: false, pct: Math.max(0, Math.round(ratio * 100)) };
}

/** Whole months from now to the due date, at least 1. */
export function monthsLeft(due: string, now = new Date()): number {
  const d = new Date(due);
  const m = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(1, m);
}
