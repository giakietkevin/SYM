import { dueIn, isOpen, remainingOf } from './debts';
import { balanceOf } from './ledger';
import { short } from './money';
import { dateKey, nextDate } from './recurring';
import { streakInfo } from './streak';
import type { Jar, NotifyPrefs, State } from './types';

export const defaultNotify: NotifyPrefs = { log: true, hour: 20, bills: true, debts: true };

export const notifyOf = (s: Pick<State, 'notify'>): NotifyPrefs => ({ ...defaultNotify, ...(s.notify ?? {}) });

/**
 * One notification the server should send at `at` (ms). `id` is stable for the thing it is about, so the server never
 * sends the same one twice however often the plan is replaced. `ifNoLogSince`: send only if nothing was logged by
 * the person since then (checked by the server at send time, so logging on any device cancels it).
 */
export interface PushItem {
  id: string;
  at: number;
  title: string;
  body: string;
  ifNoLogSince?: number;
}

const MORNING = 9;
const at = (day: Date, hour: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0).getTime();
const plusDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

/**
 * What to send over the next `days` days, by local time on this device:
 * - an evening nudge each day at `hour` when nothing has been logged that day
 * - the morning before a recurring line is written (and whether the money is there)
 * - the morning before a debt is due, and the morning of the due date
 * Built from the same data as the in-app reminders; replaced whenever the data changes.
 */
export function pushPlan(state: State, jars: Jar[], now = new Date(), days = 7): PushItem[] {
  const prefs = notifyOf(state);
  const out: PushItem[] = [];
  const t = now.getTime();
  const end = at(plusDays(now, days), 0);

  if (prefs.log && state.txs.some((x) => !x.deleted)) {
    const s = streakInfo(state.txs, now);
    for (let i = 0; i < days; i++) {
      const day = plusDays(now, i);
      const when = at(day, prefs.hour);
      if (when <= t || (i === 0 && s.loggedToday)) continue;
      out.push({
        id: `log:${dateKey(day)}`,
        at: when,
        title: 'Hôm nay bạn đã tiêu gì?',
        body: i === 0 && s.current >= 2 ? `Ghi một khoản để giữ chuỗi ${s.current} ngày nhé.` : 'Chưa có khoản nào được ghi hôm nay. Ghi lại trong 5 giây nhé.',
        ifNoLogSince: at(day, 0),
      });
    }
  }

  if (prefs.bills) {
    for (const r of state.recurring ?? []) {
      if (r.deleted || !(r.amount > 0)) continue;
      const name = r.note || 'Khoản định kỳ';
      let from = plusDays(now, 1);
      for (let guard = 0; guard < 60; guard++) {
        const date = nextDate(r, from);
        const day = parse(date);
        if (date < dateKey(from) || at(day, 0) > end) break;
        const when = at(plusDays(day, -1), MORNING);
        if (when > t) {
          let body: string;
          if (r.type === 'income') body = `Mai nhận ${name} ${short(r.amount)}.`;
          else {
            const loc = r.from ?? 'wallet';
            const place = loc === 'wallet' ? 'Ví tổng' : (jars.find((j) => j.id === loc)?.name ?? 'hũ đã đóng');
            body = `Mai trừ ${name} ${short(r.amount)} từ ${place}${balanceOf(state.txs, loc) < r.amount ? ', hũ chưa đủ tiền.' : '.'}`;
          }
          out.push({ id: `rec:${r.id}:${date}`, at: when, title: r.type === 'income' ? 'Sắp có tiền vào' : 'Sắp đến khoản định kỳ', body });
        }
        from = plusDays(day, 1);
      }
    }
  }

  if (prefs.debts) {
    for (const d of state.debts ?? []) {
      if (!isOpen(d, state.txs) || !d.due) continue;
      const left = dueIn(d, now);
      if (left === null || left < 0) continue;
      const what = d.dir === 'owed' ? `${d.who} trả bạn ${short(remainingOf(d, state.txs))}` : `Trả ${d.who} ${short(remainingOf(d, state.txs))}`;
      const due = parse(d.due);
      for (const [offset, label] of [
        [-1, 'Mai đến hạn'],
        [0, 'Hôm nay đến hạn'],
      ] as const) {
        const when = at(plusDays(due, offset), MORNING);
        if (when > t && when <= end) out.push({ id: `debt:${d.id}:${d.due}:${offset}`, at: when, title: label, body: `${what}${d.note ? ` (${d.note})` : ''}.` });
      }
    }
  }

  return out.sort((a, b) => a.at - b.at).slice(0, 60);
}
