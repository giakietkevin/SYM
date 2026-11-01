import { describe, expect, it } from 'vitest';
import { afterLastWritten, dueTxs, nextDate, occurrenceId, occurrences, scheduleLabel } from './recurring';
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

describe('other schedules', () => {
  const base = { id: 'x', type: 'expense' as const, amount: 1, note: 'x', start: '2026-01-01' };

  it('weekly falls on the chosen weekday (1 = Monday)', () => {
    // 1 Jan 2026 is a Thursday: the first Monday on or after it is 5 Jan
    const list = occurrences({ ...base, freq: 'weekly', day: 1 }, new Date(2026, 0, 20, 12));
    expect(list.map((o) => o.date)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
    expect(list[0].key).toBe('2026-01-05');
  });

  it('yearly uses month and day, the last day of February when short', () => {
    const r = { ...base, freq: 'yearly' as const, month: 2, day: 29, start: '2026-01-01' };
    expect(occurrences(r, new Date(2028, 5, 1)).map((o) => o.date)).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('a yearly date already past in the start year begins the next year', () => {
    expect(nextDate({ ...base, freq: 'yearly', month: 1, day: 1, start: '2026-03-01' }, new Date(2026, 2, 1))).toBe('2027-01-01');
  });

  it('every N days counts from the start date', () => {
    const r = { ...base, freq: 'days' as const, every: 10, day: 1, start: '2026-01-25' };
    expect(occurrences(r, new Date(2026, 1, 15, 12)).map((o) => o.date)).toEqual(['2026-01-25', '2026-02-04', '2026-02-14']);
  });

  it('monthly ids keep the month key, others use the date', () => {
    const monthly = dueTxs([{ ...base, day: 3 }], [income(10)], [], undefined, new Date(2026, 0, 5)).txs;
    const weekly = dueTxs([{ ...base, freq: 'weekly', day: 1 }], [income(10)], [], undefined, new Date(2026, 0, 6)).txs;
    expect(monthly.map((t) => t.id)).toEqual(['r:x:2026-01']);
    expect(weekly.map((t) => t.id)).toEqual(['r:x:2026-01-05']);
  });

  it('labels read naturally', () => {
    expect(scheduleLabel({ ...base, day: 5 })).toBe('Ngày 5 hằng tháng');
    expect(scheduleLabel({ ...base, freq: 'weekly', day: 7 })).toBe('Chủ Nhật hằng tuần');
    expect(scheduleLabel({ ...base, freq: 'yearly', day: 15, month: 3 })).toBe('Ngày 15/3 hằng năm');
    expect(scheduleLabel({ ...base, freq: 'days', day: 1, every: 10 })).toBe('Mỗi 10 ngày');
  });

  it('afterLastWritten finds the day after the latest own line, ignoring split lines', () => {
    const txs: Tx[] = [
      { id: 'r:x:2026-01-05', ts: new Date(2026, 0, 5, 12).getTime(), type: 'expense', amount: 1, note: '' },
      { id: 'r:x:2026-01-05:s0', ts: new Date(2026, 0, 9, 12).getTime(), type: 'transfer', amount: 1, note: '' },
      { id: 'r:y:2026-02-01', ts: new Date(2026, 1, 1, 12).getTime(), type: 'expense', amount: 1, note: '' },
    ];
    expect(afterLastWritten({ id: 'x' }, txs)).toBe('2026-01-06');
    expect(afterLastWritten({ id: 'z' }, txs)).toBeNull();
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
