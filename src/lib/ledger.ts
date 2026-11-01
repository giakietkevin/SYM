import { mergeDebts } from './debts';
import type { Jar, Loc, Recurring, State, Tx } from './types';

/** Lines marked `deleted` are tombstones: kept so a merge cannot bring them back, ignored everywhere else. */
export const live = (txs: Tx[]) => txs.filter((t) => !t.deleted);

export function balanceOf(txs: Tx[], loc: Loc): number {
  let b = 0;
  for (const t of txs) {
    if (t.deleted) continue;
    if (t.to === loc) b += t.amount;
    if (t.from === loc) b -= t.amount;
  }
  return b;
}

/**
 * Two devices edited from the same starting point. Every ledger line has a unique id, so the union
 * of both is the truth. For a line on both sides this device's edit wins, but a deletion on either
 * side sticks. Jars: this device's version wins, a deletion on either side sticks.
 */
export function mergeStates(local: State, remote: State): State {
  const txs = new Map(remote.txs.map((t) => [t.id, t]));
  for (const t of local.txs) {
    const r = txs.get(t.id);
    txs.set(t.id, { ...t, deleted: t.deleted || r?.deleted || undefined });
  }
  const jars = new Map(remote.jars.map((j) => [j.id, j]));
  for (const j of local.jars) jars.set(j.id, { ...j, deleted: j.deleted || jars.get(j.id)?.deleted });
  return {
    jars: [...jars.values()],
    txs: [...txs.values()],
    sound: local.sound,
    haptics: local.haptics,
    rule: local.rule ?? remote.rule,
    recurring: mergeRecurring(local.recurring, remote.recurring),
    debts: mergeDebts(local.debts, remote.debts),
    rolled: [local.rolled, remote.rolled].filter(Boolean).sort().pop(), // YYYY-MM sorts as time
    notify: local.notify ?? remote.notify,
  };
}

/** Same rule as jars: this device's version wins, a deletion on either side sticks. */
function mergeRecurring(local: Recurring[] = [], remote: Recurring[] = []): Recurring[] | undefined {
  const all = new Map(remote.map((r) => [r.id, r]));
  for (const r of local) all.set(r.id, { ...r, deleted: r.deleted || all.get(r.id)?.deleted || undefined });
  return all.size ? [...all.values()] : undefined;
}

export interface LedgerProblem {
  /** "Ví tổng" or the jar's name */
  name: string;
  /** how far below zero it would end up */
  short: number;
}

/**
 * Would changing the ledger from `before` to `after` push money below zero where that makes no sense?
 * The wallet and saving jars cannot hold less than nothing; a spending jar may go over its limit.
 * A place that was already negative is only a problem if it gets worse.
 */
export function ledgerProblem(jars: Jar[], before: Tx[], after: Tx[]): LedgerProblem | null {
  const places: { loc: Loc; name: string }[] = [
    { loc: 'wallet', name: 'Ví tổng' },
    ...jars.filter((j) => !j.deleted && j.kind === 'save').map((j) => ({ loc: j.id, name: j.name })),
  ];
  for (const p of places) {
    const was = balanceOf(before, p.loc);
    const now = balanceOf(after, p.loc);
    if (now < 0 && now < was) return { name: p.name, short: -now };
  }
  return null;
}
