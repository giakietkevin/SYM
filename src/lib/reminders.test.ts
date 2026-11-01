import { describe, expect, it } from 'vitest';
import { reminders } from './reminders';
import type { Jar, State, Tx } from './types';

const jars: Jar[] = [{ id: 'home', name: 'Nhà', kind: 'spend', hue: 'sage', theme: 'house', goal: 0, created: 0 }];
const funded: Tx = { id: 'seed', ts: new Date(2026, 0, 1, 12).getTime(), type: 'income', amount: 1_000_000_000, to: 'wallet', note: '' };
const base = (p: Partial<State>): State => ({ jars, sound: true, haptics: true, ...p, txs: [funded, ...(p.txs ?? [])] });
const morning = new Date(2026, 10, 10, 9); // Tuesday 10 Nov 2026
const evening = new Date(2026, 10, 10, 20);
const line = (ts: Date, p: Partial<Tx> = {}): Tx => ({ id: `t${ts.getTime()}`, ts: ts.getTime(), type: 'expense', amount: 1, from: 'wallet', note: '', ...p });

describe('reminders', () => {
  it('debts due within 3 days or overdue, most urgent first', () => {
    const s = base({
      debts: [
        { id: 'a', who: 'An', dir: 'owed', amount: 100_000, note: '', ts: 1, due: '2026-11-12' },
        { id: 'b', who: 'Bình', dir: 'owe', amount: 50_000, note: '', ts: 1, due: '2026-11-08' },
        { id: 'c', who: 'Chi', dir: 'owed', amount: 1, note: '', ts: 1, due: '2026-12-01' },
        { id: 'd', who: 'Dũng', dir: 'owed', amount: 1, note: '', ts: 1, due: '2026-11-10', settled: true },
      ],
    });
    const list = reminders(s, jars, morning);
    expect(list.map((r) => r.id)).toEqual(['debt:b', 'debt:a']);
    expect(list[0]).toMatchObject({ tone: 'late', text: 'Trả Bình 50k: đã quá hạn 2 ngày' });
    expect(list[1].text).toBe('An trả bạn 100k: hạn 2 ngày nữa');
  });

  it('a recurring expense due soon, flagged when the jar cannot cover it', () => {
    const s = base({
      recurring: [{ id: 'rent', type: 'expense', amount: 3_000_000, from: 'home', note: 'Tiền nhà', day: 11, start: '2026-01-01' }],
      txs: [{ id: 'in', ts: 1, type: 'income', amount: 1_000_000, to: 'home', note: '' }],
    });
    const [r] = reminders(s, jars, morning);
    expect(r).toMatchObject({ id: 'rec:rent:2026-11-11', tone: 'soon', text: 'Ngày mai: trừ Tiền nhà 3tr, Nhà chưa đủ tiền' });
  });

  it('nothing for a recurring line further away', () => {
    const s = base({ recurring: [{ id: 'x', type: 'income', amount: 1, to: 'wallet', note: 'Lương', day: 25, start: '2026-01-01' }] });
    expect(reminders(s, jars, morning)).toEqual([]);
  });

  it('nudges in the evening only when nothing was logged today', () => {
    const yesterday = new Date(2026, 10, 9, 12);
    const before = new Date(2026, 10, 8, 12);
    const s = base({ txs: [line(before), line(yesterday)] });
    expect(reminders(s, jars, morning)).toEqual([]);
    expect(reminders(s, jars, evening)[0]).toMatchObject({ kind: 'log', tone: 'soon' });
    expect(reminders(base({ txs: [line(new Date(2026, 10, 10, 8))] }), jars, evening)).toEqual([]);
  });

  it('a jar or the wallet below zero comes first, with how much', () => {
    const s: State = { jars, sound: true, haptics: true, txs: [line(new Date(2026, 10, 10, 8), { from: 'home', amount: 120_000 })] };
    const [r] = reminders(s, jars, morning);
    expect(r).toMatchObject({ kind: 'negative', tone: 'late', loc: 'home', text: 'Hũ Nhà đang âm 120k. Chuyển tiền vào để bù nhé' });
  });
});
