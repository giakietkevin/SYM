import { useState } from 'react';
import { byPerson, customShares, dueIn, isDone, paidOf, remainingOf, splitBill, totals, type SplitMode } from '../lib/debts';
import { evalExpr, fmtD } from '../lib/money';
import type { Store } from '../lib/store';
import { HUES, WALLET_TINT, type Debt, type Loc, type Tx } from '../lib/types';
import { AmountPad } from './AmountPad';
import { Seg, Sheet } from './ui';

export interface BillInput {
  total: number;
  from: Loc;
  note: string;
  friends: string[];
  includeMe: boolean;
  /** uneven shares, one per friend (missing: equal) */
  shares?: number[];
}

export interface LoanInput {
  who: string;
  dir: Debt['dir'];
  amount: number;
  note: string;
  due?: string;
}

/** "Hạn hôm nay", "Còn 3 ngày", "Quá hạn 2 ngày" */
export function dueLabel(days: number): string {
  if (days === 0) return 'Hạn hôm nay';
  if (days === 1) return 'Hạn ngày mai';
  return days > 0 ? `Còn ${days} ngày` : `Quá hạn ${-days} ngày`;
}

/** Home card: what friends owe, what I owe, and the way in to split a bill. */
export function DebtCard({ debts, txs, onOpen }: { debts: Debt[] | undefined; txs: Tx[]; onOpen: () => void }) {
  const t = totals(debts, txs);
  const none = t.owedToMe === 0 && t.iOwe === 0;
  return (
    <section className="debt-card" aria-label="Chia tiền nhóm và nợ">
      <div>
        <h2 className="sec">Chia tiền & nợ</h2>
        <p className="hint num">
          {none
            ? 'Đi ăn chung? Chia hóa đơn cho cả nhóm và theo dõi ai còn nợ.'
            : `${t.owedToMe > 0 ? `Bạn bè nợ bạn ${fmtD(t.owedToMe)}` : ''}${t.owedToMe > 0 && t.iOwe > 0 ? ' · ' : ''}${t.iOwe > 0 ? `Bạn nợ ${fmtD(t.iOwe)}` : ''}`}
        </p>
      </div>
      <button className="btn" onClick={onOpen}>
        {none ? 'Chia hóa đơn' : 'Mở'}
      </button>
    </section>
  );
}

const date = (ts: number) => new Date(ts).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

