import { useMemo, useReducer } from 'react';
import { balanceOf, live, mergeStates } from './ledger';
import { seed } from './seed';
import type { Debt, Jar, Loc, Recurring, Rule, State, Tx } from './types';

type Action =
  | { t: 'addTx'; tx: Tx }
  | { t: 'addTxs'; txs: Tx[] }
  | { t: 'addBill'; tx: Tx; debts: Debt[] }
  | { t: 'undoBill'; id: string }
  | { t: 'saveDebt'; debt: Debt }
  | { t: 'deleteDebt'; id: string }
  | { t: 'restoreDebt'; id: string }
  | { t: 'settleDebt'; id: string; tx: Tx }
  | { t: 'unsettleDebt'; id: string }
  | { t: 'saveRecurring'; item: Recurring }
  | { t: 'removeRecurring'; id: string }
  | { t: 'undoTx'; id: string }
  | { t: 'updateTx'; tx: Tx }
  | { t: 'setDeleted'; ids: string[]; deleted: boolean }
  | { t: 'setRule'; rule: Rule }
  | { t: 'setRolled'; month: string | undefined }
  | { t: 'saveJar'; jar: Jar }
  | { t: 'deleteJar'; id: string }
  | { t: 'flags'; sound?: boolean; haptics?: boolean }
  | { t: 'reset' }
  | { t: 'load'; state: State };

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export { balanceOf, mergeStates };

export function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'addTx':
      return { ...s, txs: [...s.txs, a.tx] };
    case 'addTxs':
      return { ...s, txs: [...s.txs, ...a.txs] };
    case 'addBill':
      return { ...s, txs: [...s.txs, a.tx], debts: [...(s.debts ?? []), ...a.debts] };
    case 'undoBill': {
      // the bill, and any repayment already booked against its debts
      const repaid = new Set((s.debts ?? []).filter((d) => d.batch === a.id).map((d) => `debt:${d.id}`));
      return {
        ...s,
        txs: s.txs.map((x) => (x.id === a.id || x.batch === a.id || repaid.has(x.id) ? { ...x, deleted: true } : x)),
        debts: (s.debts ?? []).map((d) => (d.batch === a.id ? { ...d, deleted: true } : d)),
      };
    }
    case 'saveDebt':
      return { ...s, debts: [...(s.debts ?? []), a.debt] };
    case 'deleteDebt':
      return { ...s, debts: (s.debts ?? []).map((d) => (d.id === a.id ? { ...d, deleted: true } : d)) };
    case 'restoreDebt':
      return { ...s, debts: (s.debts ?? []).map((d) => (d.id === a.id ? { ...d, deleted: undefined } : d)) };
    case 'settleDebt': {
      const has = s.txs.some((x) => x.id === a.tx.id);
      return {
        ...s,
        txs: has ? s.txs.map((x) => (x.id === a.tx.id ? { ...a.tx } : x)) : [...s.txs, a.tx],
        debts: (s.debts ?? []).map((d) => (d.id === a.id ? { ...d, settled: true, settledTx: a.tx.id } : d)),
      };
    }
    case 'unsettleDebt':
      return {
        ...s,
        txs: s.txs.map((x) => (x.id === `debt:${a.id}` ? { ...x, deleted: true } : x)),
        debts: (s.debts ?? []).map((d) => (d.id === a.id ? { ...d, settled: undefined, settledTx: undefined } : d)),
      };
    case 'saveRecurring': {
      const list = s.recurring ?? [];
      return { ...s, recurring: list.some((r) => r.id === a.item.id) ? list.map((r) => (r.id === a.item.id ? a.item : r)) : [...list, a.item] };
    }
    case 'removeRecurring':
      // a tombstone, like jars and ledger lines
      return { ...s, recurring: (s.recurring ?? []).map((r) => (r.id === a.id ? { ...r, deleted: true } : r)) };
    case 'undoTx':
      // a tombstone, not a removal: another device's copy must not bring it back
      return { ...s, txs: s.txs.map((x) => (x.id === a.id || x.batch === a.id ? { ...x, deleted: true } : x)) };
    case 'updateTx':
      return { ...s, txs: s.txs.map((x) => (x.id === a.tx.id ? a.tx : x)) };
    case 'setDeleted': {
      const ids = new Set(a.ids);
      return { ...s, txs: s.txs.map((x) => (ids.has(x.id) ? { ...x, deleted: a.deleted || undefined } : x)) };
    }
    case 'setRule':
      return { ...s, rule: a.rule };
    case 'setRolled':
      return { ...s, rolled: a.month };
    case 'saveJar': {
      const exists = s.jars.some((j) => j.id === a.jar.id);
      return { ...s, jars: exists ? s.jars.map((j) => (j.id === a.jar.id ? a.jar : j)) : [...s.jars, a.jar] };
    }
    case 'deleteJar': {
      const jar = s.jars.find((j) => j.id === a.id);
      if (!jar) return s;
      const left = balanceOf(s.txs, a.id);
      const txs = [...s.txs];
      // whatever was inside goes back to the wallet, so nothing disappears
      if (left > 0) {
        txs.push({ id: uid(), ts: Date.now(), type: 'transfer', amount: left, from: a.id, to: 'wallet', note: `Đóng hũ ${jar.name}` });
      }
      return { ...s, txs, jars: s.jars.map((j) => (j.id === a.id ? { ...j, deleted: true } : j)) };
    }
    case 'flags':
      return { ...s, sound: a.sound ?? s.sound, haptics: a.haptics ?? s.haptics };
    case 'reset':
      return seed();
    case 'load':
      return a.state;
  }
}

/** Accepts only a well-formed state (from the server or the offline cache). */
export function parseState(x: unknown): State | null {
  const s = x as State | null;
  if (!s || !Array.isArray(s.jars) || !Array.isArray(s.txs)) return null;
  return {
    jars: s.jars,
    txs: s.txs,
    sound: s.sound !== false,
    haptics: s.haptics !== false,
    rule: s.rule && typeof s.rule === 'object' ? s.rule : undefined,
    rolled: typeof s.rolled === 'string' ? s.rolled : undefined,
    recurring: Array.isArray(s.recurring) ? s.recurring : undefined,
    debts: Array.isArray(s.debts) ? s.debts : undefined,
  };
}

export function useStore(initial: State) {
  const [state, dispatch] = useReducer(reducer, initial);

  const derived = useMemo(() => {
    const jars = state.jars.filter((j) => !j.deleted);
    const bal: Record<string, number> = {};
    const funded: Record<string, boolean> = {};
    for (const j of state.jars) {
      bal[j.id] = balanceOf(state.txs, j.id);
      funded[j.id] = bal[j.id] !== 0 || state.txs.some((t) => !t.deleted && t.to === j.id);
    }
    const wallet = balanceOf(state.txs, 'wallet');
    const txs = live(state.txs).sort((a, b) => b.ts - a.ts);
    return { jars, bal, funded, wallet, txs };
  }, [state]);

  return { state, dispatch, ...derived };
}

export type Store = ReturnType<typeof useStore>;
