import { describe, expect, it } from 'vitest';
import { balanceOf, ledgerProblem, mergeStates } from './ledger';
import { reducer } from './store';
import type { Jar, State, Tx } from './types';

const jar = (id: string, kind: Jar['kind'] = 'spend', goal = 1_000_000): Jar => ({ id, name: id, kind, hue: 'sage', theme: 'jar', goal, created: 0 });
const tx = (id: string, p: Partial<Tx>): Tx => ({ id, ts: 1, type: 'transfer', amount: 0, note: '', ...p });
const state = (p: Partial<State> = {}): State => ({ jars: [], txs: [], sound: true, haptics: true, ...p });

describe('balanceOf', () => {
  it('derives balances from the ledger and skips tombstones', () => {
    const txs = [
      tx('a', { type: 'income', amount: 500, to: 'wallet' }),
      tx('b', { amount: 200, from: 'wallet', to: 'food' }),
      tx('c', { type: 'expense', amount: 50, from: 'food' }),
      tx('d', { type: 'expense', amount: 999, from: 'food', deleted: true }),
    ];
    expect(balanceOf(txs, 'wallet')).toBe(300);
    expect(balanceOf(txs, 'food')).toBe(150);
  });
});

describe('mergeStates', () => {
  it('keeps the union of both ledgers', () => {
    const local = state({ txs: [tx('a', { amount: 1 }), tx('b', { amount: 2 })] });
    const remote = state({ txs: [tx('a', { amount: 1 }), tx('c', { amount: 3 })] });
    expect(mergeStates(local, remote).txs.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('lets this device win an edit, but a deletion on either side sticks', () => {
    const local = state({ txs: [tx('a', { amount: 10 }), tx('b', { amount: 1, deleted: true })] });
    const remote = state({ txs: [tx('a', { amount: 5, deleted: true }), tx('b', { amount: 2 })] });
    const merged = mergeStates(local, remote).txs;
    expect(merged.find((t) => t.id === 'a')).toMatchObject({ amount: 10, deleted: true });
    expect(merged.find((t) => t.id === 'b')).toMatchObject({ amount: 1, deleted: true });
  });

  it('keeps jar deletions and the latest rolled month', () => {
    const local = state({ jars: [jar('x')], rolled: '2026-09' });
    const remote = state({ jars: [{ ...jar('x'), deleted: true }], rolled: '2026-10' });
    const merged = mergeStates(local, remote);
    expect(merged.jars[0].deleted).toBe(true);
    expect(merged.rolled).toBe('2026-10');
  });

  it('is idempotent: merging a state with itself changes nothing', () => {
    const s = state({ jars: [jar('x')], txs: [tx('a', { type: 'income', amount: 7, to: 'wallet' })] });
    const merged = mergeStates(s, s);
    expect(merged.txs).toHaveLength(1);
    expect(balanceOf(merged.txs, 'wallet')).toBe(7);
  });
});

describe('ledgerProblem', () => {
  const jars = [jar('food'), jar('trip', 'save')];
  const base = [tx('in', { type: 'income', amount: 100, to: 'wallet' })];

  it('refuses a wallet below zero', () => {
    const after = [...base, tx('x', { type: 'expense', amount: 150, from: 'wallet' })];
    expect(ledgerProblem(jars, base, after)).toEqual({ name: 'Ví tổng', short: 50 });
  });

  it('refuses a saving jar below zero', () => {
    const after = [...base, tx('x', { type: 'expense', amount: 1, from: 'trip' })];
    expect(ledgerProblem(jars, base, after)?.name).toBe('trip');
  });

  it('lets a spending jar go over its limit', () => {
    const after = [...base, tx('x', { type: 'expense', amount: 500, from: 'food' })];
    expect(ledgerProblem(jars, base, after)).toBeNull();
  });

  it('does not blame a place that was already negative and got better', () => {
    const before = [tx('x', { type: 'expense', amount: 100, from: 'wallet' })];
    const after = [...before, tx('in', { type: 'income', amount: 40, to: 'wallet' })];
    expect(ledgerProblem(jars, before, after)).toBeNull();
  });
});

describe('reducer', () => {
  it('closing a jar returns its money to the wallet', () => {
    const s = state({
      jars: [jar('food')],
      txs: [tx('in', { type: 'income', amount: 300, to: 'wallet' }), tx('t', { amount: 120, from: 'wallet', to: 'food' })],
    });
    const next = reducer(s, { t: 'deleteJar', id: 'food' });
    expect(balanceOf(next.txs, 'food')).toBe(0);
    expect(balanceOf(next.txs, 'wallet')).toBe(300);
    expect(next.jars[0].deleted).toBe(true);
  });

  it('undo tombstones the line and everything in its batch', () => {
    const s = state({
      txs: [
        tx('in', { type: 'income', amount: 100, to: 'wallet', batch: 'in' }),
        tx('s1', { amount: 50, from: 'wallet', to: 'food', batch: 'in' }),
        tx('other', { type: 'income', amount: 1, to: 'wallet' }),
      ],
    });
    const next = reducer(s, { t: 'undoTx', id: 'in' });
    expect(next.txs.filter((t) => t.deleted).map((t) => t.id)).toEqual(['in', 's1']);
    expect(next.txs).toHaveLength(3);
  });

  it('undoing a bill also undoes repayments already booked against it', () => {
    const s = state({
      txs: [tx('bill', { type: 'expense', amount: 300, from: 'wallet', batch: 'bill' }), tx('debt:bill:0', { type: 'income', amount: 100, to: 'wallet' })],
      debts: [{ id: 'bill:0', who: 'An', dir: 'owed', amount: 100, note: '', ts: 1, batch: 'bill', settled: true, settledTx: 'debt:bill:0' }],
    });
    const next = reducer(s, { t: 'undoBill', id: 'bill' });
    expect(next.txs.every((t) => t.deleted)).toBe(true);
    expect(next.debts?.[0].deleted).toBe(true);
  });
});
