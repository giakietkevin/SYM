import { describe, expect, it } from 'vitest';
import { pushPlan } from './pushplan';
import { parseBackup, backupJson } from './backup';
import { mergeStates } from './ledger';
import type { Jar, State, Tx } from './types';

const jars: Jar[] = [{ id: 'home', name: 'Nhà', kind: 'spend', hue: 'sage', theme: 'house', goal: 0, created: 0 }];
const now = new Date(2026, 10, 10, 9, 30); // Tuesday 10 Nov 2026, 09:30
const line = (d: Date, p: Partial<Tx> = {}): Tx => ({ id: `t${d.getTime()}`, ts: d.getTime(), type: 'expense', amount: 1, from: 'wallet', note: '', ...p });
const funded: Tx = { id: 'seed', ts: new Date(2026, 0, 1, 12).getTime(), type: 'income', amount: 1_000_000_000, to: 'wallet', note: '' };
const base = (p: Partial<State> = {}): State => ({ jars, sound: true, haptics: true, ...p, txs: [funded, ...(p.txs ?? [line(new Date(2026, 10, 9, 12))])] });
const hm = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('pushPlan', () => {
  it('an evening nudge every day for a week, each only if nothing was logged that day', () => {
    const log = pushPlan(base(), jars, now).filter((p) => p.id.startsWith('log:'));
    expect(log.map((p) => hm(p.at))).toEqual(['10/11 20:00', '11/11 20:00', '12/11 20:00', '13/11 20:00', '14/11 20:00', '15/11 20:00', '16/11 20:00']);
    expect(log[0]).toMatchObject({ id: 'log:2026-11-10', ifNoLogSince: new Date(2026, 10, 10).getTime() });
  });

  it('no nudge today once something is logged today, or once the hour has passed; the hour is a setting', () => {
    const logged = pushPlan(base({ txs: [line(new Date(2026, 10, 10, 8))] }), jars, now).filter((p) => p.id.startsWith('log:'));
    expect(logged[0].id).toBe('log:2026-11-11');
    const late = pushPlan(base(), jars, new Date(2026, 10, 10, 21)).filter((p) => p.id.startsWith('log:'));
    expect(late[0].id).toBe('log:2026-11-11');
    const seven = pushPlan(base({ notify: { log: true, hour: 7, bills: true, debts: true } }), jars, now).filter((p) => p.id.startsWith('log:'));
    expect(hm(seven[0].at)).toBe('11/11 7:00');
  });

  it('nothing to nudge about for an empty account', () => {
    expect(pushPlan({ jars, txs: [], sound: true, haptics: true }, jars, now)).toEqual([]);
  });

  it('the morning before each recurring line in the week, flagging a jar that cannot cover it', () => {
    const s = base({
      notify: { log: false, hour: 20, bills: true, debts: true },
      recurring: [
        { id: 'rent', type: 'expense', amount: 3_000_000, from: 'home', note: 'Tiền nhà', day: 12, start: '2026-01-01' },
        { id: 'gym', type: 'expense', amount: 1, from: 'wallet', note: 'Gym', freq: 'weekly', day: 2, start: '2026-01-01' },
      ],
    });
    const plan = pushPlan(s, jars, now);
    expect(plan.map((p) => [p.id, hm(p.at)])).toEqual([
      ['rec:rent:2026-11-12', '11/11 9:00'],
      ['rec:gym:2026-11-17', '16/11 9:00'],
    ]);
    expect(plan[0].body).toBe('Mai trừ Tiền nhà 3tr từ Nhà, hũ chưa đủ tiền.');
  });

  it('debts: the morning before and the morning of the due date, only while open', () => {
    const s = base({
      notify: { log: false, hour: 20, bills: false, debts: true },
      debts: [
        { id: 'a', who: 'An', dir: 'owed', amount: 100_000, note: 'mượn', ts: 1, due: '2026-11-12' },
        { id: 'b', who: 'Bình', dir: 'owe', amount: 1, note: '', ts: 1, due: '2026-11-11', settled: true },
        { id: 'c', who: 'Chi', dir: 'owe', amount: 1, note: '', ts: 1, due: '2026-11-01' },
      ],
    });
    expect(pushPlan(s, jars, now).map((p) => [p.id, hm(p.at), p.body])).toEqual([
      ['debt:a:2026-11-12:-1', '11/11 9:00', 'An trả bạn 100k (mượn).'],
      ['debt:a:2026-11-12:0', '12/11 9:00', 'An trả bạn 100k (mượn).'],
    ]);
  });

  it('switched-off kinds are left out', () => {
    const s = base({
      notify: { log: false, hour: 20, bills: false, debts: false, negative: false },
      txs: [line(new Date(2026, 10, 9, 12), { from: 'home' })],
      recurring: [{ id: 'r', type: 'income', amount: 1, to: 'wallet', note: 'x', day: 12, start: '2026-01-01' }],
    });
    expect(pushPlan(s, jars, now)).toEqual([]);
  });

  it('every morning while the wallet or a jar is below zero, checked again by the server', () => {
    const s = base({ notify: { log: false, hour: 20, bills: false, debts: false }, txs: [line(new Date(2026, 10, 9, 12), { from: 'home', amount: 120_000 })] });
    const neg = pushPlan(s, jars, now);
    expect(neg.map((p) => p.id)).toEqual(['neg:home:2026-11-11', 'neg:home:2026-11-12', 'neg:home:2026-11-13', 'neg:home:2026-11-14', 'neg:home:2026-11-15', 'neg:home:2026-11-16']);
    expect(neg[0]).toMatchObject({ at: new Date(2026, 10, 11, 9).getTime(), ifNegative: 'home', body: 'Hũ Nhà đang âm 120k. Chuyển tiền vào để bù nhé.' });
    expect(pushPlan({ ...s, notify: { ...s.notify!, negative: false } }, jars, now)).toEqual([]);
  });

  it('the choices survive a backup and a merge', () => {
    const notify = { log: false, hour: 7, bills: true, debts: false, negative: true };
    const r = parseBackup(backupJson(base({ notify })));
    expect(r.ok && r.state.notify).toEqual(notify);
    expect(mergeStates(base(), base({ notify })).notify).toEqual(notify);
  });
});
