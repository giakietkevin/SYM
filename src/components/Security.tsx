import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, type Profile, type Session } from '../lib/api';
import { ago, deviceLabel } from '../lib/device';
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

const netError = (err: unknown, offline: string) =>
  err instanceof ApiError ? (err.status === 0 ? offline : err.message) : 'Có lỗi xảy ra, thử lại nhé';

/** Every device signed in to this account, with a way to sign any other one out. */
export function SessionsCard() {
  const [list, setList] = useState<Session[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.sessions();
      setList(r.sessions);
      setError('');
    } catch (err) {
      setError(netError(err, 'Cần có mạng để xem các thiết bị'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await (id === 'others' ? api.revokeOthers() : api.revokeSession(id));
      await load();
    } catch (err) {
      setError(netError(err, 'Cần có mạng để đăng xuất thiết bị'));
    }
    setBusy('');
  };

  const others = (list ?? []).filter((s) => !s.current);

  return (
    <section className="profile-card" aria-labelledby="h-dev">
      <h2 id="h-dev" className="card-title">
        Thiết bị đăng nhập
      </h2>
      {list === null && !error && <p className="hint">Đang tải…</p>}
      {list && (
        <ul className="sessions">
          {list.map((s) => (
            <li key={s.id} className="session">
              <div className="session-who">
                <span className="session-name">
                  {deviceLabel(s.agent)}
                  {s.current && <span className="session-tag">Thiết bị này</span>}
                </span>
                <span className="hint">
                  {s.current ? 'Đang dùng' : s.seen ? `Hoạt động ${ago(s.seen)}` : 'Chưa rõ lần cuối hoạt động'}
                  {s.created ? ` · đăng nhập ${new Date(s.created).toLocaleDateString('vi-VN')}` : ''}
                </span>
              </div>
              {!s.current && (
                <button type="button" className="btn text negative" disabled={!!busy} onClick={() => revoke(s.id)}>
                  {busy === s.id ? 'Đang đăng xuất…' : 'Đăng xuất'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {others.length > 1 && (
        <button type="button" className="btn" disabled={!!busy} onClick={() => revoke('others')}>
          {busy === 'others' ? 'Đang đăng xuất…' : `Đăng xuất ${others.length} thiết bị khác`}
        </button>
      )}
    </section>
  );
}

/** Deleting the account is final: it asks for the password and the username typed out. */
export function DeleteAccountCard({ profile, onDeleted }: { profile: Profile; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const typed = confirm.trim().toLowerCase() === profile.username;

  const cancel = () => {
    setOpen(false);
    setConfirm('');
    setPassword('');
    setError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !typed || !password) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount(password, confirm);
      onDeleted();
    } catch (err) {
      setError(netError(err, 'Cần có mạng để xóa tài khoản'));
      setBusy(false);
    }
  };

  return (
    <section className="profile-card danger-card" aria-labelledby="h-del">
      <h2 id="h-del" className="card-title">
        Xóa tài khoản
      </h2>
      <p className="hint">
        Xóa vĩnh viễn tài khoản @{profile.username} cùng mọi hũ, giao dịch, khoản định kỳ và khoản nợ trên máy chủ. Không thể hoàn tác. Muốn giữ lại dữ liệu thì hãy tải file sao
        lưu trong Cài đặt trước.
      </p>
      {open ? (
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span className="label">
              Nhập <b>{profile.username}</b> để xác nhận
            </span>
            <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          </label>
          <Password label="Mật khẩu" value={password} onChange={setPassword} auto="current-password" />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" className="btn" onClick={cancel}>
              Hủy
            </button>
            <button className="btn negative-fill" disabled={busy || !typed || !password}>
              {busy ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn text negative" onClick={() => setOpen(true)}>
          Xóa tài khoản…
        </button>
      )}
    </section>
  );
}
