import { dateKey } from './recurring';
import type { Jar, Tx } from './types';

export interface MonthReport {
  /** "2026-10" */
  ym: string;
  year: number;
  month: number;
  income: number;
  spent: number;
  /** spending in the month before, 0 if there was none */
  prevSpent: number;
  /** change in spending against the month before, in percent; null when there is nothing to compare with */
  deltaPct: number | null;
  /** put into saving jars from outside them, minus taken out */
  saved: number;
  top: { name: string; amount: number; pct: number }[];
  biggest: { note: string; amount: number } | null;
  daysLogged: number;
  /** days of the month that have passed (all of them for a finished month) */
  daysPassed: number;
  noSpendDays: number;
  headline: string;
  hasData: boolean;
}

const ymOf = (ts: number) => dateKey(new Date(ts)).slice(0, 7);

export const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
export const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Months (oldest first) that have at least one line, plus the current one. */
export function monthsWithData(txs: Tx[], now = new Date()): string[] {
  const set = new Set(txs.filter((t) => !t.deleted).map((t) => ymOf(t.ts)));
  set.add(dateKey(now).slice(0, 7));
  return [...set].sort();
}

export function monthReport(allTxs: Tx[], jars: Jar[], ym: string, now = new Date()): MonthReport {
  const txs = allTxs.filter((t) => !t.deleted);
  const [year, month] = ym.split('-').map(Number);
  const saveIds = new Set(jars.filter((j) => j.kind === 'save').map((j) => j.id));
  const name = new Map(jars.map((j) => [j.id, j.name]));
  const prev = prevMonth(ym);

  let income = 0;
  let spent = 0;
  let prevSpent = 0;
  let saved = 0;
  const days = new Set<string>();
  const spendDays = new Set<string>();
  const byJar = new Map<string, number>();
  let biggest: MonthReport['biggest'] = null;

  // what a friend pays back for a shared bill comes off the spending it was part of (in the jar it lands in).
  // Only bills: their debts are `<bill>:<n>`, so their payments are `debt:<bill>:<n>` (or `...#<part>`). A loan being
  // paid back (`debt:<id>`) is money coming home, not a refund of anything spent.
  const refund = (t: Tx) => t.type === 'income' && /^debt:[^:#]+:\d+(#|$)/.test(t.id);

  for (const t of txs) {
    const m = ymOf(t.ts);
    if (m === prev) {
      if (t.type === 'expense') prevSpent += t.amount;
      else if (refund(t)) prevSpent -= t.amount;
    }
    if (m !== ym) continue;
    const k = dateKey(new Date(t.ts));
    days.add(k);
    if (refund(t)) {
      spent -= t.amount;
      const label = t.to && t.to !== 'wallet' ? (name.get(t.to) ?? 'Hũ đã đóng') : 'Khác';
      byJar.set(label, (byJar.get(label) ?? 0) - t.amount);
      continue;
    }
    if (t.type === 'income') income += t.amount;
    if (t.type === 'expense') {
      spent += t.amount;
      spendDays.add(k);
      const label = t.from ? (name.get(t.from) ?? 'Hũ đã đóng') : 'Khác';
      byJar.set(label, (byJar.get(label) ?? 0) + t.amount);
      if (!biggest || t.amount > biggest.amount) biggest = { note: t.note || label, amount: t.amount };
    }
    if (t.to && saveIds.has(t.to) && !(t.from && saveIds.has(t.from))) saved += t.amount;
    if (t.from && saveIds.has(t.from) && !(t.to && saveIds.has(t.to))) saved -= t.amount;
  }

  spent = Math.max(0, spent);
  prevSpent = Math.max(0, prevSpent);
  const thisYm = dateKey(now).slice(0, 7);
  const inMonth = new Date(year, month, 0).getDate();
  const daysPassed = ym < thisYm ? inMonth : ym === thisYm ? now.getDate() : 0;
  const deltaPct = prevSpent > 0 ? Math.round(((spent - prevSpent) / prevSpent) * 100) : null;
  const top = [...byJar]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([n, amount]) => ({ name: n, amount, pct: spent > 0 ? Math.round((amount / spent) * 100) : 0 }));
  const hasData = days.size > 0;

  let headline: string;
  if (!hasData) headline = 'Tháng này chưa có giao dịch nào.';
  else if (spent === 0) headline = 'Cả tháng chưa chi một đồng nào.';
  else if (deltaPct !== null && deltaPct <= -10) headline = `Chi ít hơn tháng trước ${-deltaPct}%. Giỏi lắm!`;
  else if (deltaPct !== null && deltaPct >= 10) headline = `Chi nhiều hơn tháng trước ${deltaPct}%. Tháng sau chậm lại nhé.`;
  else if (deltaPct !== null) headline = 'Chi tiêu giữ ổn định so với tháng trước.';
  else headline = 'Tháng đầu tiên có số liệu. Cứ ghi đều nhé!';

  return {
    ym,
    year,
    month,
    income,
    spent,
    prevSpent,
    deltaPct,
    saved,
    top,
    biggest,
    daysLogged: days.size,
    daysPassed,
    noSpendDays: Math.max(0, daysPassed - spendDays.size),
    headline,
    hasData,
  };
}
