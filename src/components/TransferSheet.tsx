import { useState } from 'react';
import { evalExpr, fmtD } from '../lib/money';
import type { Store } from '../lib/store';
import { HUES, WALLET_TINT, type Loc } from '../lib/types';
import { AmountPad } from './AmountPad';
import { IconArrow } from './icons';
import type { NewTx } from './QuickAdd';
import { locName } from './TxRow';
import { Sheet } from './ui';

/** Money between the wallet and jars, or jar to jar ("rút bớt quỹ trà sữa bù cho tiền xe"). */
export function TransferSheet({
  store,
  from: from0,
  to: to0,
  onSubmit,
  onClose,
}: {
  store: Store;
  from?: Loc;
  to?: Loc;
  onSubmit: (t: NewTx) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState<Loc>(from0 ?? 'wallet');
  const [to, setTo] = useState<Loc | undefined>(to0);
  const [expr, setExpr] = useState('');
  const [note, setNote] = useState('');

  const amount = evalExpr(expr) ?? 0;
  const have = from === 'wallet' ? store.wallet : (store.bal[from] ?? 0);
  const fromName = locName(from, store.jars);
  const toName = locName(to, store.jars);
  const tooMuch = amount > have;
  const canSave = !!to && to !== from && amount > 0 && !tooMuch;

  const places: { id: Loc; name: string; bg: string; ink: string; bal: number }[] = [
    { id: 'wallet', name: 'Ví tổng', bg: WALLET_TINT.bg, ink: WALLET_TINT.ink, bal: store.wallet },
    ...store.jars.map((j) => ({ id: j.id, name: j.name, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink, bal: store.bal[j.id] ?? 0 })),
  ];

  const picker = (label: string, value: Loc | undefined, set: (l: Loc) => void, skip?: Loc) => (
    <section className="field">
      <h3 className="label">{label}</h3>
      <div className="chips" role="radiogroup" aria-label={label}>
        {places
          .filter((p) => p.id !== skip)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={value === p.id}
              className={`jar-chip ${value === p.id ? 'on' : ''}`}
              style={{ background: p.bg, color: p.ink }}
              onClick={() => set(p.id)}
            >
              <b>{p.name}</b>
            </button>
          ))}
      </div>
    </section>
  );

  return (
    <Sheet title="Chuyển tiền" onClose={onClose}>
      {picker('Từ', from, (l) => { setFrom(l); if (l === to) setTo(undefined); })}
      <div className="flow" aria-hidden="true">
        <IconArrow />
      </div>
      {picker('Sang', to, setTo, from)}

      <p className="hint num">
        {fromName} đang có {fmtD(have)}
      </p>
      <AmountPad expr={expr} onChange={setExpr} shortcuts={[50_000, 100_000, 500_000]} extraShortcut={{ label: 'Tất cả', value: have }} />
      {tooMuch && <p className="error">{fromName} chỉ còn {fmtD(have)}, chưa đủ để chuyển {fmtD(amount)}.</p>}

      <label className="field">
        <span className="label">Ghi chú</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rút bớt quỹ trà sữa bù cho tiền xe cộ" maxLength={80} />
      </label>

      <div className="sticky-cta">
        <button className="btn primary block" disabled={!canSave} onClick={() => to && onSubmit({ type: 'transfer', amount, from, to, note: note.trim() })}>
          {canSave ? `Chuyển ${fmtD(amount)} sang ${toName}` : to ? 'Nhập số tiền' : 'Chọn hũ nhận tiền'}
        </button>
      </div>
    </Sheet>
  );
}
