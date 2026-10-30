import { useMemo, useState } from 'react';
import { ledgerProblem } from '../lib/ledger';
import { evalExpr, fmtD } from '../lib/money';
import type { Store } from '../lib/store';
import { HUES, WALLET_TINT, type Loc, type Tx } from '../lib/types';
import { AmountPad } from './AmountPad';
import { locName } from './TxRow';
import { Sheet } from './ui';

const TYPE_NAME = { income: 'Thu nhập', expense: 'Chi tiêu', transfer: 'Chuyển tiền' } as const;

/** "2026-10-30T14:05" in local time, the format a datetime-local field wants. */
const toLocalInput = (ts: number) => {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function TxSheet({
  store,
  tx,
  onSave,
  onDelete,
  onClose,
}: {
  store: Store;
  tx: Tx;
  onSave: (next: Tx) => void;
  onDelete: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [expr, setExpr] = useState(String(tx.amount));
  const [note, setNote] = useState(tx.note);
  const [when, setWhen] = useState(toLocalInput(tx.ts));
  const [from, setFrom] = useState<Loc | undefined>(tx.from);
  const [to, setTo] = useState<Loc | undefined>(tx.to);
  const [confirming, setConfirming] = useState(false);

  const all = store.state.txs;
  const jars = store.state.jars;
  const group = tx.batch ? all.filter((x) => x.batch === tx.batch && !x.deleted) : [tx];

  const amount = evalExpr(expr) ?? 0;
  const dateEdited = when !== toLocalInput(tx.ts);
  const ts = dateEdited ? new Date(when).getTime() : tx.ts; // the field has no seconds: keep the original unless edited
  const draft: Tx = { ...tx, amount, note: note.trim(), ts: Number.isNaN(ts) ? tx.ts : ts, from, to };

  const places: { id: Loc; name: string; bg: string; ink: string }[] = [
    { id: 'wallet', name: 'Ví tổng', bg: WALLET_TINT.bg, ink: WALLET_TINT.ink },
    ...store.jars.map((j) => ({ id: j.id, name: j.name, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink })),
  ];
  // an expense is paid out of a spending jar; income and transfers can touch any place
  const fromPlaces = tx.type === 'expense' ? places.filter((p) => store.jars.find((j) => j.id === p.id)?.kind === 'spend') : places;

  const problem = useMemo(
    () => ledgerProblem(jars, all, all.map((x) => (x.id === tx.id ? draft : x))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jars, all, tx.id, amount, from, to],
  );
  const delProblem = useMemo(() => ledgerProblem(jars, all, all.map((x) => (x.id === tx.id ? { ...x, deleted: true } : x))), [jars, all, tx.id]);
  const groupProblem = useMemo(
    () => ledgerProblem(jars, all, all.map((x) => (x.batch && x.batch === tx.batch ? { ...x, deleted: true } : x))),
    [jars, all, tx],
  );

  const sameRoute = tx.type === 'transfer' && from === to;
  const changed = amount !== tx.amount || draft.note !== tx.note || dateEdited || from !== tx.from || to !== tx.to;
  const valid = amount > 0 && !Number.isNaN(ts) && !sameRoute && !!(tx.type === 'income' || from) && !!(tx.type === 'expense' || to) && !problem;

  const picker = (label: string, value: Loc | undefined, set: (l: Loc) => void, list = places, skip?: Loc) => (
    <section className="field">
      <h3 className="label">{label}</h3>
      <div className="chips" role="radiogroup" aria-label={label}>
        {list
          .filter((p) => p.id !== skip)
          .map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={`jar-chip ${value === p.id ? 'on' : ''}`} style={{ background: p.bg, color: p.ink }} onClick={() => set(p.id)}>
              <b>{p.name}</b>
            </button>
          ))}
      </div>
    </section>
  );

  return (
    <Sheet title={`Sửa ${TYPE_NAME[tx.type].toLowerCase()}`} onClose={onClose}>
      {tx.type === 'expense' && picker('Trừ từ hũ', from, setFrom, fromPlaces)}
      {tx.type === 'income' && picker('Tiền vào', to, setTo)}
      {tx.type === 'transfer' && (
        <>
          {picker('Từ', from, setFrom)}
          {picker('Sang', to, setTo, places, from)}
        </>
      )}
      {sameRoute && <p className="error">Nơi gửi và nơi nhận phải khác nhau.</p>}

      <AmountPad expr={expr} onChange={setExpr} shortcuts={[]} />

      <label className="field">
        <span className="label">Ghi chú</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
      </label>

      <label className="field">
        <span className="label">Ngày giờ</span>
        <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>

      {problem && (
        <p className="error" role="alert">
          Không lưu được: {problem.name} sẽ âm {fmtD(problem.short)}. Hãy chỉnh các giao dịch liên quan trước.
        </p>
      )}
      {group.length > 1 && <p className="hint">Dòng này thuộc một lần chia tiền gồm {group.length} dòng. Sửa ở đây chỉ đổi riêng dòng này.</p>}

      <div className="sticky-cta">
        <button className="btn primary block" disabled={!valid || !changed} onClick={() => onSave(draft)}>
          {changed ? `Lưu thay đổi` : 'Chưa có thay đổi'}
        </button>
      </div>

      <div className="danger">
        {!confirming ? (
          <button className="btn text negative" onClick={() => setConfirming(true)}>
            Xóa giao dịch này
          </button>
        ) : (
          <div className="confirm">
            <p>
              Xóa <b>{tx.note || TYPE_NAME[tx.type]}</b> ({fmtD(tx.amount)}, {locName(tx.from ?? tx.to, jars)})? Số dư các hũ sẽ được tính lại. Bạn có thể hoàn tác ngay sau đó.
            </p>
            {delProblem && (
              <p className="error">
                Không thể xóa: {delProblem.name} sẽ âm {fmtD(delProblem.short)}.
              </p>
            )}
            <div className="row">
              <button className="btn" onClick={() => setConfirming(false)}>
                Giữ lại
              </button>
              <button className="btn negative-fill" disabled={!!delProblem} onClick={() => onDelete([tx.id])}>
                {group.length > 1 ? 'Xóa dòng này' : 'Xóa giao dịch'}
              </button>
            </div>
            {group.length > 1 && (
              <>
                {groupProblem && (
                  <p className="error">
                    Không thể xóa cả nhóm: {groupProblem.name} sẽ âm {fmtD(groupProblem.short)}.
                  </p>
                )}
                <button className="btn negative-fill" disabled={!!groupProblem} onClick={() => onDelete(group.map((x) => x.id))}>
                  Xóa cả nhóm ({group.length} dòng)
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
