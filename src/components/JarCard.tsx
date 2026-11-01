import type { KeyboardEvent, PointerEvent } from 'react';
import { fmt, fmtD } from '../lib/money';
import { goalPlan } from '../lib/goal';
import { jarStatus } from '../lib/jar';
import { HUES, CORAL, type Jar } from '../lib/types';
import { JarArt } from './JarArt';

export interface Fx {
  id: string;
  kind: 'in' | 'out';
  amount: number;
  n: number;
}

function saveSub(jar: Jar, balance: number, pct: number): string {
  const plan = goalPlan(jar, balance);
  if (plan?.state === 'done') return 'Đã đạt mục tiêu';
  if (plan?.state === 'overdue') return `Quá hạn, thiếu ${fmtD(plan.remaining)}`;
  if (plan?.state === 'behind') return `${pct}% · chậm tiến độ`;
  return `${pct}% của ${fmtD(jar.goal)}`;
}

export function JarCard({
  jar,
  balance,
  funded,
  over,
  fx,
  onOpen,
  onPress,
}: {
  jar: Jar;
  balance: number;
  funded: boolean;
  over: boolean;
  fx: Fx | null;
  onOpen: () => void;
  onPress: (e: PointerEvent) => void;
}) {
  const st = jarStatus(jar, balance, funded);
  const tint = st.low ? CORAL : HUES[jar.hue];
  const mine = fx && fx.id === jar.id ? fx : null;

  const sub =
    jar.kind === 'spend'
      ? !funded
        ? 'Chưa chia tiền vào hũ'
        : st.over
        ? `Lạm ${fmtD(-balance)}`
        : `Đã dùng ${st.pct}% hạn mức`
      : saveSub(jar, balance, st.pct);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-drop={jar.id}
      className={`jar ${over ? 'is-over' : ''} ${st.low ? 'is-low' : ''} ${mine ? 'bump' : ''}`}
      style={{ background: HUES[jar.hue].bg, color: HUES[jar.hue].ink }}
      onClick={onOpen}
      onKeyDown={onKey}
      onPointerDown={onPress}
      aria-label={`${jar.name}, ${jar.kind === 'spend' ? 'còn' : 'đã có'} ${fmtD(balance)}. ${sub}`}
    >
      <div className="jar-art">
        <JarArt theme={jar.theme} hue={jar.hue} fill={st.fill} low={st.low} />
        {mine && mine.kind === 'in' && <span key={mine.n} className="coin" aria-hidden="true" />}
        {mine && (
          <span key={`f${mine.n}`} className={`float ${mine.kind}`} aria-hidden="true">
            {mine.kind === 'in' ? '+' : '−'}
            {fmt(mine.amount)}
          </span>
        )}
      </div>
      <div className="jar-meta">
        <div className="jar-name">{jar.name}</div>
        <div className="jar-fig num">
          {fmt(balance)}
          <span className="cur">₫</span>
        </div>
        <div className="jar-sub num">
          {st.low && jar.kind === 'spend' && (
            <span className="pill warn" style={{ background: tint.bg, color: tint.ink }}>
              Sắp cạn
            </span>
          )}
          <span>{sub}</span>
        </div>
      </div>
    </div>
  );
}
