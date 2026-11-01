import { dueIn, isOpen, remainingOf } from './debts';
import { balanceOf, negativePlaces } from './ledger';
import { short } from './money';
import { dateKey, nextDate, occurrenceId, occurrences } from './recurring';
import { streakInfo } from './streak';
import type { Jar, State } from './types';

export interface Reminder {
  /** stable for the thing it is about, so dismissing it for today sticks */
  id: string;
  kind: 'debt' | 'recurring' | 'log' | 'negative';
  /** negative: the place that is below zero */
  loc?: string;
  tone: 'late' | 'soon' | 'info';
  text: string;
}

const DAY = 86_400_000;
const AHEAD = 3;

const daysBetween = (from: string, to: string) => {
  const p = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round((p(to) - p(from)) / DAY);
};

const when = (days: number) => (days === 0 ? 'Hôm nay' : days === 1 ? 'Ngày mai' : `${days} ngày nữa`);

/**
 * What deserves a nudge right now, most urgent first. Worked out from the data every time, nothing is stored.
 * - debts due within 3 days, or overdue
 * - recurring lines due in the next 3 days (and whether the money is there)
 * - in the evening, a day with nothing logged yet (more pressing when a streak is at stake)
 */
export function reminders(state: State, jars: Jar[], now = new Date()): Reminder[] {
  const out: Reminder[] = [];
  const today = dateKey(now);

  for (const p of negativePlaces(state.txs, jars)) {
    out.push({ id: `neg:${p.loc}:${today}`, kind: 'negative', tone: 'late', loc: p.loc, text: `${p.name} đang âm ${short(-p.balance)}. Chuyển tiền vào để bù nhé` });
  }

  for (const d of state.debts ?? []) {
    if (!isOpen(d, state.txs)) continue;
    const days = dueIn(d, now);
    if (days === null || days > AHEAD) continue;
    const left = short(remainingOf(d, state.txs));
    const what = d.dir === 'owed' ? `${d.who} trả bạn ${left}` : `Trả ${d.who} ${left}`;
    out.push({
      id: `debt:${d.id}`,
      kind: 'debt',
      tone: days < 0 ? 'late' : 'soon',
      text: days < 0 ? `${what}: đã quá hạn ${-days} ngày` : `${what}: hạn ${when(days).toLowerCase()}`,
    });
  }

  const have = new Set(state.txs.map((t) => t.id));
  for (const r of state.recurring ?? []) {
    if (r.deleted || !(r.amount > 0)) continue;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    // today's line is normally written already; one still missing is waiting for money
    const waitingToday = occurrences(r, now).some((o) => o.date === today && !have.has(occurrenceId(r, o.key)));
    const next = waitingToday ? today : nextDate(r, tomorrow);
    const days = daysBetween(today, next);
    if (days < 0 || days > AHEAD) continue;
    const name = r.note || 'Khoản định kỳ';
    if (r.type === 'income') {
      out.push({ id: `rec:${r.id}:${next}`, kind: 'recurring', tone: 'info', text: `${when(days)}: nhận ${name} ${short(r.amount)}` });
      continue;
    }
    const from = r.from ?? 'wallet';
    const enough = balanceOf(state.txs, from) >= r.amount;
    const place = from === 'wallet' ? 'Ví tổng' : (jars.find((j) => j.id === from)?.name ?? 'hũ đã đóng');
    out.push({
      id: `rec:${r.id}:${next}`,
      kind: 'recurring',
      tone: enough ? 'info' : 'soon',
      text: `${when(days)}: trừ ${name} ${short(r.amount)}${enough ? '' : `, ${place} chưa đủ tiền`}`,
    });
  }

  if (now.getHours() >= 19 && state.txs.some((t) => !t.deleted)) {
    const s = streakInfo(state.txs, now);
    if (!s.loggedToday) {
      out.push({
        id: `log:${today}`,
        kind: 'log',
        tone: s.current >= 2 ? 'soon' : 'info',
        text: s.current >= 2 ? `Hôm nay chưa ghi gì. Ghi một khoản để giữ chuỗi ${s.current} ngày nhé` : 'Hôm nay chưa ghi khoản chi nào. Có tiêu gì không?',
      });
    }
  }

  const rank = { late: 0, soon: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
