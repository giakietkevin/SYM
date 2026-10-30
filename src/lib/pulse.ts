import type { Jar, Tx } from './types';

const DAY = 86_400_000;

/** Monday 00:00 (local) of the week containing `d`. Vietnam counts Monday as the first day. */
export function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

export interface Pulse {
  /** Monday 00:00 of this week, ms */
  start: number;
  /** 0 = Monday … 6 = Sunday */
  todayIndex: number;
  spent: number;
  /** last week's spending up to the same weekday and time, so a half week is not compared with a whole one */
  prevSpent: number;
  /** spending per weekday, Monday first */
  perDay: number[];
  /** distinct days this week with at least one line */
  loggedDays: number;
  /** money put into saving jars this week (from outside the saving jars) */
  savedIn: number;
  /** money taken out of saving jars this week */
  pulledOut: number;
  saveJars: number;
  /** saving jars nothing was taken from this week */
  protectedJars: number;
  /** spending by jar, largest first */
  byJar: { jar: Jar; amount: number }[];
  biggest: Tx | null;
  /** any line this week or in the comparison window: otherwise there is nothing to say */
  hasActivity: boolean;
}

/** Everything the Weekly Pulse shows, from the ledger alone. `jars` are the jars that still exist. */
export function computePulse(allTxs: Tx[], jars: Jar[], now = new Date()): Pulse {
  const txs = allTxs.filter((t) => !t.deleted);
  const start = weekStart(now).getTime();
  const next = start + 7 * DAY;
  const todayIndex = Math.min(6, Math.floor((now.getTime() - start) / DAY));
  const elapsed = now.getTime() - start;
  const prevStart = start - 7 * DAY;

  const saveIds = new Set(jars.filter((j) => j.kind === 'save').map((j) => j.id));
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  const days = new Set<number>();
  const byJarMap = new Map<string, number>();
  const pulledFrom = new Set<string>();
  let spent = 0;
  let prevSpent = 0;
  let hasPrev = false;
  let savedIn = 0;
  let pulledOut = 0;
  let biggest: Tx | null = null;

  for (const t of txs) {
    if (t.ts >= prevStart && t.ts <= prevStart + elapsed) {
      hasPrev = true;
      if (t.type === 'expense') prevSpent += t.amount;
    }
    if (t.ts < start || t.ts >= next) continue;

    days.add(Math.floor((t.ts - start) / DAY));
    const toSave = !!t.to && saveIds.has(t.to);
    const fromSave = !!t.from && saveIds.has(t.from);
    if (toSave && !fromSave) savedIn += t.amount;
    if (fromSave && !toSave) {
      pulledOut += t.amount;
      pulledFrom.add(t.from!);
    }
    if (t.type === 'expense') {
      spent += t.amount;
      perDay[Math.floor((t.ts - start) / DAY)] += t.amount;
      if (t.from) byJarMap.set(t.from, (byJarMap.get(t.from) ?? 0) + t.amount);
      if (!biggest || t.amount > biggest.amount) biggest = t;
    }
  }

  const byJar = [...byJarMap.entries()]
    .map(([id, amount]) => ({ jar: jars.find((j) => j.id === id), amount }))
    .filter((x): x is { jar: Jar; amount: number } => !!x.jar)
    .sort((a, b) => b.amount - a.amount);

  return {
    start,
    todayIndex,
    spent,
    prevSpent,
    perDay,
    loggedDays: days.size,
    savedIn,
    pulledOut,
    saveJars: saveIds.size,
    protectedJars: [...saveIds].filter((id) => !pulledFrom.has(id)).length,
    byJar,
    biggest,
    hasActivity: days.size > 0 || hasPrev,
  };
}

export type PulseKind =
  | { kind: 'pulled'; amount: number }
  | { kind: 'shielded'; saved: number }
  | { kind: 'down'; pct: number }
  | { kind: 'up'; pct: number }
  | { kind: 'nolog' }
  | { kind: 'zero' }
  | { kind: 'steady'; spent: number };

/**
 * One headline for the week, chosen by what matters most: a withdrawal from savings first, then
 * good news about savings, then the spending trend. Numbers come from the same Pulse the card shows.
 */
export function pulseKind(p: Pulse): PulseKind {
  if (p.pulledOut > 0) return { kind: 'pulled', amount: p.pulledOut };
  if (p.saveJars > 0 && p.savedIn > 0) return { kind: 'shielded', saved: p.savedIn };
  // nothing logged is not a saving: never celebrate "spending down" when the week is simply empty
  if (p.loggedDays === 0) return { kind: 'nolog' };
  if (p.prevSpent > 0 && p.spent < p.prevSpent) {
    const pct = Math.round((1 - p.spent / p.prevSpent) * 100);
    if (pct >= 5) return { kind: 'down', pct };
  }
  if (p.prevSpent > 0 && p.spent > p.prevSpent * 1.2) return { kind: 'up', pct: Math.round((p.spent / p.prevSpent - 1) * 100) };
  if (p.spent === 0) return { kind: 'zero' };
  return { kind: 'steady', spent: p.spent };
}
