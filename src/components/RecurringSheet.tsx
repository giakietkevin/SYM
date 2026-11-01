import { useState } from 'react';
import { evalExpr, fmtD, fmtSigned } from '../lib/money';
import { afterLastWritten, dateKey, freqOf, nextDate, scheduleLabel, weekdayName, type Freq } from '../lib/recurring';
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
      <p className="hint">Tiền trọ, Netflix, lương, bảo hiểm… SYM tự ghi vào đúng ngày (hằng tuần, hằng tháng, hằng năm hoặc mỗi vài ngày), không cần bạn nhớ. Mở app sau vài ngày vắng mặt, các khoản đến hạn vẫn được ghi bù.</p>
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
                      {scheduleLabel(r)} · {r.type === 'expense' ? place : `vào ${place}`}
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
  const [freq, setFreq] = useState<Freq>(item ? freqOf(item) : 'monthly');
  const [day, setDay] = useState(String(item && freqOf(item) !== 'weekly' ? item.day : new Date().getDate()));
  const [weekday, setWeekday] = useState(item && freqOf(item) === 'weekly' ? item.day : ((new Date().getDay() + 6) % 7) + 1);
  const [month, setMonth] = useState(String(item?.month ?? new Date().getMonth() + 1));
  const [every, setEvery] = useState(String(item?.every ?? 7));
  const [startDay, setStartDay] = useState(item?.start ?? dateKey(new Date()));
  const [from, setFrom] = useState<Loc | undefined>(item?.from ?? spendJars[0]?.id);
  const [to, setTo] = useState<Loc>(item?.to ?? 'wallet');
  const [split, setSplit] = useState(item?.split ?? false);
  const [confirming, setConfirming] = useState(false);

  const amount = evalExpr(expr) ?? 0;
  const dayN = Math.round(Number(day));
  const monthN = Math.round(Number(month));
  const everyN = Math.round(Number(every));
  const dayOk =
    freq === 'weekly'
      ? true
      : freq === 'days'
        ? Number.isFinite(everyN) && everyN >= 1 && everyN <= 365 && /^\d{4}-\d{2}-\d{2}$/.test(startDay)
        : Number.isFinite(dayN) && dayN >= 1 && dayN <= 31 && (freq !== 'yearly' || (monthN >= 1 && monthN <= 12));
  const schedule = {
    freq: freq === 'monthly' ? undefined : freq,
    day: freq === 'weekly' ? weekday : freq === 'days' ? 1 : dayN,
    ...(freq === 'yearly' ? { month: monthN } : {}),
    ...(freq === 'days' ? { every: everyN } : {}),
  };
  const sameSchedule =
    !!item &&
    freqOf(item) === freq &&
    item.day === schedule.day &&
    item.month === schedule.month &&
    item.every === schedule.every &&
    (freq !== 'days' || item.start === startDay);
  // A new item starts today (or on the chosen date for "every N days"). A changed schedule must not write the past
  // again under new ids: it starts after the last line already written. A monthly day change keeps its month keys.
  const start = (() => {
    if (!item) return freq === 'days' ? startDay : dateKey(new Date());
    if (sameSchedule || (freq === 'monthly' && freqOf(item) === 'monthly')) return item.start;
    const after = afterLastWritten(item, store.state.txs);
    const today = dateKey(new Date());
    const floor = after && after > today ? after : today;
    return freq === 'days' && startDay > floor ? startDay : floor;
  })();
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

  const first = dayOk ? nextDate({ ...schedule, start }, new Date()) : '';
  const label = dayOk ? scheduleLabel({ ...schedule, start }) : '';

  const save = () => {
    if (!canSave) return;
    const r: Recurring = {
      id: item?.id ?? uid(),
      type,
      amount,
      note: note.trim(),
      ...schedule,
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

      <section className="field">
        <h3 className="label">Lặp lại</h3>
        <Seg
          label="Lặp lại"
          value={freq}
          onChange={setFreq}
          options={[
            { value: 'weekly', label: 'Tuần' },
            { value: 'monthly', label: 'Tháng' },
            { value: 'yearly', label: 'Năm' },
            { value: 'days', label: 'Mỗi N ngày' },
          ]}
        />
      </section>

      {freq === 'weekly' && (
        <div className="chips" role="radiogroup" aria-label="Thứ trong tuần">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <button key={d} type="button" role="radio" aria-checked={weekday === d} className={`chip ${weekday === d ? 'on' : ''}`} onClick={() => setWeekday(d)}>
              {d === 7 ? 'CN' : `T${d + 1}`}
            </button>
          ))}
        </div>
      )}

      {(freq === 'monthly' || freq === 'yearly') && (
        <div className={freq === 'yearly' ? 'search-dates' : ''}>
          <label className="field">
            <span className="label">{freq === 'yearly' ? 'Ngày' : 'Ngày trong tháng'}</span>
            <input className="input num" type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={!dayOk} />
          </label>
          {freq === 'yearly' && (
            <label className="field">
              <span className="label">Tháng</span>
              <input className="input num" type="number" inputMode="numeric" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} aria-invalid={!dayOk} />
            </label>
          )}
        </div>
      )}

      {freq === 'days' && (
        <div className="search-dates">
          <label className="field">
            <span className="label">Mỗi bao nhiêu ngày</span>
            <input className="input num" type="number" inputMode="numeric" min={1} max={365} value={every} onChange={(e) => setEvery(e.target.value)} aria-invalid={!dayOk} />
          </label>
          <label className="field">
            <span className="label">Bắt đầu từ</span>
            <input className="input" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
          </label>
        </div>
      )}

      <p className="hint">
        {dayOk
          ? `${(freq === 'monthly' || freq === 'yearly') && dayN > 28 ? 'Tháng ngắn hơn thì ghi vào ngày cuối tháng. ' : ''}${
              item && !sameSchedule && !(freq === 'monthly' && freqOf(item) === 'monthly') ? 'Lịch mới áp dụng từ hôm nay, các lần đã ghi giữ nguyên. ' : ''
            }Lần tới: ${vnDate(first)}${freq === 'weekly' ? ` (${weekdayName(weekday)})` : ''}.`
          : freq === 'days'
            ? 'Nhập số ngày từ 1 đến 365.'
            : 'Nhập ngày từ 1 đến 31 và tháng từ 1 đến 12.'}
      </p>

      <div className="sticky-cta">
        <button className="btn primary block" disabled={!canSave} onClick={save}>
          {canSave ? `${item ? 'Lưu' : 'Thêm'}: ${fmtD(amount)} · ${label.charAt(0).toLowerCase()}${label.slice(1)}` : 'Nhập tên, số tiền và lịch lặp'}
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
