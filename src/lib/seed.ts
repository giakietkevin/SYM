import type { State } from './types';

/** A fresh install is empty: no jars, no transactions, wallet at 0₫. */
export function seed(): State {
  return { jars: [], txs: [], sound: true, haptics: true };
}
