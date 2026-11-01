import { describe, expect, it } from 'vitest';
import { billLines, byPerson, customShares, dueIn, isDone, isOpen, mergeDebts, paidOf, partTx, paysDebt, remainingOf, settleTx, splitBill, totals } from './debts';
import { reducer } from './store';
import { goalPlan } from './goal';
import { streakInfo } from './streak';
import { backupJson, parseBackup, txCsv } from './backup';
import type { Debt, Jar, State, Tx } from './types';

const DAY = 86_400_000;

describe('debts', () => {
  it('the payer absorbs the rounding of a split bill', () => {
    expect(splitBill(100_000, 2, true)).toEqual({ share: 33_333, mine: 33_334 });
    expect(splitBill(100_000, 2, false)).toEqual({ share: 50_000, mine: 0 });
  });

  it('a bill is one expense plus one debt per friend, all in one batch', () => {
    const { tx, debts } = billLines({ id: 'b', total: 90, from: 'food', note: 'Lẩu', friends: ['An', 'Bình'], includeMe: true, now: 1 });
    expect(tx).toMatchObject({ type: 'expense', amount: 90, from: 'food', batch: 'b' });
    expect(debts.map((d) => [d.who, d.amount, d.batch])).toEqual([
      ['An', 30, 'b'],
      ['Bình', 30, 'b'],
    ]);
  });

  const d = (p: Partial<Debt>): Debt => ({ id: 'x', who: 'An', dir: 'owed', amount: 100, note: '', ts: 1, ...p });

  it('groups people without case or accents and nets both directions', () => {
    const people = byPerson([d({ id: '1', who: 'Đức' }), d({ id: '2', who: 'duc', dir: 'owe', amount: 30 }), d({ id: '3', settled: true })]);
    expect(people).toHaveLength(1);
    expect(people[0].net).toBe(70);
    expect(totals([d({ id: '1' }), d({ id: '2', dir: 'owe', amount: 40 })])).toEqual({ owedToMe: 100, iOwe: 40 });
  });

  it('a settlement has a fixed id and moves money the right way', () => {
    expect(settleTx(d({}), 'wallet', 5)).toMatchObject({ id: 'debt:x', type: 'income', to: 'wallet' });
    expect(settleTx(d({ dir: 'owe' }), 'wallet', 5)).toMatchObject({ id: 'debt:x', type: 'expense', from: 'wallet' });
  });

  it('a settlement or a deletion on either device sticks', () => {
    const merged = mergeDebts([d({ id: '1' }), d({ id: '2', deleted: true })], [d({ id: '1', settled: true, settledTx: 'debt:1' }), d({ id: '2' })]);
    expect(merged?.find((x) => x.id === '1')).toMatchObject({ settled: true, settledTx: 'debt:1' });
    expect(merged?.find((x) => x.id === '2')?.deleted).toBe(true);
  });
});

describe('uneven bill shares', () => {
  it('by amount: the payer keeps the rest', () => {
    expect(customShares(500, 'amount', [200, 150])).toEqual({ shares: [200, 150], mine: 150, error: null });
  });

  it('by percent: rounded down, dust stays with the payer', () => {
    expect(customShares(1000, 'percent', [33.3, 33.3])).toEqual({ shares: [333, 333], mine: 334, error: null });
  });

  it('refuses more than the bill, over 100%, or an empty share', () => {
    expect(customShares(100, 'amount', [80, 30]).error).toMatch(/lớn hơn hóa đơn/);
    expect(customShares(100, 'percent', [60, 50]).error).toMatch(/100%/);
    expect(customShares(100, 'amount', [100, 0]).error).toMatch(/lớn hơn 0/);
  });

  it('billLines uses the given shares', () => {
    const { debts } = billLines({ id: 'b', total: 500, from: 'f', note: '', friends: ['An', 'Bình'], includeMe: true, now: 1, shares: [200, 150] });
    expect(debts.map((d) => d.amount)).toEqual([200, 150]);
  });
});

