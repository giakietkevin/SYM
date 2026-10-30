import { fmtD } from '../lib/money';
import { jarStatus, monthsLeft } from '../lib/jar';
import type { Store } from '../lib/store';
import { HUES, THEME_NAMES, type Jar, type Tx } from '../lib/types';
import { IconEdit, IconPlus, IconSwap } from './icons';
import { JarArt } from './JarArt';
import { TxRow } from './TxRow';
import { Money, Sheet } from './ui';

export function JarDetail({
  jar,
  store,
  onAddMoney,
  onTransfer,
  onSpend,
  onEdit,
  onOpenTx,
  onClose,
}: {
  jar: Jar;
  store: Store;
  onAddMoney: () => void;
  onTransfer: () => void;
  onSpend: () => void;
  onEdit: () => void;
  onOpenTx: (tx: Tx) => void;
  onClose: () => void;
}) {
  const bal = store.bal[jar.id] ?? 0;
  const st = jarStatus(jar, bal, store.funded[jar.id]);
  const h = HUES[jar.hue];
  const recent = store.txs.filter((t) => t.from === jar.id || t.to === jar.id).slice(0, 5);
  const perMonth = jar.kind === 'save' && jar.due && bal < jar.goal ? Math.ceil((jar.goal - bal) / monthsLeft(jar.due)) : 0;

  return (
    <Sheet title={jar.name} onClose={onClose}>
      <div className="detail-top" style={{ background: h.bg, color: h.ink }}>
        <div className="detail-art">
          <JarArt theme={jar.theme} hue={jar.hue} fill={st.fill} low={st.low} />
        </div>
        <div>
          <p className="detail-cap">{jar.kind === 'spend' ? 'Còn trong hũ' : 'Đã tích lũy'}</p>
          <Money value={bal} className="detail-fig" />
          <p className="detail-sub num">
            {jar.kind === 'spend'
              ? !store.funded[jar.id]
                ? `Hạn mức ${fmtD(jar.goal)}. Chưa chia tiền vào hũ`
                : st.over
                ? `Lạm ${fmtD(-bal)} so với hạn mức ${fmtD(jar.goal)}`
                : `Đã dùng ${st.pct}% hạn mức ${fmtD(jar.goal)}`
              : `${st.pct}% của mục tiêu ${fmtD(jar.goal)}`}
          </p>
          {perMonth > 0 && jar.due && (
            <p className="detail-sub num">
              Còn {monthsLeft(jar.due)} tháng, mỗi tháng gửi thêm {fmtD(perMonth)}
            </p>
          )}
          <p className="detail-theme">{THEME_NAMES[jar.theme]}</p>
        </div>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={onAddMoney}>
          <IconPlus /> Thêm tiền
        </button>
        {jar.kind === 'spend' && (
          <button className="btn" onClick={onSpend}>
            Ghi chi tiêu
          </button>
        )}
        <button className="btn" onClick={onTransfer}>
          <IconSwap /> Chuyển
        </button>
        <button className="btn" onClick={onEdit}>
          <IconEdit /> Sửa
        </button>
      </div>

      <h3 className="label">Gần đây</h3>
      {recent.length ? (
        <ul className="txs">{recent.map((t) => <TxRow key={t.id} tx={t} jars={store.state.jars} onOpen={onOpenTx} />)}</ul>
      ) : (
        <p className="empty">Chưa có giao dịch nào trong hũ này.</p>
      )}
    </Sheet>
  );
}