export function DebtSheet({
  store,
  onBill,
  onLoan,
  onSettle,
  onDelete,
  onClose,
}: {
  store: Store;
  onBill: (b: BillInput) => void;
  onLoan: (l: LoanInput) => void;
  onSettle: (d: Debt, place: Loc, amount: number) => void;
  onDelete: (d: Debt) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'list' | 'bill' | 'loan'>('list');
  if (mode === 'bill')
    return (
      <BillForm
        store={store}
        onBack={() => setMode('list')}
        onSubmit={(b) => {
          onBill(b);
          setMode('list');
        }}
        onClose={onClose}
      />
    );
  if (mode === 'loan')
    return (
      <LoanForm
        onBack={() => setMode('list')}
        onSubmit={(l) => {
          onLoan(l);
          setMode('list');
        }}
        onClose={onClose}
      />
    );
  return <List store={store} onMode={setMode} onSettle={onSettle} onDelete={onDelete} onClose={onClose} />;
}

function List({
  store,
  onMode,
  onSettle,
  onDelete,
  onClose,
}: {
  store: Store;
  onMode: (m: 'bill' | 'loan') => void;
  onSettle: (d: Debt, place: Loc, amount: number) => void;
  onDelete: (d: Debt) => void;
  onClose: () => void;
}) {
  const debts = store.state.debts ?? [];
  const txs = store.state.txs;
  const people = byPerson(debts, txs);
  const t = totals(debts, txs);
  const done = debts.filter((d) => isDone(d, txs)).sort((a, b) => b.ts - a.ts).slice(0, 8);
  const [settling, setSettling] = useState<{ id: string; place: Loc; expr: string } | null>(null);
  const spendJars = store.jars.filter((j) => j.kind === 'spend');

  const start = (d: Debt) => {
    const fallback: Loc = d.dir === 'owed' ? (d.from && store.jars.some((j) => j.id === d.from) ? d.from : 'wallet') : (spendJars[0]?.id ?? '');
    setSettling({ id: d.id, place: fallback, expr: String(remainingOf(d, txs)) });
  };

  const places = (d: Debt) =>
    d.dir === 'owed'
      ? [{ id: 'wallet', name: 'Ví tổng', bg: WALLET_TINT.bg, ink: WALLET_TINT.ink }, ...store.jars.map((j) => ({ id: j.id, name: j.name, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink }))]
      : spendJars.map((j) => ({ id: j.id, name: j.name, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink }));

  return (
    <Sheet title="Chia tiền & nợ" onClose={onClose}>
      <div className="debt-sum">
        <div>
          <p className="hint">Bạn bè nợ bạn</p>
          <p className="debt-fig num pos">{fmtD(t.owedToMe)}</p>
        </div>
        <div>
          <p className="hint">Bạn nợ</p>
          <p className="debt-fig num">{fmtD(t.iOwe)}</p>
        </div>
      </div>

      <div className="actions">
        <button className="btn primary" onClick={() => onMode('bill')} disabled={!spendJars.length}>
          Chia hóa đơn
        </button>
        <button className="btn" onClick={() => onMode('loan')}>
          Ghi một khoản nợ
        </button>
      </div>
      {!spendJars.length && <p className="hint">Cần có ít nhất một hũ chi tiêu để chia hóa đơn.</p>}

      {people.length === 0 && <p className="empty">Chưa có khoản nợ nào đang mở.</p>}
      {people.map((p) => (
        <section key={p.who} className="debt-person">
          <header>
            <b>{p.who}</b>
            <span className={`num ${p.net > 0 ? 'pos' : ''}`}>
              {p.net === 0 ? 'Huề' : p.net > 0 ? `nợ bạn ${fmtD(p.net)}` : `bạn nợ ${fmtD(-p.net)}`}
            </span>
          </header>
          <ul>
            {p.open.map((d) => (
              <li key={d.id}>
                <div className="debt-row">
                  <span>
                    <span className="tx-title">{d.note || (d.dir === 'owed' ? 'Khoản cho mượn' : 'Khoản đã mượn')}</span>
                    <span className="tx-sub">
                      {d.dir === 'owed' ? 'Họ nợ bạn' : 'Bạn nợ họ'} · {date(d.ts)}
                      {paidOf(d, txs) > 0 && ` · đã trả ${fmtD(paidOf(d, txs))}/${fmtD(d.amount)}`}
                    </span>
                    {dueIn(d) !== null && <span className={`due-tag ${dueIn(d)! < 0 ? 'late' : dueIn(d)! <= 3 ? 'soon' : ''}`}>{dueLabel(dueIn(d)!)}</span>}
                  </span>
                  <span className={`num ${d.dir === 'owed' ? 'pos' : ''}`}>{fmtD(remainingOf(d, txs))}</span>
                </div>
                {settling?.id === d.id ? (
                  <div className="debt-settle">
                    {d.dir === 'owe' && !spendJars.length ? (
                      <p className="error">Cần một hũ chi tiêu để trả khoản này.</p>
                    ) : (
                      <>
                        <p className="hint">{d.dir === 'owed' ? 'Tiền trả lại vào đâu?' : 'Trả từ hũ nào?'}</p>
                        <div className="chips" role="radiogroup" aria-label="Chọn nơi nhận hoặc trả tiền">
                          {places(d).map((pl) => (
                            <button
                              key={pl.id}
                              type="button"
                              role="radio"
                              aria-checked={settling.place === pl.id}
                              className={`jar-chip ${settling.place === pl.id ? 'on' : ''}`}
                              style={{ background: pl.bg, color: pl.ink }}
                              onClick={() => setSettling({ ...settling, place: pl.id })}
                            >
                              <b>{pl.name}</b>
                            </button>
                          ))}
                        </div>
                        {(() => {
                          const left = remainingOf(d, txs);
                          const amount = evalExpr(settling.expr) ?? 0;
                          const ok = amount > 0 && amount <= left;
                          return (
                            <>
                              <label className="field">
                                <span className="label">Số tiền {d.dir === 'owed' ? 'nhận' : 'trả'} lần này</span>
                                <input
                                  className="input num"
                                  inputMode="decimal"
                                  value={settling.expr}
                                  onChange={(e) => setSettling({ ...settling, expr: e.target.value })}
                                  aria-invalid={!ok}
                                />
                                <span className="hint">
                                  {amount > left ? `Nhiều hơn số còn lại (${fmtD(left)}).` : amount > 0 && amount < left ? `Trả một phần, còn lại ${fmtD(left - amount)}.` : `Còn lại ${fmtD(left)}. Nhập ít hơn để trả một phần.`}
                                </span>
                              </label>
                              <div className="row">
                                <button className="btn" onClick={() => setSettling(null)}>
                                  Hủy
                                </button>
                                <button
                                  className="btn primary"
                                  disabled={!ok}
                                  onClick={() => {
                                    onSettle(d, settling.place, amount);
                                    setSettling(null);
                                  }}
                                >
                                  {d.dir === 'owed' ? `Đã nhận ${fmtD(amount)}` : `Đã trả ${fmtD(amount)}`}
                                </button>
                              </div>
                            </>
                          );
                        })()}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="row">
                    <button className="btn" onClick={() => start(d)}>
                      {d.dir === 'owed' ? 'Đã nhận lại' : 'Đã trả'}
                    </button>
                    <button className="btn text negative" onClick={() => onDelete(d)} aria-label={`Xóa khoản nợ ${d.who}`}>
                      Xóa
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <>
          <h3 className="label">Đã thanh toán</h3>
          <ul className="debt-done">
            {done.map((d) => (
              <li key={d.id} className="hint num">
                {d.who} · {d.note || 'khoản nợ'} · {fmtD(d.amount)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function BillForm({ store, onBack, onSubmit, onClose }: { store: Store; onBack: () => void; onSubmit: (b: BillInput) => void; onClose: () => void }) {
  const spendJars = store.jars.filter((j) => j.kind === 'spend');
  const [expr, setExpr] = useState('');
  const [note, setNote] = useState('');
  const [from, setFrom] = useState<Loc>(spendJars[0]?.id ?? '');
  const [friends, setFriends] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [includeMe, setIncludeMe] = useState(true);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<SplitMode>('equal');
  const [values, setValues] = useState<Record<string, string>>({});

  const total = evalExpr(expr) ?? 0;
  const equal = splitBill(total, friends.length, includeMe);
  const custom =
    mode === 'equal'
      ? null
      : customShares(
          total,
          mode,
          friends.map((f) => (mode === 'percent' ? Number((values[f] ?? '').replace(',', '.')) || 0 : (evalExpr(values[f] ?? '') ?? 0))),
        );
  const mine = custom ? custom.mine : equal.mine;
  const canSave = total > 0 && friends.length > 0 && !!from && (custom ? !custom.error : equal.share > 0);

  const add = () => {
    const n = name.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!n) return;
    if (friends.some((f) => f.toLowerCase() === n.toLowerCase())) return setErr(`${n} đã có trong danh sách`);
    if (friends.length >= 12) return setErr('Tối đa 12 người');
    setFriends([...friends, n]);
    setName('');
    setErr('');
  };

  return (
    <Sheet title="Chia hóa đơn" onClose={onClose}>
      <button className="btn text" onClick={onBack}>
        ← Quay lại
      </button>
      <p className="hint">Bạn trả trước cả hóa đơn. SYM trừ cả số tiền khỏi hũ và ghi lại phần mỗi bạn còn nợ bạn.</p>

      <AmountPad expr={expr} onChange={setExpr} shortcuts={[100_000, 200_000, 500_000, 1_000_000]} />

      <label className="field">
        <span className="label">Hóa đơn gì</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lẩu cuối tuần, tiền xăng…" maxLength={60} />
      </label>

      <section className="field">
        <h3 className="label">Trả từ hũ</h3>
        <div className="chips" role="radiogroup" aria-label="Trả từ hũ">
          {spendJars.map((j) => (
            <button
              key={j.id}
              type="button"
              role="radio"
              aria-checked={from === j.id}
              className={`jar-chip ${from === j.id ? 'on' : ''}`}
              style={{ background: HUES[j.hue].bg, color: HUES[j.hue].ink }}
              onClick={() => setFrom(j.id)}
            >
              <b>{j.name}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="field">
        <h3 className="label">Chia với ai</h3>
        <div className="pw">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="Tên bạn bè"
            maxLength={40}
            aria-label="Tên bạn bè"
          />
          <button type="button" className="btn" onClick={add} disabled={!name.trim()}>
            Thêm
          </button>
        </div>
        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
        {friends.length > 0 && (
          <ul className="friend-chips">
            {friends.map((f) => (
              <li key={f}>
                <button type="button" className="chip on" onClick={() => setFriends(friends.filter((x) => x !== f))} aria-label={`Bỏ ${f}`}>
                  {f} ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {friends.length > 0 && (
        <section className="field">
          <h3 className="label">Cách chia</h3>
          <Seg
            label="Cách chia"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'equal', label: 'Chia đều' },
              { value: 'amount', label: 'Theo số tiền' },
              { value: 'percent', label: 'Theo %' },
            ]}
          />
        </section>
      )}

      {mode === 'equal' ? (
        <label className="check">
          <input type="checkbox" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
          <span>
            Tính cả phần của mình
            <small>Bỏ chọn nếu bạn chỉ trả hộ, không dùng gì.</small>
          </span>
        </label>
      ) : (
        friends.length > 0 && (
          <ul className="share-list">
            {friends.map((f, i) => (
              <li key={f}>
                <span className="share-who">{f}</span>
                <input
                  className="input num"
                  inputMode="decimal"
                  value={values[f] ?? ''}
                  onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                  placeholder={mode === 'percent' ? '%' : '50k'}
                  aria-label={`Phần của ${f}${mode === 'percent' ? ' (phần trăm)' : ''}`}
                />
                {mode === 'percent' && <span className="hint num share-amt">{fmtD(custom?.shares[i] ?? 0)}</span>}
              </li>
            ))}
          </ul>
        )
      )}

      {total > 0 && friends.length > 0 && (
        <p className={custom?.error ? 'error' : 'hint num'} role="status">
          {custom?.error ?? (mode === 'equal' ? `Mỗi bạn nợ ${fmtD(equal.share)}. Phần của bạn: ${fmtD(mine)}.` : `Phần của bạn: ${fmtD(mine)}.`)}
        </p>
      )}

      <div className="sticky-cta">
        <button
          className="btn primary block"
          disabled={!canSave}
          onClick={() => onSubmit({ total, from, note: note.trim(), friends, includeMe, ...(custom ? { shares: custom.shares } : {}) })}
        >
          {canSave ? `Chia ${fmtD(total)} cho ${friends.length} bạn` : 'Nhập số tiền và thêm bạn bè'}
        </button>
      </div>
    </Sheet>
  );
}

function LoanForm({ onBack, onSubmit, onClose }: { onBack: () => void; onSubmit: (l: LoanInput) => void; onClose: () => void }) {
  const [dir, setDir] = useState<Debt['dir']>('owed');
  const [who, setWho] = useState('');
  const [expr, setExpr] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const amount = evalExpr(expr) ?? 0;
  const canSave = amount > 0 && who.trim().length > 0;

  return (
    <Sheet title="Ghi một khoản nợ" onClose={onClose}>
      <button className="btn text" onClick={onBack}>
        ← Quay lại
      </button>
      <p className="hint">Chỉ ghi nhớ thôi, chưa có tiền nào di chuyển. Khi trả hoặc nhận lại, SYM mới ghi vào hũ.</p>
      <Seg
        label="Ai nợ ai"
        value={dir}
        onChange={setDir}
        options={[
          { value: 'owed', label: 'Bạn bè nợ mình' },
          { value: 'owe', label: 'Mình nợ bạn' },
        ]}
      />
      <label className="field">
        <span className="label">Tên bạn bè</span>
        <input className="input" value={who} onChange={(e) => setWho(e.target.value)} maxLength={40} placeholder="Ví dụ: Minh" />
      </label>
      <AmountPad expr={expr} onChange={setExpr} shortcuts={[50_000, 100_000, 200_000, 500_000]} />
      <label className="field">
        <span className="label">Ghi chú</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Tiền cà phê, mượn trước…" />
      </label>
      <label className="field">
        <span className="label">Hạn trả (không bắt buộc)</span>
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <span className="hint">SYM sẽ nhắc trên màn hình Tổng quan khi gần đến hạn.</span>
      </label>
      <div className="sticky-cta">
        <button
          className="btn primary block"
          disabled={!canSave}
          onClick={() => onSubmit({ who: who.trim().replace(/\s+/g, ' '), dir, amount, note: note.trim(), ...(due ? { due } : {}) })}
        >
          {canSave ? `Ghi ${fmtD(amount)}` : 'Nhập tên và số tiền'}
        </button>
      </div>
    </Sheet>
  );
}

