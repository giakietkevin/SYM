import { useMemo, useState } from 'react';
import { fmt, fmtD } from '../lib/money';
import { planRefill, type Refill, type RefillStep } from '../lib/rollover';
import type { Store } from '../lib/store';
import { HUES } from '../lib/types';
import { Seg, Sheet } from './ui';

/** Start of a new month: bring each spending jar back to its limit, one choice per jar. */
export function MonthSheet({
  store,
  month,
  onApply,
  onSkip,
  onClose,
}: {
  store: Store;
  month: number;
  onApply: (steps: RefillStep[]) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [modes, setModes] = useState<Record<string, Refill>>({});
  const plan = useMemo(() => planRefill(store.jars, store.bal, store.wallet, modes), [store.jars, store.bal, store.wallet, modes]);
  const short = plan.steps.filter((s) => s.short);
  const moving = plan.steps.some((s) => s.move !== 0);

  return (
    <Sheet title={`Bắt đầu tháng ${month}`} onClose={onClose}>
      <p className="hint">
        Chọn cách nạp lại cho từng hũ chi tiêu. <b>Nạp đủ</b> đưa hũ về đúng hạn mức (tiền còn lại được tính, tiền thừa về Ví tổng). <b>Cộng thêm</b> giữ tiền còn lại và thêm một hạn mức nữa.
      </p>

      <div className="refill">
        {plan.steps.map((s) => {
          const h = HUES[s.jar.hue];
          return (
            <section key={s.jar.id} className="refill-row">
              <div className="refill-head">
                <span className="split-name" style={{ background: h.bg, color: h.ink }}>
                  {s.jar.name}
                </span>
                <span className="num refill-fig">
                  {fmt(s.before)}₫ → <b>{fmt(s.after)}₫</b>
                </span>
              </div>
              <Seg
                label={`Cách nạp lại hũ ${s.jar.name}`}
                value={s.mode}
                onChange={(m) => setModes((x) => ({ ...x, [s.jar.id]: m }))}
                options={[
                  { value: 'top', label: 'Nạp đủ' },
                  { value: 'add', label: 'Cộng thêm' },
                  { value: 'skip', label: 'Bỏ qua' },
                ]}
              />
              {s.short && <p className="error">Ví tổng không đủ, hũ này chỉ nạp được {fmtD(s.move)} trên {fmtD(s.need)} cần.</p>}
            </section>
          );
        })}
      </div>

      <p className="split-total num">Ví tổng sau khi nạp: {fmtD(plan.walletAfter)}</p>
      {short.length > 0 && <p className="hint">Thêm thu nhập vào Ví tổng trước nếu muốn nạp đủ tất cả.</p>}

      <div className="sticky-cta stack">
        <button className="btn primary block" onClick={() => onApply(plan.steps)}>
          {moving ? 'Nạp lại các hũ' : 'Xong, giữ nguyên'}
        </button>
        <button className="btn block" onClick={onSkip}>
          Bỏ qua tháng này
        </button>
      </div>
    </Sheet>
  );
}
