import { useMemo, useState } from 'react';
import { evalExpr, fmtD, short } from '../lib/money';
import { ruleTotal } from '../lib/split';
import type { Store } from '../lib/store';
import { HUES, WALLET_TINT, type Jar, type Tx } from '../lib/types';
import { AmountPad } from './AmountPad';
import { TagChips } from './TagChips';
import { Seg, Sheet } from './ui';

export type NewTx = Omit<Tx, 'id' | 'ts'>;

type Bucket = 'sáng' | 'trưa' | 'chiều' | 'tối';

export function bucketOf(ts: number): Bucket {
  const h = new Date(ts).getHours();
  if (h >= 5 && h < 10) return 'sáng';
  if (h >= 10 && h < 14) return 'trưa';
  if (h >= 14 && h < 18) return 'chiều';
  return 'tối';
}

const FALLBACK: Record<Bucket, string[]> = {
  sáng: ['Ăn sáng', 'Cà phê'],
  trưa: ['Cơm trưa', 'Nước uống'],
  chiều: ['Trà sữa', 'Cà phê'],
  tối: ['Ăn tối', 'Giải trí'],
};

interface Suggestion {
  jar: Jar;
  note: string;
}

/** Jar + note pairs this person logs most at this time of day, topped up with sensible defaults. */
function suggest(store: Store, spendJars: Jar[], bucket: Bucket): Suggestion[] {
  const since = Date.now() - 120 * 24 * 3600 * 1000;
  const counts = new Map<string, { jar: Jar; note: string; n: number }>();
  for (const t of store.txs) {
    if (t.type !== 'expense' || !t.note || t.ts < since || bucketOf(t.ts) !== bucket) continue;
    const jar = spendJars.find((j) => j.id === t.from);
    if (!jar) continue;
    const key = `${jar.id}|${t.note.toLowerCase()}`;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { jar, note: t.note, n: 1 });
  }
  const out: Suggestion[] = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 3);
  const food = spendJars.find((j) => /ăn|uống/i.test(j.name)) ?? spendJars[0];
  for (const note of FALLBACK[bucket]) {
    if (out.length >= 3 || !food || out.some((s) => s.note.toLowerCase() === note.toLowerCase())) continue;
    out.push({ jar: food, note });
  }
  return out;
}

export function QuickAdd({
  store,
  preJar,
  onSubmit,
  onClose,
}: {
  store: Store;
  preJar?: string;
  onSubmit: (t: NewTx, opts?: { split?: boolean }) => void;
  onClose: () => void;
}) {
  const spendJars = useMemo(() => store.jars.filter((j) => j.kind === 'spend'), [store.jars]);
  const bucket = bucketOf(Date.now());
  const chips = useMemo(() => suggest(store, spendJars, bucket), [store, spendJars, bucket]);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [expr, setExpr] = useState('');
  const [jarId, setJarId] = useState<string | undefined>(preJar ?? chips[0]?.jar.id ?? spendJars[0]?.id);
  const [dest, setDest] = useState<string>('wallet');
  const [note, setNote] = useState('');
  const [split, setSplit] = useState(true);
  const ruleSum = ruleTotal(store.state.rule, store.jars);
  const canSplit = type === 'income' && dest === 'wallet' && ruleSum > 0;

  const amount = evalExpr(expr) ?? 0;
  const jar = store.jars.find((j) => j.id === jarId);
  const target = type === 'expense' ? jarId : dest;
  const targetName = type === 'expense' ? jar?.name : dest === 'wallet' ? 'Ví tổng' : store.jars.find((j) => j.id === dest)?.name;
  const canSave = amount > 0 && !!target;

  const submit = () => {
    if (!canSave) return;
    onSubmit(type === 'expense' ? { type, amount, from: jarId, note: note.trim() } : { type, amount, to: dest, note: note.trim() }, { split: canSplit && split });
  };

  return (
    <Sheet title="Ghi nhanh" onClose={onClose}>
      <Seg
        label="Loại"
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Chi tiêu' },
          { value: 'income', label: 'Thu nhập' },
        ]}
      />

      <AmountPad expr={expr} onChange={setExpr} />

      {type === 'expense' && chips.length > 0 && (
        <section className="field">
          <h3 className="label">Hay ghi buổi {bucket}</h3>
          <div className="chips">
            {chips.map((s) => (
              <button
                key={s.jar.id + s.note}
                type="button"
                className={`chip chip-two ${note === s.note && jarId === s.jar.id ? 'on' : ''}`}
                onClick={() => {
                  setNote(s.note);
                  setJarId(s.jar.id);
                }}
              >
                <b>{s.note}</b>
                <span>{s.jar.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="field">
        <h3 className="label">{type === 'expense' ? 'Trừ từ hũ' : 'Tiền vào'}</h3>
        {type === 'expense' && spendJars.length === 0 && <p className="empty">Chưa có hũ chi tiêu. Tạo một hũ ở màn hình Tổng quan trước nhé.</p>}
        <div className="chips" role="radiogroup" aria-label={type === 'expense' ? 'Chọn hũ' : 'Chọn nơi nhận'}>
          {type === 'income' && (
            <JarChip label="Ví tổng" sub="chưa chia" bg={WALLET_TINT.bg} ink={WALLET_TINT.ink} on={dest === 'wallet'} onClick={() => setDest('wallet')} />
          )}
          {(type === 'expense' ? spendJars : store.jars).map((j) => {
            const h = HUES[j.hue];
            return (
              <JarChip
                key={j.id}
                label={j.name}
                sub={`còn ${short(store.bal[j.id] ?? 0)}`}
                bg={h.bg}
                ink={h.ink}
                on={(type === 'expense' ? jarId : dest) === j.id}
                onClick={() => (type === 'expense' ? setJarId(j.id) : setDest(j.id))}
              />
            );
          })}
        </div>
      </section>

      <label className="field">
        <span className="label">Ghi chú</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === 'expense' ? 'Ví dụ: phở bò #sáng' : 'Ví dụ: lương, tiền thưởng'} maxLength={120} />
      </label>
      <TagChips txs={store.state.txs} note={note} onNote={setNote} />

      {canSplit && (
        <label className="check">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
          <span>
            Chia luôn theo quy tắc
            <small>
              {ruleSum}% vào các hũ, {100 - ruleSum}% ở lại Ví tổng
            </small>
          </span>
        </label>
      )}
      {type === 'income' && dest === 'wallet' && ruleSum === 0 && store.jars.length > 0 && (
        <p className="hint">Mẹo: đặt quy tắc chia tiền trong Cài đặt để lương tự chia vào các hũ.</p>
      )}

      <div className="sticky-cta">
        <button className="btn primary block" disabled={!canSave} onClick={submit}>
          {canSave ? `${type === 'expense' ? 'Trừ' : 'Thêm'} ${fmtD(amount)} ${type === 'expense' ? 'khỏi' : 'vào'} ${targetName}` : type === 'expense' ? 'Nhập số tiền và chọn hũ' : 'Nhập số tiền'}
        </button>
      </div>
    </Sheet>
  );
}

function JarChip({ label, sub, bg, ink, on, onClick }: { label: string; sub: string; bg: string; ink: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`jar-chip ${on ? 'on' : ''}`} style={{ background: bg, color: ink }} onClick={onClick}>
      <b>{label}</b>
      <span>{sub}</span>
    </button>
  );
}
