import { dateKey } from './recurring';
import { monthReport, prevMonth } from './report';
import { spendByTag } from './tags';
import type { Jar, Tx } from './types';

export interface MonthPoint {
  ym: string;
  /** "T10" or "T1/27" for January, so a year boundary is visible on the axis */
  label: string;
  spent: number;
  income: number;
  saved: number;
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `T1/${String(y).slice(2)}` : `T${m}`;
};

/** The last `n` months ending with the current one, oldest first. Spending nets out friends paying back shared bills. */
export function monthSeries(txs: Tx[], jars: Jar[], n: number, now = new Date()): MonthPoint[] {
  const months: string[] = [];
  let ym = dateKey(now).slice(0, 7);
  for (let i = 0; i < n; i++) {
    months.unshift(ym);
    ym = prevMonth(ym);
  }
  return months.map((m) => {
    const r = monthReport(txs, jars, m, now);
    return { ym: m, label: monthLabel(m), spent: r.spent, income: r.income, saved: r.saved };
  });
}

export interface JarTrend {
  id: string;
  name: string;
  /** spending per month, same months as the series */
  months: number[];
  total: number;
  /** average over the months before the current one that had any spending in this jar; null without history */
  avg: number | null;
  /** this month against that average, in percent */
  deltaPct: number | null;
}

/** Spending per jar per month, biggest total first. Jars with no spending in the window are left out. */
export function jarTrends(allTxs: Tx[], jars: Jar[], series: MonthPoint[]): JarTrend[] {
  const index = new Map(series.map((p, i) => [p.ym, i]));
  const by = new Map<string, number[]>();
  for (const t of allTxs) {
    if (t.deleted || t.type !== 'expense' || !t.from || t.from === 'wallet') continue;
    const i = index.get(dateKey(new Date(t.ts)).slice(0, 7));
    if (i === undefined) continue;
    const row = by.get(t.from) ?? series.map(() => 0);
    row[i] += t.amount;
    by.set(t.from, row);
  }
  const out: JarTrend[] = [];
  for (const [id, months] of by) {
    const jar = jars.find((j) => j.id === id);
    const past = months.slice(0, -1).filter((x) => x > 0);
    const avg = past.length ? Math.round(past.reduce((s, x) => s + x, 0) / past.length) : null;
    const cur = months[months.length - 1];
    out.push({
      id,
      name: jar?.name ?? 'Hũ đã đóng',
      months,
      total: months.reduce((s, x) => s + x, 0),
      avg,
      deltaPct: avg ? Math.round(((cur - avg) / avg) * 100) : null,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

export interface YearSummary {
  year: number;
  spent: number;
  income: number;
  saved: number;
  /** months of the year that have passed (12 for a past year) */
  months: number;
  avgSpent: number;
  biggestMonth: { label: string; spent: number } | null;
  topJars: { name: string; amount: number }[];
  topTags: { tag: string; amount: number }[];
  hasData: boolean;
}

export function yearSummary(txs: Tx[], jars: Jar[], year: number, now = new Date()): YearSummary {
  const months = year < now.getFullYear() ? 12 : year === now.getFullYear() ? now.getMonth() + 1 : 0;
  const reports = Array.from({ length: months }, (_, i) => monthReport(txs, jars, `${year}-${String(i + 1).padStart(2, '0')}`, now));
  const spent = reports.reduce((s, r) => s + r.spent, 0);
  const income = reports.reduce((s, r) => s + r.income, 0);
  const saved = reports.reduce((s, r) => s + r.saved, 0);
  const biggest = reports.reduce<(typeof reports)[number] | null>((b, r) => (r.spent > (b?.spent ?? 0) ? r : b), null);

  const inYear = txs.filter((t) => !t.deleted && new Date(t.ts).getFullYear() === year);
  const jarMap = new Map<string, number>();
  for (const t of inYear) {
    if (t.type !== 'expense') continue;
    const name = !t.from || t.from === 'wallet' ? 'Ví tổng' : (jars.find((j) => j.id === t.from)?.name ?? 'Hũ đã đóng');
    jarMap.set(name, (jarMap.get(name) ?? 0) + t.amount);
  }
  return {
    year,
    spent,
    income,
    saved,
    months,
    avgSpent: months ? Math.round(spent / months) : 0,
    biggestMonth: biggest ? { label: `Tháng ${biggest.month}`, spent: biggest.spent } : null,
    topJars: [...jarMap]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount })),
    topTags: spendByTag(inYear).slice(0, 5),
    hasData: reports.some((r) => r.hasData),
  };
}

/** Years that have at least one line, newest first (always includes this year). */
export function yearsWithData(txs: Tx[], now = new Date()): number[] {
  const set = new Set(txs.filter((t) => !t.deleted).map((t) => new Date(t.ts).getFullYear()));
  set.add(now.getFullYear());
  return [...set].sort((a, b) => b - a);
}
