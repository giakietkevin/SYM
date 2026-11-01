import type { Debt, Loc, Tx } from './types';

/** Bill split equally. The payer (me) absorbs the rounding, so friends always owe the same whole amount. */
export function splitBill(total: number, friends: number, includeMe: boolean): { share: number; mine: number } {
  const n = friends + (includeMe ? 1 : 0);
  if (!(total > 0) || friends < 1 || n < 1) return { share: 0, mine: Math.max(0, total) };
  const share = Math.floor(total / n);
  return { share, mine: total - share * friends };
}

/** The bill: one expense for the whole amount, one debt per friend, all tied together so they undo together. */
export function billLines(opts: { id: string; total: number; from: Loc; note: string; friends: string[]; includeMe: boolean; now: number }): { tx: Tx; debts: Debt[] } {
  const { id, total, from, note, friends, includeMe, now } = opts;
  const { share } = splitBill(total, friends.length, includeMe);
  const label = note.trim() || 'Chia hóa đơn';
  return {
    tx: { id, ts: now, type: 'expense', amount: total, from, note: `Chia hóa đơn: ${label}`, batch: id },
    debts: friends.map((who, i) => ({ id: `${id}:${i}`, who, dir: 'owed' as const, amount: share, note: label, ts: now, from, batch: id })),
  };
}

export const isOpen = (d: Debt) => !d.deleted && !d.settled;

export interface Person {
  who: string;
  /** > 0: they owe me; < 0: I owe them */
  net: number;
  open: Debt[];
}

/** Open debts grouped by person (name compared without case or accents), biggest first. */
export function byPerson(debts: Debt[] | undefined): Person[] {
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  const map = new Map<string, Person>();
  for (const d of (debts ?? []).filter(isOpen)) {
    const k = key(d.who);
    const p = map.get(k) ?? { who: d.who, net: 0, open: [] };
    p.net += d.dir === 'owed' ? d.amount : -d.amount;
    p.open.push(d);
    map.set(k, p);
  }
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export function totals(debts: Debt[] | undefined): { owedToMe: number; iOwe: number } {
  let owedToMe = 0;
  let iOwe = 0;
  for (const d of (debts ?? []).filter(isOpen)) {
    if (d.dir === 'owed') owedToMe += d.amount;
    else iOwe += d.amount;
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
