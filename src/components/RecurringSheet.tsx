import { useState } from 'react';
import { evalExpr, fmtD, fmtSigned } from '../lib/money';
import { dateKey, nextDate } from '../lib/recurring';
import type { Store } from '../lib/store';
import { uid } from '../lib/store';
import { HUES, WALLET_TINT, type Loc, type Recurring } from '../lib/types';
import { ruleTotal } from '../lib/split';
import { AmountPad } from './AmountPad';
import { locName } from './TxRow';
import { Seg, Sheet } from './ui';

const vnDate = (iso: string) => iso.split('-').reverse().join('/');

/** Rent, subscriptions, salary: written into the ledger by themselves every month. */
export function RecurringSheet({
  store,
  onSave,
  onRemove,
  onClose,
}: {
  store: Store;
  onSave: (r: Recurring) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const list = (store.state.recurring ?? []).filter((r) => !r.deleted);

  if (editing) {
    return (
      <Editor
        store={store}
        item={editing === 'new' ? undefined : editing}
        onBack={() => setEditing(null)}
        onSave={(r) => {
          onSave(r);
          setEditing(null);
        }}
        onRemove={(id) => {
          onRemove(id);
          setEditing(null);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet title="Giao dịch định kỳ" onClose={onClose}>
      <p className="hint">Tiền trọ, Netflix, lương… Mỗi tháng SYM tự ghi vào đúng ngày, không cần bạn nhớ. Mở app sau vài ngày vắng mặt, các khoản đến hạn vẫn được ghi bù.</p>
      {list.length ? (
        <ul className="txs rec-list">
          {list.map((r) => {
            const place = locName(r.type === 'expense' ? r.from : r.to, store.state.jars);
            return (
              <li key={r.id} className="tx tx-li">
                <button className="tx-btn" onClick={() => setEditing(r)} aria-label={`Sửa khoản định kỳ: ${r.note}`}>
                  <span className="tx-main">
                    <span className="tx-title">{r.note}</span>
                    <span className="tx-sub">
                      Ngày {r.day} hằng tháng · {r.type === 'expense' ? place : `vào ${place}`}
                    </span>
                  </span>
                  <span className={`tx-amt num ${r.type}`}>{fmtSigned(r.amount, r.type === 'income' ? '+' : '−')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">Chưa có khoản định kỳ nào.</p>
      )}
      <button className="btn primary block" onClick={() => setEditing('new')}>
        Thêm khoản định kỳ
      </button>
    </Sheet>
  );
}

function Editor({
  store,
  item,
  onBack,
  onSave,
  onRemove,
  onClose,
}: {
  store: Store;
  item?: Recurring;
  onBack: () => void;
  onSave: (r: Recurring) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const spendJars = store.jars.filter((j) => j.kind === 'spend');
  const [type, setType] = useState<Recurring['type']>(item?.type ?? 'expense');
  const [expr, setExpr] = useState(item ? String(item.amount) : '');
  const [note, setNote] = useState(item?.note ?? '');
  const [day, setDay] = useState(String(item?.day ?? new Date().getDate()));
  const [from, setFrom] = useState<Loc | undefined>(item?.from ?? spendJars[0]?.id);
  const [to, setTo] = useState<Loc>(item?.to ?? 'wallet');
  const [split, setSplit] = useState(item?.split ?? false);
  const [confirming, setConfirming] = useState(false);

  const amount = evalExpr(expr) ?? 0;
  const dayN = Math.round(Number(day));
  const dayOk = Number.isFinite(dayN) && dayN >= 1 && dayN <= 31;
  const start = item?.start ?? dateKey(new Date());
  const hasRule = ruleTotal(store.state.rule, store.jars) > 0;

  const places: { id: Loc; name: string; bg: string; ink: string }[] =
    type === 'expense'
      ? spendJars.map((j) => ({ id: j.id, name: j.name, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink }))
      : [
          { id: 'wallet', name: 'Ví tổng', bg: WALLET_TINT.bg, ink: WALLET_TINT.ink },
          ...store.jars.map((j) => ({ id: j.id, name: j.name, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink })),
        ];
  const place = type === 'expense' ? from : to;
  const canSave = amount > 0 && note.trim().length > 0 && dayOk && !!place;

  const first = dayOk ? nextDate({ day: dayN, start }, new Date()) : '';

  const save = () => {
    if (!canSave) return;
    const r: Recurring = {
      id: item?.id ?? uid(),
      type,
      amount,
      note: note.trim(),
      day: dayN,
      start,
      ...(type === 'expense' ? { from } : { to, split: to === 'wallet' && split && hasRule ? true : undefined }),
    };
    onSave(r);
  };

  return (
    <Sheet title={item ? 'Sửa khoản định kỳ' : 'Khoản định kỳ mới'} onClose={onClose}>
      <button className="btn text" onClick={onBack}>
        ← Quay lại danh sách
      </button>
      <Seg
        label="Loại"
        value={type}
        onChange={(t) => {
          setType(t);
          if (t === 'expense' && (!from || !spendJars.some((j) => j.id === from))) setFrom(spendJars[0]?.id);
        }}
        options={[
          { value: 'expense', label: 'Chi tiêu' },
          { value: 'income', label: 'Thu nhập' },
        ]}
      />

      <label className="field">
        <span className="label">Tên khoản</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'expense' ? 'Tiền trọ, Netflix…' : 'Lương, học bổng…'} maxLength={60} />
      </label>

      <section className="field">
        <h3 className="label">{type === 'expense' ? 'Trả từ hũ' : 'Tiền vào'}</h3>
        {type === 'expense' && !spendJars.length ? (
          <p className="error">Chưa có hũ chi tiêu. Hãy tạo một hũ chi tiêu trước.</p>
        ) : (
          <div className="chips" role="radiogroup" aria-label={type === 'expense' ? 'Trả từ hũ' : 'Tiền vào'}>
            {places.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={place === p.id}
                className={`jar-chip ${place === p.id ? 'on' : ''}`}
                style={{ background: p.bg, color: p.ink }}
                onClick={() => (type === 'expense' ? setFrom(p.id) : setTo(p.id))}
              >
                <b>{p.name}</b>
              </button>
            ))}
          </div>
        )}
      </section>

      {type === 'income' && to === 'wallet' && hasRule && (
        <label className="check">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          <span>
            Chia theo quy tắc vào các hũ
            <small>Mỗi lần nhận, tiền được chia như quy tắc chia tiền bạn đã đặt.</small>
          </span>
        </label>
      )}

      <AmountPad expr={expr} onChange={setExpr} shortcuts={[50_000, 100_000, 500_000, 1_000_000]} />

      <label className="field">
        <span className="label">Ngày trong tháng</span>
        <input
          className="input num"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-invalid={!dayOk}
        />
        <span className="hint">
          {dayOk
            ? `${dayN > 28 ? 'Tháng ngắn hơn thì ghi vào ngày cuối tháng. ' : ''}${item ? 'Đổi ngày chỉ áp dụng cho các tháng chưa ghi.' : `Lần đầu ghi: ${vnDate(first)}.`}`
            : 'Nhập ngày từ 1 đến 31.'}
        </span>
      </label>

      <div className="sticky-cta">
        <button className="btn primary block" disabled={!canSave} onClick={save}>
          {canSave ? `${item ? 'Lưu' : 'Thêm'}: ${fmtD(amount)} ngày ${dayN} hằng tháng` : 'Nhập tên, số tiền và ngày'}
        </button>
      </div>

      {item && (
        <div className="danger">
          {!confirming ? (
            <button className="btn text negative" onClick={() => setConfirming(true)}>
              Xóa khoản định kỳ
            </button>
          ) : (
            <div className="confirm">
              <p>SYM sẽ không ghi khoản này nữa. Các giao dịch đã ghi trước đó vẫn còn trong lịch sử.</p>
              <div className="row">
                <button className="btn" onClick={() => setConfirming(false)}>
                  Giữ lại
                </button>
                <button className="btn negative-fill" onClick={() => onRemove(item.id)}>
                  Xóa
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
