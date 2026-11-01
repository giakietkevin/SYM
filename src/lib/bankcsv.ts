import { fold } from './search';
import type { Loc, Tx } from './types';

/**
 * Bank statements exported as CSV (Vietcombank, Techcombank, MB, TPBank, Timo... and most foreign banks). Layouts
 * differ, so columns are guessed from the header and the person can correct the guess before anything is written.
 */

/** Splits CSV text into rows. Handles quotes, "" inside quotes, CRLF, a BOM, and , ; or tab as the separator. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLines = src.split(/\r?\n/).slice(0, 20).join('\n');
  const count = (sep: string) => firstLines.split('\n').reduce((n, l) => n + l.split(sep).length - 1, 0);
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (c === sep) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/**
 * "1.234.567", "1,234,567.00", "-50.000 VND", "(1,000)", "+2.000.000đ" -> whole đồng, signed. null when not a number.
 * A separator followed by exactly 1-2 digits at the end is a decimal point; every other one groups thousands.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\s|vnd|vnđ|đ|₫|d$/gi, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const dec = /[.,](\d{1,2})$/.exec(s);
  let whole = s;
  let frac = 0;
  if (dec) {
    whole = s.slice(0, dec.index);
    frac = Number(`0.${dec[1]}`);
  }
  const n = Number(whole.replace(/[.,]/g, '') || '0') + frac;
  if (!Number.isFinite(n)) return null;
  const v = Math.round(n);
  return neg ? -v : v;
}

/** "31/12/2026", "31-12-26", "2026-12-31", "31/12/2026 14:05:00" -> local noon of that day (ms). Day comes first. */
export function parseDate(raw: string): number | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (iso) [, y, m, d] = iso.map(Number) as [number, number, number, number];
  else if (dmy) {
    [, d, m, y] = dmy.map(Number) as [number, number, number, number];
    if (y < 100) y += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, m - 1, d, 12);
  return t.getMonth() === m - 1 ? t.getTime() : null;
}

export interface Mapping {
  /** index of the header row; data starts on the next row */
  header: number;
  date: number;
  desc: number;
  /** a single signed amount column, or -1 */
  amount: number;
  /** separate money-out / money-in columns, or -1 */
  debit: number;
  credit: number;
}

const has = (cell: string, words: string[]) => {
  const c = fold(cell);
  return words.some((w) => c.includes(w));
};
const DATE = ['ngay', 'date', 'thoi gian', 'time'];
const DESC = ['mo ta', 'noi dung', 'dien giai', 'chi tiet', 'description', 'details', 'remark', 'narrative', 'content', 'ghi chu', 'memo'];
const DEBIT = ['ghi no', 'debit', 'rut', 'tien ra', 'withdraw', 'so tien chi', 'phat sinh no', 'chi'];
const CREDIT = ['ghi co', 'credit', 'tien vao', 'deposit', 'so tien thu', 'phat sinh co', 'thu'];
const AMOUNT = ['so tien', 'amount', 'gia tri', 'value'];
const SKIP = ['so du', 'balance', 'so tham chieu', 'reference', 'ma giao dich', 'so ct'];

/** Finds the header row and the columns. Returns null when no row looks like a header with a date and some money. */
export function guessMapping(rows: string[][]): Mapping | null {
  for (let h = 0; h < Math.min(rows.length, 25); h++) {
    const row = rows[h];
    const find = (words: string[], taken: number[] = []) => row.findIndex((c, i) => !taken.includes(i) && c && has(c, words) && !has(c, SKIP));
    const date = find(DATE);
    if (date < 0) continue;
    const debit = find(DEBIT, [date]);
    const credit = find(CREDIT, [date, debit]);
    const amount = debit >= 0 && credit >= 0 ? -1 : find(AMOUNT, [date]);
    if (amount < 0 && (debit < 0 || credit < 0)) continue;
    const desc = find(DESC, [date, debit, credit, amount]);
    // the description is often just the longest text column
    const fallback = desc >= 0 ? desc : longestText(rows.slice(h + 1, h + 11), [date, debit, credit, amount]);
    return { header: h, date, desc: fallback, amount, debit: amount >= 0 ? -1 : debit, credit: amount >= 0 ? -1 : credit };
  }
  return null;
}

function longestText(rows: string[][], taken: number[]): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = -1;
  let bestLen = 0;
  for (let i = 0; i < width; i++) {
    if (taken.includes(i)) continue;
    const len = rows.reduce((s, r) => s + (r[i] && parseAmount(r[i]) === null ? r[i].length : 0), 0);
    if (len > bestLen) [best, bestLen] = [i, len];
  }
  return best;
}

export interface ImportRow {
  id: string;
  ts: number;
  /** signed: negative is money out */
  amount: number;
  note: string;
  /** already in the ledger (imported before) */
  dup: boolean;
}

export interface ImportPlan {
  rows: ImportRow[];
  /** data rows that could not be read (no date or no amount) */
  skipped: number;
}

/** A short stable hash (FNV-1a, 32-bit, base 36). */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Reads the data rows with a mapping. Each line's id comes from its date, amount and text (plus how many identical
 * lines came before it in the file), so importing the same statement twice, or two overlapping statements, adds
 * nothing the second time.
 */
export function planImport(rows: string[][], map: Mapping, existing: Set<string>): ImportPlan {
  const out: ImportRow[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const r of rows.slice(map.header + 1)) {
    const ts = parseDate(r[map.date] ?? '');
    let amount: number | null;
    if (map.amount >= 0) amount = parseAmount(r[map.amount] ?? '');
    else {
      const out_ = parseAmount(r[map.debit] ?? '') ?? 0;
      const in_ = parseAmount(r[map.credit] ?? '') ?? 0;
      amount = Math.abs(in_) - Math.abs(out_);
      if (!r[map.debit] && !r[map.credit]) amount = null;
    }
    if (ts === null || amount === null || amount === 0) {
      skipped++;
      continue;
    }
    const note = (map.desc >= 0 ? (r[map.desc] ?? '') : '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const base = `${ts}|${amount}|${fold(note)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = `imp:${hash(base)}${n ? `.${n}` : ''}`;
    out.push({ id, ts, amount, note, dup: existing.has(id) });
  }
  return { rows: out, skipped };
}

/** The ledger lines for the new rows: money out leaves `expenseFrom`, money in lands in `incomeTo`. */
export function importTxs(plan: ImportPlan, expenseFrom: Loc, incomeTo: Loc): Tx[] {
  return plan.rows
    .filter((r) => !r.dup)
    .map((r) =>
      r.amount < 0
        ? { id: r.id, ts: r.ts, type: 'expense' as const, amount: -r.amount, from: expenseFrom, note: r.note || 'Giao dịch ngân hàng' }
        : { id: r.id, ts: r.ts, type: 'income' as const, amount: r.amount, to: incomeTo, note: r.note || 'Giao dịch ngân hàng' },
    );
}
