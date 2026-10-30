import { useMemo, useReducer } from 'react';
import { seed } from './seed';
import type { Jar, Loc, Rule, State, Tx } from './types';

type Action =
  | { t: 'addTx'; tx: Tx }
  | { t: 'undoTx'; id: string }
  | { t: 'setRule'; rule: Rule }
  | { t: 'setRolled'; month: string | undefined }
  | { t: 'saveJar'; jar: Jar }
  | { t: 'deleteJar'; id: string }
  | { t: 'flags'; sound?: boolean; haptics?: boolean }
  | { t: 'reset' }
  | { t: 'load'; state: State };

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export function balanceOf(txs: Tx[], loc: Loc): number {
  let b = 0;
  for (const t of txs) {
    if (t.to === loc) b += t.amount;
    if (t.from === loc) b -= t.amount;
  }
  return b;
}

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'addTx':
      return { ...s, txs: [...s.txs, a.tx] };
    case 'undoTx':
      return { ...s, txs: s.txs.filter((x) => x.id !== a.id && x.batch !== a.id) };
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
  };
}

/**
 * Two devices edited from the same starting point. The ledger only ever grows and every line has a
 * unique id, so the union of both is the truth. Jars: this device's version wins, a deletion on
 * either side sticks. (Known edge: an undo done on one side can be brought back by the other.)
 */
export function mergeStates(local: State, remote: State): State {
  const txs = new Map(remote.txs.map((t) => [t.id, t]));
  for (const t of local.txs) txs.set(t.id, t);
  const jars = new Map(remote.jars.map((j) => [j.id, j]));
  for (const j of local.jars) jars.set(j.id, { ...j, deleted: j.deleted || jars.get(j.id)?.deleted });
  return {
    jars: [...jars.values()],
    txs: [...txs.values()],
    sound: local.sound,
    haptics: local.haptics,
    rule: local.rule ?? remote.rule,
    rolled: [local.rolled, remote.rolled].filter(Boolean).sort().pop(), // YYYY-MM sorts as time
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
      funded[j.id] = bal[j.id] !== 0 || state.txs.some((t) => t.to === j.id);
    }
    const wallet = balanceOf(state.txs, 'wallet');
    const txs = [...state.txs].sort((a, b) => b.ts - a.ts);
    return { jars, bal, funded, wallet, txs };
  }, [state]);

  return { state, dispatch, ...derived };
}

export type Store = ReturnType<typeof useStore>;
