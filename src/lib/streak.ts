import { dateKey } from './recurring';
import { ruleTotal } from './split';
import { isOpen } from './debts';
import type { Jar, State, Tx } from './types';

const DAY = 86_400_000;

/** Lines the person wrote themselves: what SYM writes on its own (monthly lines, settlements) never counts towards a streak. */
const byPerson = (t: Tx) => !t.deleted && !t.id.startsWith('r:') && !t.id.startsWith('debt:');

const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};

export interface Streak {
  /** consecutive days with at least one line, alive if the last one is today or yesterday */
  current: number;
  best: number;
  loggedToday: boolean;
  /** days with at least one line, ever */
  days: number;
}

export function streakInfo(txs: Tx[], now = new Date()): Streak {
  const keys = [...new Set(txs.filter(byPerson).map((t) => dateKey(new Date(t.ts))))].map(dayNumber).sort((a, b) => a - b);
  if (!keys.length) return { current: 0, best: 0, loggedToday: false, days: 0 };
  let best = 1;
  let run = 1;
  for (let i = 1; i < keys.length; i++) {
    run = keys[i] === keys[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const today = dayNumber(dateKey(now));
  const last = keys[keys.length - 1];
  const loggedToday = last === today;
  let current = 0;
  if (last === today || last === today - 1) {
    current = 1;
    for (let i = keys.length - 1; i > 0 && keys[i] === keys[i - 1] + 1; i--) current++;
  }
  return { current, best, loggedToday, days: keys.length };
}

export interface Badge {
  id: string;
  name: string;
  /** what it takes, shown while it is still locked */
  how: string;
  earned: boolean;
}

/** Badges are worked out from the ledger every time, never stored: nothing to sync, nothing to lose. */
export function badges(state: State, jars: Jar[], bal: Record<string, number>, now = new Date()): Badge[] {
  const txs = state.txs.filter(byPerson);
  const s = streakInfo(state.txs, now);
  const saveIds = new Set(jars.filter((j) => j.kind === 'save').map((j) => j.id));
  const spend = jars.filter((j) => j.kind === 'spend' && j.goal > 0);

  const goal = jars.some((j) => j.kind === 'save' && j.goal > 0 && (bal[j.id] ?? 0) >= j.goal);

  const savedIn = state.txs
    .filter((t) => !t.deleted && t.to && saveIds.has(t.to) && !(t.from && saveIds.has(t.from)))
    .reduce((n, t) => n + t.amount, 0);

  // a finished month with at least 5 logged days where no spending jar went past its monthly limit
  const thisMonth = dateKey(now).slice(0, 7);
  const months = new Map<string, { days: Set<string>; spent: Map<string, number>; any: boolean }>();
  for (const t of txs) {
    const k = dateKey(new Date(t.ts));
    const ym = k.slice(0, 7);
    const m = months.get(ym) ?? { days: new Set(), spent: new Map(), any: false };
    m.days.add(k);
    if (t.type === 'expense' && t.from) {
      m.spent.set(t.from, (m.spent.get(t.from) ?? 0) + t.amount);
      m.any = true;
    }
    months.set(ym, m);
  }
  const clean = spend.length > 0 && [...months].some(([ym, m]) => ym < thisMonth && m.any && m.days.size >= 5 && spend.every((j) => (m.spent.get(j.id) ?? 0) <= j.goal));

  return [
    { id: 'first', name: 'Bước đầu tiên', how: 'Ghi giao dịch đầu tiên', earned: txs.length > 0 },
    { id: 'streak7', name: 'Một tuần đều tay', how: 'Ghi chép 7 ngày liên tiếp', earned: s.best >= 7 },
    { id: 'streak30', name: 'Thói quen thép', how: 'Ghi chép 30 ngày liên tiếp', earned: s.best >= 30 },
    { id: 'planner', name: 'Có kế hoạch', how: 'Đặt quy tắc chia tiền hoặc một khoản định kỳ', earned: ruleTotal(state.rule, jars) > 0 || (state.recurring ?? []).some((r) => !r.deleted) },
    { id: 'saver', name: 'Người tích lũy', how: 'Bỏ tổng cộng 1.000.000₫ vào các hũ tích lũy', earned: savedIn >= 1_000_000 },
    { id: 'goal', name: 'Hũ đầy', how: 'Đạt mục tiêu của một hũ tích lũy', earned: goal },
    { id: 'clean', name: 'Tháng gọn gàng', how: 'Một tháng ghi chép từ 5 ngày mà không hũ chi tiêu nào lạm hạn mức', earned: clean },
    { id: 'sharer', name: 'Chia sòng phẳng', how: 'Thanh toán xong một khoản nợ hoặc chia tiền', earned: (state.debts ?? []).some((d) => !d.deleted && d.settled) },
  ];
}

export { isOpen };
