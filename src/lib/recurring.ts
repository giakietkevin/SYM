import { ledgerProblem } from './ledger';
import { planSplit } from './split';
import type { Jar, Recurring, Rule, Tx } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD */
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** The month's line for a recurring item has this id, so writing it twice is the same line. */
export const occurrenceId = (r: Recurring, month: string) => `r:${r.id}:${month}`;

/** Dates (one per month) on which `r` applies, from its start up to and including `now`. At most the last 24 months. */
export function occurrences(r: Recurring, now: Date): { month: string; date: string }[] {
  const out: { month: string; date: string }[] = [];
  const [sy, sm] = r.start.split('-').map(Number);
  let y = sy;
  let m = sm - 1;
  const today = dateKey(now);
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
    const date = `${y}-${pad(m + 1)}-${pad(Math.min(r.day, daysIn(y, m)))}`;
    if (date >= r.start && date <= today) out.push({ month: `${y}-${pad(m + 1)}`, date });
    if (++m > 11) {
      m = 0;
      y++;
    }
  }
  return out.slice(-24);
}

/** The first date a new item will apply (shown to the person before they save it). */
export function nextDate(r: Pick<Recurring, 'day' | 'start'>, from: Date): string {
  let [y, m] = r.start.split('-').map(Number);
  m -= 1;
  for (let i = 0; i < 36; i++) {
    const date = `${y}-${pad(m + 1)}-${pad(Math.min(r.day, daysIn(y, m)))}`;
    if (date >= r.start && date >= dateKey(from)) return date;
    if (++m > 11) {
      m = 0;
      y++;
    }
  }
  return r.start;
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
  const todo: { r: Recurring; month: string; date: string }[] = [];
  for (const r of recurring ?? []) {
    if (r.deleted || !(r.amount > 0)) continue;
    for (const o of occurrences(r, now)) if (!have.has(occurrenceId(r, o.month))) todo.push({ r, ...o });
  }
  todo.sort((a, b) => a.date.localeCompare(b.date));

  let ledger = txs;
  const added: Tx[] = [];
  const waiting: Due['waiting'] = [];
  for (const { r, month, date } of todo) {
    const id = occurrenceId(r, month);
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
