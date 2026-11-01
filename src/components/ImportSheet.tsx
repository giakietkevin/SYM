import { useMemo, useRef, useState } from 'react';
import { guessMapping, importTxs, parseCsv, planImport, type Mapping } from '../lib/bankcsv';
import { ledgerProblem } from '../lib/ledger';
import { fmtD, fmtSigned } from '../lib/money';
import type { Store } from '../lib/store';
import { HUES, WALLET_TINT, type Loc, type Tx } from '../lib/types';
import { Sheet } from './ui';

const MAX_BYTES = 5 * 1024 * 1024;

/** Import a bank statement (CSV): pick the file, check the columns SYM guessed, choose the jars, preview, import. */
export function ImportSheet({ store, onImport, onClose }: { store: Store; onImport: (txs: Tx[]) => void; onClose: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [error, setError] = useState('');
  const spendJars = store.jars.filter((j) => j.kind === 'spend');
  const [from, setFrom] = useState<Loc>(spendJars[0]?.id ?? 'wallet');
  const [to, setTo] = useState<Loc>('wallet');

  const read = async (file: File) => {
    setError('');
    if (file.size > MAX_BYTES) return setError('File quá lớn (tối đa 5 MB).');
    let text: string;
    try {
      const buf = await file.arrayBuffer();
      // most banks export UTF-8; some older exports are Windows-1258 / 1252, which shows up as replacement characters
      text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('�')) text = new TextDecoder('windows-1258').decode(buf);
    } catch {
      return setError('Không đọc được file này.');
    }
    const parsed = parseCsv(text);
    const guess = guessMapping(parsed);
    setName(file.name);
    setRows(parsed);
    setMap(guess);
    if (!guess) setError('Không nhận ra cột ngày và số tiền. Hãy chọn cột bên dưới.');
  };

  const existing = useMemo(() => new Set(store.state.txs.map((t) => t.id)), [store.state.txs]);
  const plan = useMemo(() => (rows && map && map.date >= 0 && (map.amount >= 0 || (map.debit >= 0 && map.credit >= 0)) ? planImport(rows, map, existing) : null), [rows, map, existing]);
  const txs = useMemo(() => (plan ? importTxs(plan, from, to) : []), [plan, from, to]);
  const problem = useMemo(() => (txs.length ? ledgerProblem(store.jars, store.state.txs, [...store.state.txs, ...txs]) : null), [txs, store.jars, store.state.txs]);
  const out = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const inn = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const dups = plan ? plan.rows.filter((r) => r.dup).length : 0;

  const header = rows && map ? (rows[map.header] ?? []) : (rows?.[0] ?? []);
  const width = rows ? Math.max(0, ...rows.slice(0, 30).map((r) => r.length)) : 0;
  const colName = (i: number) => header[i] || `Cột ${i + 1}`;
  const base: Mapping = map ?? { header: 0, date: -1, desc: -1, amount: -1, debit: -1, credit: -1 };
  const setCol = (k: keyof Mapping, v: number) => setMap({ ...base, [k]: v });

  const select = (label: string, k: keyof Mapping, optional = false) => (
    <label className="field">
      <span className="label">{label}</span>
      <select className="input" value={base[k]} onChange={(e) => setCol(k, Number(e.target.value))}>
        <option value={-1}>{optional ? '— Không dùng —' : '— Chọn cột —'}</option>
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            {colName(i)}
          </option>
        ))}
      </select>
    </label>
  );

  const places = (list: { id: Loc; name: string; bg: string; ink: string }[], value: Loc, set: (l: Loc) => void, label: string) => (
    <div className="chips" role="radiogroup" aria-label={label}>
      {list.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={`jar-chip ${value === p.id ? 'on' : ''}`} style={{ background: p.bg, color: p.ink }} onClick={() => set(p.id)}>
          <b>{p.name}</b>
        </button>
      ))}
    </div>
  );
  const wallet = { id: 'wallet', name: 'Ví tổng', bg: WALLET_TINT.bg, ink: WALLET_TINT.ink };
  const jarPlace = (j: (typeof store.jars)[number]) => ({ id: j.id, name: j.name, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink });

  return (
    <Sheet title="Nhập sao kê ngân hàng" onClose={onClose} wide>
      <p className="hint">
        Tải sao kê dạng CSV từ app hoặc trang web ngân hàng (Excel thì lưu lại thành CSV). SYM tự nhận cột ngày, nội dung và số tiền. Nhập lại cùng một file hay hai sao kê trùng ngày cũng không bị ghi trùng.
      </p>
      <div className="row wrap">
        <button className="btn primary" onClick={() => picker.current?.click()}>
          {rows ? 'Chọn file khác' : 'Chọn file CSV'}
        </button>
        {name && <span className="hint">{name}</span>}
        <input
          ref={picker}
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) read(f);
          }}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {rows && (
        <>
          <details className="map-box" open={!map}>
            <summary>Cột SYM đã nhận ({map ? 'bấm để sửa' : 'cần chọn'})</summary>
            <div className="map-grid">
              {select('Ngày', 'date')}
              {select('Nội dung', 'desc', true)}
              {select('Số tiền (+/−)', 'amount', true)}
              {select('Tiền ra (ghi nợ)', 'debit', true)}
              {select('Tiền vào (ghi có)', 'credit', true)}
            </div>
            <p className="hint">Dùng một cột "Số tiền" có dấu, hoặc hai cột "Tiền ra" và "Tiền vào".</p>
          </details>

          <section className="field">
            <h3 className="label">Khoản chi trừ từ</h3>
            {places([...spendJars.map(jarPlace), wallet], from, setFrom, 'Khoản chi trừ từ')}
          </section>
          <section className="field">
            <h3 className="label">Khoản thu vào</h3>
            {places([wallet, ...store.jars.map(jarPlace)], to, setTo, 'Khoản thu vào')}
          </section>

          {plan && (
            <section className="field">
              <h3 className="label">Xem trước</h3>
              <p className="hint num" role="status">
                {txs.length} giao dịch mới · chi {fmtD(out)} · thu {fmtD(inn)}
                {dups > 0 && ` · ${dups} dòng đã nhập trước đó`}
                {plan.skipped > 0 && ` · bỏ qua ${plan.skipped} dòng không có ngày hoặc số tiền`}
              </p>
              {txs.length > 0 && (
                <ul className="txs import-preview">
                  {txs.slice(0, 8).map((t) => (
                    <li key={t.id} className="tx">
                      <span className="tx-main">
                        <span className="tx-title">{t.note}</span>
                        <span className="tx-sub">{new Date(t.ts).toLocaleDateString('vi-VN')}</span>
                      </span>
                      <span className={`tx-amt num ${t.type}`}>{fmtSigned(t.amount, t.type === 'income' ? '+' : '−')}</span>
                    </li>
                  ))}
                </ul>
              )}
              {txs.length > 8 && <p className="hint">và {txs.length - 8} giao dịch khác</p>}
            </section>
          )}

          {problem && (
            <p className="error" role="alert">
              {problem.name} sẽ bị âm {fmtD(problem.short)}. Hãy trừ các khoản chi từ một hũ chi tiêu (hũ chi tiêu được phép vượt hạn mức).
            </p>
          )}

          <div className="sticky-cta">
            <button className="btn primary block" disabled={!txs.length || !!problem} onClick={() => onImport(txs)}>
              {txs.length ? `Nhập ${txs.length} giao dịch` : plan ? 'Không có giao dịch mới' : 'Chọn cột ngày và số tiền'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
