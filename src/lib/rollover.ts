import type { Jar } from './types';

/** "2026-11" for the month of `d`. Sorts correctly as text. */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * top:  bring the jar back to its monthly limit (leftover counts; surplus goes back to the wallet).
 * add:  keep the leftover and add one more full limit on top.
 * skip: leave this jar alone.
 */
export type Refill = 'top' | 'add' | 'skip';

export interface RefillStep {
  jar: Jar;
  mode: Refill;
  before: number;
  /** wanted from the wallet (top / add) */
  need: number;
  /** + wallet -> jar, - jar -> wallet */
  move: number;
  after: number;
  /** the wallet could not cover the whole refill */
  short: boolean;
}

/**
 * Money returned by jars holding more than their limit is available first, then jars are
 * refilled in order until the wallet runs out. Pure: it only plans, the caller writes the ledger.
 */
export function planRefill(jars: Jar[], bal: Record<string, number>, wallet: number, modes: Record<string, Refill>) {
  const spend = jars.filter((j) => j.kind === 'spend');
  const steps: RefillStep[] = spend.map((jar) => {
    const before = bal[jar.id] ?? 0;
    const mode = modes[jar.id] ?? 'top';
    const surplus = mode === 'top' && before > jar.goal ? before - jar.goal : 0;
    const need = mode === 'skip' ? 0 : mode === 'add' ? jar.goal : Math.max(0, jar.goal - before);
    return { jar, mode, before, need, move: -surplus, after: before - surplus, short: false };
  });

  let avail = wallet + steps.reduce((s, x) => s - x.move, 0);
  for (const s of steps) {
    if (s.need <= 0) continue;
    const give = Math.min(s.need, avail);
    avail -= give;
    s.move = give;
    s.after = s.before + give;
    s.short = give < s.need;
  }
  return { steps, walletAfter: avail };
}
