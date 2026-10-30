import { fmtD, short } from '../lib/money';
import { pulseKind, type Pulse, type PulseKind } from '../lib/pulse';
import { HUES } from '../lib/types';
import { dayLabel, time } from './TxRow';
import { Sheet } from './ui';

const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const dm = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const weekRange = (p: Pulse) => `${dm(p.start)} – ${dm(p.start + 6 * 86_400_000)}`;

/** The week in one friendly sentence. Every number in it is read from the Pulse. */
export function pulseText(k: PulseKind): { text: string; tone: 'good' | 'warn' | 'calm' } {
  switch (k.kind) {
    case 'pulled':
      return { tone: 'warn', text: `Tuần này bạn rút ${fmtD(k.amount)} từ hũ tích lũy. Không sao, tuần sau mình bù lại nhé.` };
    case 'shielded':
      return { tone: 'good', text: `Hũ tích lũy được giữ nguyên 100% và bạn gửi thêm ${fmtD(k.saved)}. Đỉnh chóp!` };
    case 'down':
      return { tone: 'good', text: `Chi tiêu thấp hơn ${k.pct}% so với cùng lúc tuần trước. Ví đang mỉm cười đó!` };
    case 'up':
      return { tone: 'warn', text: `Chi tiêu cao hơn ${k.pct}% so với cùng lúc tuần trước. Đi chậm lại xíu nha.` };
    case 'nolog':
      return { tone: 'calm', text: 'Tuần này chưa ghi gì cả. Có khoản nào thì chạm nút + để ghi nhé.' };
    case 'zero':
      return { tone: 'calm', text: 'Tuần này chưa chi đồng nào. Ví vui lắm!' };
    case 'steady':
      return { tone: 'calm', text: `Tuần này chi ${fmtD(k.spent)}. Ổn áp, cứ đều đều nhé.` };
  }
}

/** Seven columns, Monday first. Days that have not happened yet stay empty. */
function Bars({ pulse }: { pulse: Pulse }) {
  const max = Math.max(...pulse.perDay, 1);
  const peak = pulse.perDay.indexOf(Math.max(...pulse.perDay));
  const summary = pulse.perDay.map((v, i) => `${DAYS[i]} ${i > pulse.todayIndex ? 'chưa tới' : fmtD(v)}`).join(', ');
  return (
    <div className="bars" role="img" aria-label={`Chi tiêu từng ngày trong tuần: ${summary}`}>
      {pulse.perDay.map((v, i) => {
        const future = i > pulse.todayIndex;
        return (
          <div key={i} className={`bar-col ${i === pulse.todayIndex ? 'today' : ''}`}>
            <span className="bar-val num">{v > 0 && i === peak ? short(v) : ''}</span>
            <span className="bar-track">
              {!future && <span className="bar" style={{ height: v > 0 ? `${Math.max(4, (v / max) * 100)}%` : '2px' }} data-zero={v === 0} />}
            </span>
            <span className="bar-label">{DAYS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

function delta(p: Pulse) {
  if (p.prevSpent <= 0) return 'Cùng lúc tuần trước chưa có chi tiêu';
  return `${fmtD(p.prevSpent)} cùng lúc tuần trước`;
}

export function PulseCard({ pulse, onOpen }: { pulse: Pulse; onOpen: () => void }) {
  const say = pulseText(pulseKind(pulse));
  const top = pulse.byJar[0];
  const share = top && pulse.spent > 0 ? Math.round((top.amount / pulse.spent) * 100) : 0;
  return (
    <section className="pulse" aria-labelledby="h-pulse">
      <div className="sec-row">
        <h2 id="h-pulse" className="sec">
          Tuần này
        </h2>
        <button className="btn text" onClick={onOpen}>
          Chi tiết
        </button>
      </div>
      <p className={`pulse-say ${say.tone}`}>{say.text}</p>
      <Bars pulse={pulse} />
      <dl className="pulse-stats">
        <div>
          <dt>Đã chi</dt>
          <dd className="num">
            {fmtD(pulse.spent)}
            <small>{delta(pulse)}</small>
          </dd>
        </div>
        <div>
          <dt>Gửi vào hũ tích lũy</dt>
          <dd className="num">
            {fmtD(pulse.savedIn)}
            {pulse.saveJars > 0 && (
              <small>
                {pulse.protectedJars}/{pulse.saveJars} hũ giữ nguyên
              </small>
            )}
          </dd>
        </div>
        {top && (
          <div>
            <dt>Hũ chi nhiều nhất</dt>
            <dd className="num">
              {top.jar.name}
              <small>
                {fmtD(top.amount)}, {share}% tổng chi
              </small>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function PulseSheet({ pulse, onClose }: { pulse: Pulse; onClose: () => void }) {
  const say = pulseText(pulseKind(pulse));
  const maxJar = pulse.byJar[0]?.amount ?? 1;
  const b = pulse.biggest;
  return (
    <Sheet title={`Tuần ${weekRange(pulse)}`} onClose={onClose}>
      <p className={`pulse-say ${say.tone}`}>{say.text}</p>
      <Bars pulse={pulse} />

      <section className="field">
        <h3 className="label">Chi tiêu theo hũ</h3>
        {pulse.byJar.length ? (
          <ul className="jar-bars">
            {pulse.byJar.map((x) => (
              <li key={x.jar.id}>
                <span className="jb-name">{x.jar.name}</span>
                <span className="jb-amt num">{fmtD(x.amount)}</span>
                <span className="jb-track" aria-hidden="true">
                  <span style={{ width: `${(x.amount / maxJar) * 100}%`, background: HUES[x.jar.hue].mid }} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Chưa có khoản chi nào trong tuần này.</p>
        )}
      </section>

      <dl className="pulse-stats">
        <div>
          <dt>Tổng đã chi</dt>
          <dd className="num">
            {fmtD(pulse.spent)}
            <small>{delta(pulse)}</small>
          </dd>
        </div>
        {b && (
          <div>
            <dt>Khoản chi lớn nhất</dt>
            <dd className="num">
              {fmtD(b.amount)}
              <small>
                {b.note || 'Chi tiêu'}, {dayLabel(b.ts).toLowerCase()} {time(b.ts)}
              </small>
            </dd>
          </div>
        )}
        <div>
          <dt>Gửi vào hũ tích lũy</dt>
          <dd className="num">{fmtD(pulse.savedIn)}</dd>
        </div>
        <div>
          <dt>Rút khỏi hũ tích lũy</dt>
          <dd className="num">{pulse.pulledOut > 0 ? fmtD(pulse.pulledOut) : '0₫'}</dd>
        </div>
        <div>
          <dt>Ngày có ghi chép</dt>
          <dd className="num">
            {pulse.loggedDays}/{pulse.todayIndex + 1} ngày
          </dd>
        </div>
      </dl>
      <p className="hint">Tuần tính từ thứ Hai. So sánh luôn lấy cùng khoảng thời gian của tuần trước, nên đầu tuần không bị coi là chi ít.</p>
    </Sheet>
  );
}
