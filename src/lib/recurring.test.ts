import { describe, expect, it } from 'vitest';
import { dueTxs, nextDate, occurrenceId, occurrences } from './recurring';
import { balanceOf } from './ledger';
import type { Jar, Recurring, Tx } from './types';

const jar = (id: string, kind: Jar['kind'] = 'spend'): Jar => ({ id, name: id, kind, hue: 'sage', theme: 'jar', goal: 1_000_000, created: 0 });
const rent: Recurring = { id: 'rent', type: 'expense', amount: 300, from: 'wallet', note: 'Tiền nhà', day: 31, start: '2026-01-01' };
const salary: Recurring = { id: 'sal', type: 'income', amount: 1000, to: 'wallet', note: 'Lương', day: 5, start: '2026-01-01' };
const income = (amount: number): Tx => ({ id: 'seed', ts: 0, type: 'income', amount, to: 'wallet', note: '' });

describe('occurrences', () => {
  it('uses the last day of a short month', () => {
    const list = occurrences(rent, new Date(2026, 3, 29, 12));
    expect(list.map((o) => o.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('includes today and nothing before the start date', () => {
    const r = { ...salary, start: '2026-03-10' };
    expect(occurrences(r, new Date(2026, 4, 5, 9)).map((o) => o.date)).toEqual(['2026-04-05', '2026-05-05']);
  });

  it('keeps at most the last 24 months', () => {
    expect(occurrences({ ...salary, start: '2020-01-01' }, new Date(2026, 10, 1))).toHaveLength(24);
  });
});

describe('nextDate', () => {
  it('skips a day already past this month', () => {
    expect(nextDate({ day: 5, start: '2026-11-01' }, new Date(2026, 10, 20))).toBe('2026-12-05');
  });
});

describe('dueTxs', () => {
  const now = new Date(2026, 2, 6, 12); // 6 March 2026

  it('fills every missed month with a fixed id', () => {
    const { txs } = dueTxs([salary], [], [], undefined, now);
    expect(txs.map((t) => t.id)).toEqual(['r:sal:2026-01', 'r:sal:2026-02', 'r:sal:2026-03']);
  });

  it('never writes a month twice, and a deleted month stays deleted', () => {
    const existing: Tx[] = [
      { id: occurrenceId(salary, '2026-01'), ts: 1, type: 'income', amount: 1000, to: 'wallet', note: '' },
      { id: occurrenceId(salary, '2026-02'), ts: 2, type: 'income', amount: 1000, to: 'wallet', note: '', deleted: true },
    ];
    expect(dueTxs([salary], existing, [], undefined, now).txs.map((t) => t.id)).toEqual(['r:sal:2026-03']);
  });

  it('an expense that would overdraw the wallet waits', () => {
    const { txs, waiting } = dueTxs([rent], [income(400)], [], undefined, new Date(2026, 2, 31, 18));
    expect(txs).toHaveLength(1);
    expect(waiting).toHaveLength(2);
  });

  it('income written first can pay for a later expense', () => {
    const r = { ...rent, day: 10 };
    const { txs, waiting } = dueTxs([r, salary], [], [], undefined, new Date(2026, 0, 31));
    expect(waiting).toEqual([]);
    expect(balanceOf(txs, 'wallet')).toBe(700);
  });

  it('salary follows the split rule as one batch', () => {
    const jars = [jar('food'), jar('trip', 'save')];
    const { txs } = dueTxs([{ ...salary, split: true }], [], jars, { food: 50, trip: 20 }, new Date(2026, 0, 6));
    expect(txs).toHaveLength(3);
    expect(new Set(txs.map((t) => t.batch))).toEqual(new Set(['r:sal:2026-01']));
    expect(balanceOf(txs, 'food')).toBe(500);
    expect(balanceOf(txs, 'wallet')).toBe(300);
  });

  it('ignores deleted items', () => {
    expect(dueTxs([{ ...salary, deleted: true }], [], [], undefined, now).txs).toEqual([]);
  });
});