describe('partial payments and due dates', () => {
  const loan: Debt = { id: 'L', who: 'An', dir: 'owed', amount: 300, note: 'mượn', ts: 1 };
  const pay = (n: string, amount: number, deleted?: boolean): Tx => ({ ...partTx(loan, amount, 'wallet', 1, n), ...(deleted ? { deleted } : {}) });

  it('parts add up; a deleted part does not count', () => {
    const txs = [pay('a', 100), pay('b', 50), pay('c', 999, true)];
    expect(paidOf(loan, txs)).toBe(150);
    expect(remainingOf(loan, txs)).toBe(150);
    expect(isOpen(loan, txs)).toBe(true);
  });

  it('a debt paid in parts is done and leaves the totals', () => {
    const txs = [pay('a', 100), pay('b', 200)];
    expect(isDone(loan, txs)).toBe(true);
    expect(isOpen(loan, txs)).toBe(false);
    expect(totals([loan], txs)).toEqual({ owedToMe: 0, iOwe: 0 });
  });

  it('totals and people use what is left', () => {
    const txs = [pay('a', 100)];
    expect(totals([loan], txs).owedToMe).toBe(200);
    expect(byPerson([loan], txs)[0].net).toBe(200);
  });

  it('a part never matches another debt with a similar id', () => {
    expect(paysDebt({ id: 'L' }, pay('a', 1))).toBe(true);
    expect(paysDebt({ id: 'L:0' }, pay('a', 1))).toBe(false);
    expect(paysDebt({ id: 'L' }, { id: 'debt:L:0', ts: 1, type: 'income', amount: 1, note: '' })).toBe(false);
  });

  it('undoing a bill also undoes parts paid against it', () => {
    const debt: Debt = { id: 'bill:0', who: 'An', dir: 'owed', amount: 100, note: '', ts: 1, batch: 'bill' };
    const s: State = {
      jars: [],
      sound: true,
      haptics: true,
      debts: [debt],
      txs: [{ id: 'bill', ts: 1, type: 'expense', amount: 300, from: 'wallet', batch: 'bill', note: '' }, partTx(debt, 40, 'wallet', 2, 'x')],
    };
    expect(reducer(s, { t: 'undoBill', id: 'bill' }).txs.every((t) => t.deleted)).toBe(true);
  });

  it('counts days to the due date', () => {
    const now = new Date(2026, 10, 10, 18);
    expect(dueIn({ due: '2026-11-10' }, now)).toBe(0);
    expect(dueIn({ due: '2026-11-13' }, now)).toBe(3);
    expect(dueIn({ due: '2026-11-01' }, now)).toBe(-9);
    expect(dueIn({}, now)).toBeNull();
  });
});

describe('goalPlan', () => {
  const now = new Date(2026, 5, 1, 12);
  const save = (p: Partial<Jar>): Jar => ({ id: 's', name: 's', kind: 'save', hue: 'sky', theme: 'pig', goal: 1_200_000, created: new Date(2026, 0, 1).getTime(), ...p });

  it('ignores spending jars', () => expect(goalPlan(save({ kind: 'spend' }), 0, now)).toBeNull());
  it('done once the target is reached', () => expect(goalPlan(save({}), 1_300_000, now)?.state).toBe('done'));
  it('open without a date', () => expect(goalPlan(save({}), 0, now)?.state).toBe('open'));
  it('overdue after the date', () => expect(goalPlan(save({ due: '2026-05-31' }), 0, now)?.state).toBe('overdue'));

  it('behind when more than 10% under the straight line', () => {
    const p = goalPlan(save({ due: '2026-12-31' }), 100_000, now)!;
    expect(p.state).toBe('behind');
    expect(p.gap).toBeGreaterThan(0);
    expect(p.perMonth % 1000).toBe(0);
  });

  it('on track near the line', () => {
    const p = goalPlan(save({ due: '2026-12-31' }), 500_000, now)!;
    expect(p.state).toBe('ontrack');
  });
});

describe('streakInfo', () => {
  const now = new Date(2026, 10, 10, 20);
  const on = (daysAgo: number, id = `t${daysAgo}`): Tx => ({ id, ts: now.getTime() - daysAgo * DAY, type: 'expense', amount: 1, from: 'wallet', note: '' });

  it('counts consecutive days ending today or yesterday', () => {
    expect(streakInfo([on(0), on(1), on(2), on(5)], now)).toMatchObject({ current: 3, best: 3, loggedToday: true, days: 4 });
    expect(streakInfo([on(1), on(2)], now)).toMatchObject({ current: 2, loggedToday: false });
    expect(streakInfo([on(2), on(3)], now).current).toBe(0);
  });

  it('lines SYM writes on its own do not count', () => {
    expect(streakInfo([on(0, 'r:rent:2026-11'), on(1, 'debt:x')], now).days).toBe(0);
  });
});

describe('backup', () => {
  const s: State = {
    jars: [{ id: 'food', name: 'Ăn uống', kind: 'spend', hue: 'sage', theme: 'jar', goal: 100, created: 1 }],
    txs: [
      { id: 'a', ts: 1, type: 'income', amount: 500, to: 'wallet', note: '=HYPERLINK("x")' },
      { id: 'b', ts: 2, type: 'transfer', amount: 100, from: 'wallet', to: 'food', note: 'chia, "nhé"' },
    ],
    sound: true,
    haptics: false,
    rule: { food: 50 },
  };

  it('round-trips through JSON', () => {
    const r = parseBackup(backupJson(s));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.txs).toEqual(s.txs);
      expect(r.state.rule).toEqual({ food: 50 });
      expect(r.state.haptics).toBe(false);
    }
  });

  it('rejects a damaged file as a whole', () => {
    const bad = JSON.parse(backupJson(s));
    bad.state.txs[1].amount = 'nhiều';
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    expect(parseBackup('not json').ok).toBe(false);
  });

  it('CSV defuses formulas and quotes commas', () => {
    const csv = txCsv(s);
    expect(csv).toContain(`'=HYPERLINK(""x"")`);
    expect(csv).toContain('"chia, ""nhé"""');
  });
});
