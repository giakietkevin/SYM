import type { Jar } from './types';

const DAY = 86_400_000;

export type GoalState = 'done' | 'ontrack' | 'behind' | 'overdue' | 'open';

export interface GoalPlan {
  state: GoalState;
  /** 0..100 */
  pct: number;
  remaining: number;
  /** how much to put in each month to finish by the due date (0 when done, overdue or no date) */
  perMonth: number;
  /** days until the due date, negative once it has passed */
  daysLeft: number;
  /** what a steady plan from creation to the due date would have saved by now */
  expected: number;
  /** how far behind that plan, 0 when on track */
  gap: number;
}

/** "YYYY-MM-DD" as the end of that local day. */
const endOfDay = (due: string) => {
  const [y, m, d] = due.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
};

const up1000 = (n: number) => Math.ceil(n / 1000) * 1000;

/**
 * Where a saving jar stands against its target. A jar with no date is just "open".
 * "Behind" means more than 10% under the straight line from the day the jar was made to the due date.
 */
export function goalPlan(jar: Jar, balance: number, now = new Date()): GoalPlan | null {
  if (jar.kind !== 'save' || !(jar.goal > 0)) return null;
  const remaining = Math.max(0, jar.goal - balance);
  const pct = Math.max(0, Math.round((balance / jar.goal) * 100));
  const base = { pct, remaining, perMonth: 0, daysLeft: 0, expected: 0, gap: 0 };
  if (remaining === 0) return { ...base, state: 'done' };
  if (!jar.due || !/^\d{4}-\d{2}-\d{2}$/.test(jar.due)) return { ...base, state: 'open' };

  const end = endOfDay(jar.due);
  const daysLeft = Math.ceil((end - now.getTime()) / DAY);
  if (now.getTime() > end) return { ...base, state: 'overdue', daysLeft };

  const span = Math.max(DAY, end - jar.created);
  const f = Math.min(1, Math.max(0, (now.getTime() - jar.created) / span));
  const expected = Math.round(jar.goal * f);
  const behind = balance < expected * 0.9;
  const months = Math.max(1, daysLeft / 30.4375);
  return {
    ...base,
    state: behind ? 'behind' : 'ontrack',
    daysLeft,
    expected,
    gap: behind ? expected - balance : 0,
    perMonth: up1000(remaining / months),
  };
}
