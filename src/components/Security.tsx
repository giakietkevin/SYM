import { useState, type FormEvent } from 'react';
import { ApiError, api, type Profile } from '../lib/api';
import { CodeBox } from './Recovery';

function Password({ label, value, onChange, auto, hint }: { label: string; value: string; onChange: (v: string) => void; auto: string; hint?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input" type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={auto} maxLength={128} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Profile page: change the password, and make (or replace) the recovery code. */
export function SecurityCard({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const [askCode, setAskCode] = useState(false);
  const [codePw, setCodePw] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [code, setCode] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setDone(false);
    if (next.length < 8) return setError('Mật khẩu mới cần ít nhất 8 ký tự');
    if (next !== again) return setError('Hai mật khẩu mới chưa giống nhau');
    setBusy(true);
    setError('');
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 0 ? 'Cần có mạng để đổi mật khẩu' : err.message) : 'Có lỗi xảy ra, thử lại nhé');
    }
    setBusy(false);
  };

  const makeCode = async (e: FormEvent) => {
    e.preventDefault();
    if (codeBusy || !codePw) return;
    setCodeBusy(true);
    setCodeError('');
    try {
      const r = await api.newRecoveryCode(codePw);
      setCode(r.recoveryCode);
      setCodePw('');
      setAskCode(false);
      onProfile({ ...profile, hasRecovery: true });
    } catch (err) {
      setCodeError(err instanceof ApiError ? (err.status === 0 ? 'Cần có mạng để tạo mã' : err.message) : 'Có lỗi xảy ra, thử lại nhé');
    }
    setCodeBusy(false);
  };

  return (
    <>
      <form className="profile-card" onSubmit={submit} aria-labelledby="h-pw">
        <h2 id="h-pw" className="card-title">Đổi mật khẩu</h2>
        <Password label="Mật khẩu hiện tại" value={current} onChange={setCurrent} auto="current-password" />
        <Password label="Mật khẩu mới" value={next} onChange={setNext} auto="new-password" hint="Ít nhất 8 ký tự. Các thiết bị khác sẽ phải đăng nhập lại." />
        <Password label="Nhập lại mật khẩu mới" value={again} onChange={setAgain} auto="new-password" />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="ok" role="status">
            Đã đổi mật khẩu.
          </p>
        )}
        <button className="btn primary block" disabled={busy || !current || !next || !again}>
          {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </form>

      <section className="profile-card" aria-labelledby="h-rc">
        <h2 id="h-rc" className="card-title">Mã khôi phục</h2>
        <p className="hint">
          {profile.hasRecovery
            ? 'Bạn đã có mã khôi phục. Mã chỉ hiện một lần nên SYM không thể cho bạn xem lại; nếu làm mất, hãy tạo mã mới (mã cũ sẽ hết hiệu lực).'
            : 'Tài khoản này chưa có mã khôi phục. Nếu quên mật khẩu bạn sẽ không vào lại được, hãy tạo mã ngay.'}
        </p>
        {code ? (
          <>
            <CodeBox code={code} username={profile.username} />
            <p className="hint">Hãy lưu mã này ngay bây giờ. Đóng trang này là không xem lại được.</p>
          </>
        ) : askCode ? (
          <form className="stack" onSubmit={makeCode}>
            <Password label="Nhập mật khẩu để tạo mã" value={codePw} onChange={setCodePw} auto="current-password" />
            {codeError && (
              <p className="error" role="alert">
                {codeError}
              </p>
            )}
            <div className="row">
              <button type="button" className="btn" onClick={() => setAskCode(false)}>
                Hủy
              </button>
              <button className="btn primary" disabled={codeBusy || !codePw}>
                {codeBusy ? 'Đang tạo…' : 'Tạo mã'}
              </button>
            </div>
          </form>
        ) : (
          <button className="btn" onClick={() => setAskCode(true)}>
            {profile.hasRecovery ? 'Tạo mã mới' : 'Tạo mã khôi phục'}
          </button>
        )}
      </section>
    </>
  );
}
