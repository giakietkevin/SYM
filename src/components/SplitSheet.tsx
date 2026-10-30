import { useMemo, useState } from 'react';
import { evalExpr, fmt, fmtD } from '../lib/money';
import { planSplit, preset, ruleTotal, type Preset } from '../lib/split';
import type { Store } from '../lib/store';
import { HUES, type Rule } from '../lib/types';
import { Sheet } from './ui';

const toPct = (s: string) => Math.max(0, Math.min(100, Math.floor(Number(s.replace(/\D/g, '')) || 0)));

/**
 * The split rule: what share of every income goes to each jar. The same sheet applies it to
 * money sitting in the wallet right now. Whatever is not assigned stays in the wallet.
 */
export function SplitSheet({
  store,
  onApply,
  onSaveRule,
  onClose,
}: {
  store: Store;
  onApply: (rule: Rule, amount: number) => void;
  onSaveRule: (rule: Rule) => void;
  onClose: () => void;
}) {
  const jars = store.jars;
  const [pct, setPct] = useState<Record<string, string>>(() => Object.fromEntries(jars.map((j) => [j.id, String(store.state.rule?.[j.id] ?? 0)])));
  const [amountText, setAmountText] = useState(store.wallet > 0 ? String(store.wallet) : '');

  const rule: Rule = useMemo(() => Object.fromEntries(jars.map((j) => [j.id, toPct(pct[j.id] ?? '0')])), [jars, pct]);
  const total = ruleTotal(rule, jars);
  const amount = evalExpr(amountText) ?? 0;
  const lines = planSplit(amount, rule, jars);
  const sent = lines.reduce((s, l) => s + l.amount, 0);
  const share = (id: string) => lines.find((l) => l.jar.id === id)?.amount ?? 0;

  const over = total > 100;
  const tooMuch = amount > store.wallet;
  const canApply = !over && !tooMuch && sent > 0;

  const applyPreset = (k: Preset | 'none') => {
    const r = k === 'none' ? {} : preset(k, jars);
    setPct(Object.fromEntries(jars.map((j) => [j.id, String(r[j.id] ?? 0)])));
  };

  if (jars.length === 0) {
    return (
      <Sheet title="Quy tắc chia tiền" onClose={onClose}>
        <p className="empty">Tạo ít nhất một hũ trước, rồi quay lại đặt tỷ lệ chia.</p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Quy tắc chia tiền" onClose={onClose}>
      <p className="hint">Mỗi khi nhận thu nhập, SYM chia theo tỷ lệ này. Phần chưa gán vào hũ nào sẽ ở lại Ví tổng.</p>

      <div className="chips" role="group" aria-label="Mẫu có sẵn">
        <button type="button" className="chip" onClick={() => applyPreset('503020')}>
          50/30/20
        </button>
        <button type="button" className="chip" onClick={() => applyPreset('equal')}>
          Chia đều
        </button>
        <button type="button" className="chip" onClick={() => applyPreset('none')}>
          Xóa hết
        </button>
      </div>
      <p className="hint">50/30/20: 80% cho các hũ chi tiêu (cần thiết và muốn), 20% cho hũ tích lũy.</p>

      <div className="split">
        {jars.map((j) => {
          const h = HUES[j.hue];
          return (
            <label key={j.id} className="split-row">
              <span className="split-name" style={{ background: h.bg, color: h.ink }}>
                {j.name}
              </span>
              <span className="split-pct">
                <input
                  className="input num"
                  inputMode="numeric"
                  value={pct[j.id] ?? '0'}
                  onChange={(e) => setPct((p) => ({ ...p, [j.id]: String(toPct(e.target.value)) }))}
                  onFocus={(e) => e.target.select()}
                  aria-label={`Phần trăm cho hũ ${j.name}`}
                />
                <span aria-hidden="true">%</span>
              </span>
              <span className="split-amt num">{amount > 0 ? `${fmt(share(j.id))}₫` : '—'}</span>
            </label>
          );
        })}
      </div>

      <p className={`split-total num ${over ? 'bad' : ''}`}>
        Tổng {total}%{over ? '. Vượt quá 100%, hãy giảm bớt.' : `. ${100 - total}% ở lại Ví tổng.`}
      </p>

      <label className="field">
        <span className="label">Chia ngay từ Ví tổng (đang có {fmtD(store.wallet)})</span>
        <input className="input num" inputMode="text" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="Để trống nếu chỉ lưu quy tắc" />
        {tooMuch && <span className="error">Ví tổng chỉ có {fmtD(store.wallet)}.</span>}
        {canApply && <span className="hint num">Chia {fmtD(sent)} vào {lines.length} hũ, giữ lại {fmtD(amount - sent)}.</span>}
      </label>

      <div className="sticky-cta stack">
        <button className="btn primary block" disabled={!canApply} onClick={() => onApply(rule, amount)}>
          {canApply ? `Chia ${fmtD(sent)} và lưu quy tắc` : 'Nhập số tiền để chia ngay'}
        </button>
        <button className="btn block" disabled={over} onClick={() => onSaveRule(rule)}>
          Chỉ lưu quy tắc
        </button>
      </div>
    </Sheet>
  );
}
