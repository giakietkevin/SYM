import { dateKey } from './recurring';
import type { Hue, Jar, Recurring, State, Theme, Tx } from './types';
import { HUES, THEME_NAMES } from './types';

export const BACKUP_MAX_BYTES = 2 * 1024 * 1024; // same ceiling as the server

export function backupJson(state: State, now = new Date()): string {
  return JSON.stringify({ app: 'sym', version: 1, exportedAt: now.toISOString(), state }, null, 1);
}

const TYPE_VN = { income: 'Thu nhập', expense: 'Chi tiêu', transfer: 'Chuyển tiền' } as const;

/** A cell that starts with = + - @ would run as a formula when opened in Excel or Sheets. */
function cell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every live ledger line, newest first, as a CSV that Excel reads with Vietnamese letters intact (UTF-8 BOM). */
export function txCsv(state: State): string {
  const place = (loc?: string) => (!loc ? '' : loc === 'wallet' ? 'Ví tổng' : (state.jars.find((j) => j.id === loc)?.name ?? 'Hũ đã đóng'));
  const rows = state.txs
    .filter((t) => !t.deleted)
    .sort((a, b) => b.ts - a.ts)
    .map((t) => {
      const d = new Date(t.ts);
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return [dateKey(d), time, TYPE_VN[t.type], t.amount, place(t.from), place(t.to), t.note].map(cell).join(',');
    });
  return '﻿' + ['Ngày,Giờ,Loại,Số tiền (₫),Từ,Đến,Ghi chú', ...rows].join('\r\n') + '\r\n';
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 200) => (typeof x === 'string' && x.length <= max ? x : null);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function cleanJar(x: unknown): Jar | null {
  if (!isObj(x)) return null;
  const id = str(x.id, 64);
  const name = str(x.name, 80);
  const goal = num(x.goal);
  const created = num(x.created);
  if (!id || name === null || goal === null || goal < 0 || created === null) return null;
  if (x.kind !== 'spend' && x.kind !== 'save') return null;
  const hue = (x.hue as Hue) in HUES ? (x.hue as Hue) : 'sage';
  const theme = (x.theme as Theme) in THEME_NAMES ? (x.theme as Theme) : 'jar';
  const due = typeof x.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.due) ? x.due : undefined;
  return { id, name, kind: x.kind, hue, theme, goal, created, ...(due ? { due } : {}), ...(x.deleted === true ? { deleted: true } : {}) };
}

function cleanTx(x: unknown): Tx | null {
  if (!isObj(x)) return null;
  const id = str(x.id, 80);
  const ts = num(x.ts);
  const amount = num(x.amount);
  if (!id || ts === null || amount === null || amount <= 0) return null;
  if (x.type !== 'income' && x.type !== 'expense' && x.type !== 'transfer') return null;
  const from = x.from === undefined ? undefined : str(x.from, 64);
  const to = x.to === undefined ? undefined : str(x.to, 64);
  const note = x.note === undefined ? '' : str(x.note, 200);
  if (from === null || to === null || note === null) return null;
  const batch = x.batch === undefined ? undefined : str(x.batch, 80);
  if (batch === null) return null;
  return { id, ts, type: x.type, amount, note, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(batch ? { batch } : {}), ...(x.deleted === true ? { deleted: true } : {}) };
}

function cleanRecurring(x: unknown): Recurring | null {
  if (!isObj(x)) return null;
  const id = str(x.id, 64);
  const note = str(x.note, 80);
  const amount = num(x.amount);
  const day = num(x.day);
  if (!id || note === null || amount === null || amount <= 0 || day === null || day < 1 || day > 31) return null;
  if (x.type !== 'expense' && x.type !== 'income') return null;
  if (typeof x.start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.start)) return null;
  const from = x.from === undefined ? undefined : str(x.from, 64);
  const to = x.to === undefined ? undefined : str(x.to, 64);
  if (from === null || to === null) return null;
  return {
    id,
    type: x.type,
    amount,
    note,
    day: Math.floor(day),
    start: x.start,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(x.split === true ? { split: true } : {}),
    ...(x.deleted === true ? { deleted: true } : {}),
  };
}

export type ParsedBackup = { ok: true; state: State; jars: number; txs: number } | { ok: false; error: string };

/**
 * Reads a file made by backupJson (or a bare state). Anything that is not a well-formed ledger is rejected as a
 * whole: restoring half of a damaged file would quietly give wrong balances.
 */
export function parseBackup(text: string): ParsedBackup {
  if (text.length > BACKUP_MAX_BYTES) return { ok: false, error: 'File quá lớn' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Đây không phải file sao lưu của SYM' };
  }
  const src = isObj(raw) && isObj(raw.state) ? raw.state : raw;
  if (!isObj(src) || !Array.isArray(src.jars) || !Array.isArray(src.txs)) return { ok: false, error: 'Đây không phải file sao lưu của SYM' };
  if (src.jars.length > 500 || src.txs.length > 50_000) return { ok: false, error: 'File có quá nhiều dữ liệu' };

  const jars = src.jars.map(cleanJar);
  const txs = src.txs.map(cleanTx);
  if (jars.some((j) => !j) || txs.some((t) => !t)) return { ok: false, error: 'File sao lưu bị lỗi, không khôi phục được' };
  const recurring = Array.isArray(src.recurring) ? src.recurring.map(cleanRecurring) : [];
  if (recurring.some((r) => !r)) return { ok: false, error: 'File sao lưu bị lỗi, không khôi phục được' };

  let rule: State['rule'];
  if (isObj(src.rule)) {
    rule = {};
    for (const [k, v] of Object.entries(src.rule)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) rule[k] = v;
  }
  const state: State = {
    jars: jars as Jar[],
    txs: txs as Tx[],
    sound: src.sound !== false,
    haptics: src.haptics !== false,
    rule,
    rolled: typeof src.rolled === 'string' && /^\d{4}-\d{2}$/.test(src.rolled) ? src.rolled : undefined,
    recurring: recurring.length ? (recurring as Recurring[]) : undefined,
  };
  return { ok: true, state, jars: state.jars.filter((j) => !j.deleted).length, txs: state.txs.filter((t) => !t.deleted).length };
}

/** Hand a text file to the browser's download. */
export function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
