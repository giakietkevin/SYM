import { describe, expect, it } from 'vitest';
import { jarTrends, monthSeries, yearSummary, yearsWithData } from './stats';
import type { Jar, Tx } from './types';

const jars: Jar[] = [
  { id: 'food', name: 'Ăn uống', kind: 'spend', hue: 'sage', theme: 'jar', goal: 0, created: 0 },
  { id: 'trip', name: 'Du lịch', kind: 'save', hue: 'sky', theme: 'plane', goal: 0, created: 0 },
];
const at = (y: number, m: number, d = 10) => new Date(y, m - 1, d, 12).getTime();
let n = 0;
const tx = (ts: number, p: Partial<Tx>): Tx => ({ id: `t${++n}`, ts, type: 'expense', amount: 0, note: '', ...p });
const now = new Date(2026, 2, 15); // March 2026

const txs: Tx[] = [
  tx(at(2025, 12), { amount: 100, from: 'food', note: '#cafe' }),
  tx(at(2026, 1), { amount: 200, from: 'food', note: '#cafe #sang' }),
  tx(at(2026, 1), { type: 'income', amount: 1000, to: 'wallet' }),
  tx(at(2026, 2), { amount: 400, from: 'food' }),
  tx(at(2026, 2), { type: 'transfer', amount: 300, from: 'wallet', to: 'trip' }),
  tx(at(2026, 3), { amount: 450, from: 'food' }),
  tx(at(2026, 3), { amount: 999, from: 'food', deleted: true }),
];

describe('stats', () => {
  it('builds the last N months, oldest first, with year-boundary labels', () => {
    const s = monthSeries(txs, jars, 4, now);
    expect(s.map((p) => [p.label, p.spent, p.income, p.saved])).toEqual([
      ['T12', 100, 0, 0],
      ['T1/26', 200, 1000, 0],
      ['T2', 400, 0, 300],
      ['T3', 450, 0, 0],
    ]);
  });

  it('per-jar trend compares this month with the average of earlier months that had spending', () => {
    const [food] = jarTrends(txs, jars, monthSeries(txs, jars, 4, now));
    expect(food.months).toEqual([100, 200, 400, 450]);
    expect(food.avg).toBe(233);
    expect(food.deltaPct).toBe(93);
  });

  it('sums a year so far, with its biggest month, jars and tags', () => {
    const y = yearSummary(txs, jars, 2026, now);
    expect(y).toMatchObject({ spent: 1050, income: 1000, saved: 300, months: 3, avgSpent: 350, biggestMonth: { label: 'Tháng 3', spent: 450 } });
    expect(y.topJars).toEqual([{ name: 'Ăn uống', amount: 1050 }]);
    expect(y.topTags).toEqual([
      { tag: 'cafe', amount: 200 },
      { tag: 'sang', amount: 200 },
    ]);
    expect(yearSummary(txs, jars, 2025, now)).toMatchObject({ spent: 100, months: 12 });
  });

  it('lists years with data, newest first', () => expect(yearsWithData(txs, now)).toEqual([2026, 2025]));

  it('a loan paid back is not a refund of spending; a share of a bill paid back is', () => {
    const extra: Tx[] = [
      tx(at(2026, 3, 11), { type: 'income', amount: 200, to: 'wallet', id: 'debt:loan1' }),
      tx(at(2026, 3, 11), { type: 'income', amount: 50, to: 'wallet', id: 'debt:loan1#p2' }),
      tx(at(2026, 3, 12), { type: 'income', amount: 100, to: 'food', id: 'debt:bill9:0' }),
      tx(at(2026, 3, 12), { type: 'income', amount: 30, to: 'food', id: 'debt:bill9:1#x' }),
    ];
    const s = monthSeries([...txs, ...extra], jars, 1, now)[0];
    expect(s.spent).toBe(450 - 130);
    expect(s.income).toBe(250);
  });
});
