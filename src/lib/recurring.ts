import { ledgerProblem } from './ledger';
import { planSplit } from './split';
import type { Jar, Recurring, Rule, Tx } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD */
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export type Freq = NonNullable<Recurring['freq']>;
export const freqOf = (r: Pick<Recurring, 'freq'>): Freq => r.freq ?? 'monthly';

type Schedule = Pick<Recurring, 'day' | 'start' | 'freq' | 'every' | 'month'>;

/**
 * The id of one occurrence. Monthly items keep the month as their key (`r:<id>:<YYYY-MM>`), exactly as before
 * weekly and yearly items existed; the others use the date. Writing it twice is always the same line.
 */
export const occurrenceId = (r: Pick<Recurring, 'id'>, key: string) => `r:${r.id}:${key}`;

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
/** 1 = Monday ... 7 = Sunday */
const weekday = (d: Date) => ((d.getDay() + 6) % 7) + 1;

/** Every date of the schedule from its start, in order (endless: the caller stops). */
function* dates(r: Schedule): Generator<{ key: string; date: string }> {
  const start = parse(r.start);
  const freq = freqOf(r);
  if (freq === 'monthly' || freq === 'yearly') {
    let y = start.getFullYear();
    let m = freq === 'yearly' ? Math.min(12, Math.max(1, r.month ?? start.getMonth() + 1)) - 1 : start.getMonth();
    for (;;) {
      const date = `${y}-${pad(m + 1)}-${pad(Math.min(r.day, daysIn(y, m)))}`;
      if (date >= r.start) yield { key: freq === 'monthly' ? `${y}-${pad(m + 1)}` : date, date };
      if (freq === 'yearly') y++;
      else if (++m > 11) {
        m = 0;
        y++;
      }
    }
  }
  if (freq === 'weekly') {
    let d = addDays(start, (Math.min(7, Math.max(1, r.day)) - weekday(start) + 7) % 7);
    for (;;) {
      yield { key: dateKey(d), date: dateKey(d) };
      d = addDays(d, 7);
    }
  }
  const step = Math.min(365, Math.max(1, Math.round(r.every ?? 1)));
  for (let d = start; ; d = addDays(d, step)) yield { key: dateKey(d), date: dateKey(d) };
}

/** Occurrences from the start up to and including `now`, the most recent 24 at most. */
export function occurrences(r: Schedule, now: Date): { key: string; date: string }[] {
  const today = dateKey(now);
  const out: { key: string; date: string }[] = [];
  let guard = 0;
  for (const o of dates(r)) {
    if (o.date > today || ++guard > 20_000) break;
    out.push(o);
    if (out.length > 24) out.shift();
  }
  return out;
}

/** The first date on or after `from` when the item applies. */
export function nextDate(r: Schedule, from: Date): string {
  const day = dateKey(from);
  let guard = 0;
  for (const o of dates(r)) {
    if (o.date >= day) return o.date;
    if (++guard > 20_000) break;
  }
  return r.start;
}

const WEEKDAYS = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
export const weekdayName = (n: number) => WEEKDAYS[n] ?? '';

/** "Ngày 5 hằng tháng", "Thứ Hai hằng tuần", "Ngày 15/3 hằng năm", "Mỗi 10 ngày". */
export function scheduleLabel(r: Schedule): string {
  switch (freqOf(r)) {
    case 'weekly':
      return `${weekdayName(r.day)} hằng tuần`;
    case 'yearly':
      return `Ngày ${r.day}/${r.month ?? parse(r.start).getMonth() + 1} hằng năm`;
    case 'days':
      return (r.every ?? 1) === 1 ? 'Mỗi ngày' : `Mỗi ${r.every} ngày`;
    default:
      return `Ngày ${r.day} hằng tháng`;
  }
}

/** The day after the latest line this item has written (so a changed schedule never writes the past again). */
export function afterLastWritten(r: Pick<Recurring, 'id'>, txs: Tx[]): string | null {
  const prefix = `r:${r.id}:`;
  let last = -1;
  for (const t of txs) if (t.id.startsWith(prefix) && !t.id.includes(':s', prefix.length) && t.ts > last) last = t.ts;
  return last < 0 ? null : dateKey(addDays(new Date(last), 1));
}

export interface Due {
  /** ledger lines to add (an income that splits is several lines sharing one batch) */
  txs: Tx[];
  /** occurrences that could not be written yet because the money is not there */
  waiting: { name: string; date: string }[];
}

/**
 * Lines that should exist by `now` and do not. A line that was deleted still has its tombstone, so it stays deleted.
 * Written oldest first; one that would overdraw the wallet or a saving jar waits and is tried again later.
 */
export function dueTxs(recurring: Recurring[] | undefined, txs: Tx[], jars: Jar[], rule: Rule | undefined, now: Date): Due {
  const have = new Set(txs.map((t) => t.id));
  const todo: { r: Recurring; key: string; date: string }[] = [];
  for (const r of recurring ?? []) {
    if (r.deleted || !(r.amount > 0)) continue;
    for (const o of occurrences(r, now)) if (!have.has(occurrenceId(r, o.key))) todo.push({ r, ...o });
  }
  todo.sort((a, b) => a.date.localeCompare(b.date));

  let ledger = txs;
  const added: Tx[] = [];
  const waiting: Due['waiting'] = [];
  for (const { r, key, date } of todo) {
    const id = occurrenceId(r, key);
    const [y, m, d] = date.split('-').map(Number);
    const ts = Math.min(new Date(y, m - 1, d, 12).getTime(), now.getTime());
    const base: Tx =
      r.type === 'expense'
        ? { id, ts, type: 'expense', amount: r.amount, from: r.from ?? 'wallet', note: r.note }
        : { id, ts, type: 'income', amount: r.amount, to: r.to ?? 'wallet', note: r.note };
    const lines: Tx[] = [base];
    if (r.type === 'income' && r.split && (r.to ?? 'wallet') === 'wallet') {
      const parts = planSplit(r.amount, rule, jars);
      if (parts.length) {
        base.batch = id;
        parts.forEach((p, i) =>
          lines.push({ id: `${id}:s${i}`, ts: ts + i + 1, type: 'transfer', amount: p.amount, from: 'wallet', to: p.jar.id, note: 'Chia theo quy tắc', batch: id }),
        );
      }
    }
    const next = [...ledger, ...lines];
    if (ledgerProblem(jars, ledger, next)) {
      waiting.push({ name: r.note || 'Khoản định kỳ', date });
      continue;
    }
    ledger = next;
    added.push(...lines);
  }
  return { txs: added, waiting };
}
