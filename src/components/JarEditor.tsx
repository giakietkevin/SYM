import { useState } from 'react';
import { evalExpr, fmtD } from '../lib/money';
import { uid } from '../lib/store';
import { HUES, THEME_NAMES, type Hue, type Jar, type JarKind, type Theme } from '../lib/types';
import { JarArt } from './JarArt';
import { Seg, Sheet } from './ui';

const THEMES = Object.keys(THEME_NAMES) as Theme[];

export function JarEditor({
  jar,
  balance,
  onSave,
  onDelete,
  onClose,
}: {
  jar?: Jar;
  balance: number;
  onSave: (j: Jar) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const editing = !!jar;
  const [kind, setKind] = useState<JarKind>(jar?.kind ?? 'spend');
  const [name, setName] = useState(jar?.name ?? '');
  const [goalText, setGoalText] = useState(jar ? String(jar.goal) : '');
  const [due, setDue] = useState(jar?.due ?? '');
  const [hue, setHue] = useState<Hue>(jar?.hue ?? 'sage');
  const [theme, setTheme] = useState<Theme>(jar?.theme ?? 'jar');
  const [confirming, setConfirming] = useState(false);

  const goal = evalExpr(goalText);
  const valid = name.trim().length > 0 && !!goal && goal > 0;

  const changeKind = (k: JarKind) => {
    setKind(k);
    // each kind starts on the picture that suits it, unless the person already chose
    if (!editing) setTheme(k === 'save' ? 'plant' : 'jar');
  };

  return (
    <Sheet title={editing ? 'Sửa hũ' : 'Tạo hũ mới'} onClose={onClose}>
      <Seg
        label="Loại hũ"
        value={kind}
        onChange={changeKind}
        disabled={editing}
        options={[
          { value: 'spend', label: 'Hũ chi tiêu' },
          { value: 'save', label: 'Hũ tích lũy' },
        ]}
      />
      <p className="hint">{kind === 'spend' ? 'Có hạn mức mỗi tháng. Cạn dần khi bạn tiêu.' : 'Có số tiền mục tiêu. Đầy dần khi bạn gửi vào.'}</p>

      <label className="field">
        <span className="label">Tên hũ</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'spend' ? 'Ví dụ: Ăn uống' : 'Ví dụ: Mua laptop mới'} maxLength={28} autoFocus={!editing} />
      </label>

      <label className="field">
        <span className="label">{kind === 'spend' ? 'Hạn mức mỗi tháng' : 'Số tiền mục tiêu'}</span>
        <input className="input num" inputMode="text" value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder={kind === 'spend' ? '3tr hoặc 3000000' : '25tr'} />
        <span className="hint num">{goal ? `= ${fmtD(goal)}` : 'Gõ 3tr, 500k hoặc số đầy đủ'}</span>
      </label>

      {kind === 'save' && (
        <label className="field">
          <span className="label">Ngày muốn hoàn thành (không bắt buộc)</span>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      )}

      <section className="field">
        <h3 className="label">Hình dạng</h3>
        <div className="themes" role="radiogroup" aria-label="Hình dạng hũ">
          {THEMES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={`theme ${theme === t ? 'on' : ''}`} style={{ background: HUES[hue].bg }} onClick={() => setTheme(t)}>
              <JarArt theme={t} hue={hue} fill={0.6} />
              <span>{THEME_NAMES[t]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="field">
        <h3 className="label">Màu</h3>
        <div className="swatches" role="radiogroup" aria-label="Màu hũ">
          {(Object.keys(HUES) as Hue[]).map((h) => (
            <button key={h} type="button" role="radio" aria-checked={hue === h} aria-label={HUES[h].name} className={`swatch ${hue === h ? 'on' : ''}`} style={{ background: HUES[h].mid }} onClick={() => setHue(h)} />
          ))}
        </div>
      </section>

      <div className="sticky-cta">
        <button
          className="btn primary block"
          disabled={!valid}
          onClick={() =>
            valid &&
            onSave({
              id: jar?.id ?? uid(),
              name: name.trim(),
              kind,
              hue,
              theme,
              goal: goal!,
              due: kind === 'save' && due ? due : undefined,
              created: jar?.created ?? Date.now(),
            })
          }
        >
          {editing ? 'Lưu thay đổi' : 'Tạo hũ'}
        </button>
      </div>

      {editing && (
        <div className="danger">
          {!confirming ? (
            <button className="btn text negative" onClick={() => setConfirming(true)}>
              Xóa hũ này
            </button>
          ) : (
            <div className="confirm">
              <p>
                Xóa hũ <b>{jar!.name}</b>? {balance > 0 ? `${fmtD(balance)} trong hũ sẽ về Ví tổng.` : 'Hũ đang trống.'} Lịch sử giao dịch vẫn được giữ.
              </p>
              <div className="row">
                <button className="btn" onClick={() => setConfirming(false)}>
                  Giữ lại
                </button>
                <button className="btn negative-fill" onClick={() => onDelete(jar!.id)}>
                  Xóa hũ {jar!.name}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
