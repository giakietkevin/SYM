import type { Debt, Loc, Tx } from './types';

/** Bill split equally. The payer (me) absorbs the rounding, so friends always owe the same whole amount. */
export function splitBill(total: number, friends: number, includeMe: boolean): { share: number; mine: number } {
  const n = friends + (includeMe ? 1 : 0);
  if (!(total > 0) || friends < 1 || n < 1) return { share: 0, mine: Math.max(0, total) };
  const share = Math.floor(total / n);
  return { share, mine: total - share * friends };
}

export type SplitMode = 'equal' | 'amount' | 'percent';

/**
 * Uneven shares. `amount`: what each friend owes, as typed ("150k"). `percent`: each friend's percent of the total,
 * rounded down to whole đồng (the payer keeps the dust). Whatever is not given to friends is the payer's part.
 */
export function customShares(total: number, mode: Exclude<SplitMode, 'equal'>, values: number[]): { shares: number[]; mine: number; error: string | null } {
  const shares = values.map((v) => (mode === 'percent' ? Math.floor((total * Math.max(0, v)) / 100) : Math.max(0, Math.round(v))));
  const sum = shares.reduce((s, x) => s + x, 0);
  let error: string | null = null;
  if (!(total > 0)) error = 'Nhập số tiền hóa đơn';
  else if (mode === 'percent' && values.reduce((s, v) => s + v, 0) > 100) error = 'Tổng phần trăm vượt quá 100%';
  else if (sum > total) error = `Tổng phần của các bạn (${sum.toLocaleString('vi-VN')}₫) lớn hơn hóa đơn`;
  else if (shares.some((x) => x <= 0)) error = 'Mỗi bạn cần một phần lớn hơn 0';
  return { shares, mine: Math.max(0, total - sum), error };
}

/** The bill: one expense for the whole amount, one debt per friend, all tied together so they undo together. */
export function billLines(opts: {
  id: string;
  total: number;
  from: Loc;
  note: string;
  friends: string[];
  includeMe: boolean;
  now: number;
  /** uneven shares, one per friend; without it the bill is split equally */
  shares?: number[];
}): { tx: Tx; debts: Debt[] } {
  const { id, total, from, note, friends, includeMe, now } = opts;
  const { share: equal } = splitBill(total, friends.length, includeMe);
  const shareOf = (i: number) => opts.shares?.[i] ?? equal;
  const label = note.trim() || 'Chia hóa đơn';
  return {
    tx: { id, ts: now, type: 'expense', amount: total, from, note: `Chia hóa đơn: ${label}`, batch: id },
    debts: friends.map((who, i) => ({ id: `${id}:${i}`, who, dir: 'owed' as const, amount: shareOf(i), note: label, ts: now, from, batch: id })),
  };
}

/** Every ledger line that pays this debt: `debt:<id>` (all at once) or `debt:<id>#<n>` (a part). */
export const paysDebt = (d: Pick<Debt, 'id'>, t: Tx) => t.id === `debt:${d.id}` || t.id.startsWith(`debt:${d.id}#`);

/** What has been paid so far (live lines only). */
export function paidOf(d: Debt, txs: Tx[] = []): number {
  if (d.settled) return d.amount;
  let paid = 0;
  for (const t of txs) if (!t.deleted && paysDebt(d, t)) paid += t.amount;
  return Math.min(d.amount, paid);
}

export const remainingOf = (d: Debt, txs: Tx[] = []) => Math.max(0, d.amount - paidOf(d, txs));

/** Still owed: not deleted, not settled, something left to pay. Without the ledger only the flags count. */
export const isOpen = (d: Debt, txs?: Tx[]) => !d.deleted && !d.settled && (!txs || remainingOf(d, txs) > 0);

/** Paid in full, either at once or part by part. */
export const isDone = (d: Debt, txs: Tx[] = []) => !d.deleted && (!!d.settled || (paidOf(d, txs) >= d.amount && d.amount > 0));

const DAY = 86_400_000;

/** Days until the due date (negative once past), or null without one. */
export function dueIn(d: Pick<Debt, 'due'>, now = new Date()): number | null {
  if (!d.due || !/^\d{4}-\d{2}-\d{2}$/.test(d.due)) return null;
  const [y, m, day] = d.due.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(y, m - 1, day).getTime() - today) / DAY);
}

export interface Person {
  who: string;
  /** > 0: they owe me; < 0: I owe them */
  net: number;
  open: Debt[];
}

/** Open debts grouped by person (name compared without case or accents), biggest first. */
export function byPerson(debts: Debt[] | undefined, txs?: Tx[]): Person[] {
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  const map = new Map<string, Person>();
  for (const d of (debts ?? []).filter((x) => isOpen(x, txs))) {
    const k = key(d.who);
    const p = map.get(k) ?? { who: d.who, net: 0, open: [] };
    const left = remainingOf(d, txs);
    p.net += d.dir === 'owed' ? left : -left;
    p.open.push(d);
    map.set(k, p);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export function totals(debts: Debt[] | undefined, txs?: Tx[]): { owedToMe: number; iOwe: number } {
  let owedToMe = 0;
  let iOwe = 0;
  for (const d of (debts ?? []).filter((x) => isOpen(x, txs))) {
    const left = remainingOf(d, txs);
    if (d.dir === 'owed') owedToMe += left;
    else iOwe += left;
  }
  return { owedToMe, iOwe };
}

/** Settling writes one ordinary ledger line with a fixed id, so two devices settling the same debt agree. */
export function settleTx(d: Debt, place: Loc, now: number): Tx {
  const id = `debt:${d.id}`;
  return d.dir === 'owed'
    ? { id, ts: now, type: 'income', amount: d.amount, to: place, note: `${d.who} trả lại: ${d.note || 'khoản nợ'}` }
    : { id, ts: now, type: 'expense', amount: d.amount, from: place, note: `Trả nợ ${d.who}${d.note ? `: ${d.note}` : ''}` };
}

/**
 * Part of a debt paid back. Each part is its own line with its own id, so two devices recording different parts
 * both keep theirs. Undo is an ordinary undo of that line.
 */
export function partTx(d: Debt, amount: number, place: Loc, now: number, n: string): Tx {
  const id = `debt:${d.id}#${n}`;
  return d.dir === 'owed'
    ? { id, ts: now, type: 'income', amount, to: place, note: `${d.who} trả một phần: ${d.note || 'khoản nợ'}` }
    : { id, ts: now, type: 'expense', amount, from: place, note: `Trả một phần cho ${d.who}${d.note ? `: ${d.note}` : ''}` };
}

/** Union by id; a settlement or a deletion on either side sticks, otherwise this device's version wins. */
export function mergeDebts(local: Debt[] = [], remote: Debt[] = []): Debt[] | undefined {
  const all = new Map(remote.map((d) => [d.id, d]));
  for (const d of local) {
    const r = all.get(d.id);
    all.set(d.id, {
      ...d,
      settled: d.settled || r?.settled || undefined,
      settledTx: d.settledTx ?? r?.settledTx,
      deleted: d.deleted || r?.deleted || undefined,
    });
  }
  return all.size ? [...all.values()] : undefined;
}
