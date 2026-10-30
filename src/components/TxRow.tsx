import { fmtSigned } from '../lib/money';
import { HUES, type Jar, type Loc, type Tx } from '../lib/types';

export const time = (ts: number) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

export function dayLabel(ts: number, now = new Date()) {
  const d = new Date(ts);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'Hôm nay';
  if (sameDay(d, y)) return 'Hôm qua';
  const s = d.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function locName(loc: Loc | undefined, jars: Jar[]) {
  if (!loc) return '—';
  if (loc === 'wallet') return 'Ví tổng';
  return jars.find((j) => j.id === loc)?.name ?? 'Hũ đã đóng';
}

export function TxRow({ tx, jars }: { tx: Tx; jars: Jar[] }) {
  // the mark follows the jar the line is about: the one money left, or the one it reached
  const subject = tx.type === 'income' ? tx.to : tx.type === 'expense' ? tx.from : tx.to === 'wallet' ? tx.from : tx.to;
  const jar = jars.find((j) => j.id === subject);
  const tint = jar ? HUES[jar.hue] : { bg: '#eef1f4', ink: '#3a3d40' };
  const initial = (locName(subject, jars)[0] ?? '·').toUpperCase();

  const title = tx.note || (tx.type === 'income' ? 'Thu nhập' : tx.type === 'expense' ? 'Chi tiêu' : 'Chuyển tiền');
  const sub =
    tx.type === 'transfer'
      ? `${locName(tx.from, jars)} → ${locName(tx.to, jars)}`
      : tx.type === 'income'
        ? `Vào ${locName(tx.to, jars)}`
        : locName(tx.from, jars);

  return (
    <li className="tx">
      <span className="tx-mark" style={{ background: tint.bg, color: tint.ink }} aria-hidden="true">
        {initial}
      </span>
      <span className="tx-main">
        <span className="tx-title">{title}</span>
        <span className="tx-sub">
          {sub} · {time(tx.ts)}
        </span>
      </span>
      <span className={`tx-amt num ${tx.type}`}>{fmtSigned(tx.amount, tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '')}</span>
    </li>
  );
}
