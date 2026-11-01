import { useState, type FormEvent } from 'react';
import { ApiError, type Registration } from '../lib/api';
import { isCancel, passkeySupport } from '../lib/passkey';
import { ContactFields, contactErrors, type Contact, type ContactErrors } from './ContactFields';
import { Logo } from './icons';
import { Mascot } from './Mascot';
import { Seg } from './ui';

type Mode = 'login' | 'register';

export function AuthScreen({
  notice,
  onSubmit,
  onReset,
  onPasskey,
}: {
  notice?: string;
  /** sign in with a passkey saved on this device */
  onPasskey: () => Promise<void>;
  /** forgotten password: username or email, recovery code, new password */
  onReset: (identifier: string, code: string, password: string) => Promise<void>;
  /** login: only username (or email) and password are used */
  onSubmit: (mode: Mode, form: Registration) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [forgot, setForgot] = useState(false);
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [contact, setContact] = useState<Contact>({ fullName: '', email: '', phone: '' });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const register = mode === 'register';
  const canPasskey = passkeySupport() === 'ok';

  const passkey = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onPasskey();
    } catch (err) {
      if (!isCancel(err)) setError(err instanceof Error ? err.message : 'Không đăng nhập được bằng passkey');
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (forgot) {
      if (password.length < 8) return setError('Mật khẩu mới cần ít nhất 8 ký tự');
      setBusy(true);
      try {
        await onReset(username.trim(), code, password);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra, thử lại nhé');
        setBusy(false);
      }
      return;
    }
    if (register) {
      const errs = contactErrors(contact);
      setErrors(errs);
      if (Object.keys(errs).length) return;
      if (!/^[a-z0-9_.-]{3,24}$/i.test(username.trim())) return setError('Tên đăng nhập 3–24 ký tự: chữ, số, dấu . _ -');
      if (password.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự');
    }
    setBusy(true);
    try {
      await onSubmit(mode, { username: username.trim(), password, ...contact });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Có lỗi xảy ra, thử lại nhé');
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={36} />
          <span>SYM</span>
        </div>
        <Mascot mood="happy" />
        <h1>{forgot ? 'Quên mật khẩu' : register ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
        <p className="auth-sub">
          {forgot
            ? 'Nhập tên đăng nhập (hoặc email), mã khôi phục bạn đã lưu lúc đăng ký và mật khẩu mới.'
            : 'Dữ liệu hũ của bạn được lưu theo tài khoản, mở ở đâu cũng thấy.'}
        </p>

        {!forgot && <Seg
          label="Chế độ"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
            setErrors({});
          }}
          options={[
            { value: 'login', label: 'Đăng nhập' },
            { value: 'register', label: 'Đăng ký' },
          ]}
        />}

        <form onSubmit={submit} className="auth-form" noValidate>
          {register && <ContactFields value={contact} errors={errors} onChange={(f, v) => setContact((c) => ({ ...c, [f]: v }))} />}

          <label className="field">
            <span className="label">{register ? 'Tên đăng nhập' : 'Tên đăng nhập hoặc email'}</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={register ? 24 : 254}
              required
            />
            {register && <span className="hint">3–24 ký tự: chữ, số, dấu . _ -</span>}
          </label>

          {forgot && (
            <label className="field">
              <span className="label">Mã khôi phục</span>
              <input
                className="input num"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={24}
                placeholder="XXXX-XXXX-XXXX-XXXX"
              />
            </label>
          )}

          <label className="field">
            <span className="label">{forgot ? 'Mật khẩu mới' : 'Mật khẩu'}</span>
            <span className="pw">
              <input
                className="input"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register || forgot ? 'new-password' : 'current-password'}
                maxLength={128}
                required
              />
              <button type="button" className="btn text" onClick={() => setShow((s) => !s)} aria-pressed={show}>
                {show ? 'Ẩn' : 'Hiện'}
              </button>
            </span>
            {(register || forgot) && <span className="hint">Ít nhất 8 ký tự.</span>}
          </label>

          {(error || notice) && (
            <p className="error" role="alert">
              {error || notice}
            </p>
          )}

          <button className="btn primary block" disabled={busy || !username || !password || (forgot && !code)}>
            {busy ? 'Đang xử lý…' : forgot ? 'Đặt lại mật khẩu' : register ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
          {!register && !forgot && canPasskey && (
            <>
              <div className="or" aria-hidden="true">
                <span>hoặc</span>
              </div>
              <button type="button" className="btn block passkey-btn" onClick={passkey} disabled={busy}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="9" cy="8" r="4" />
                  <path d="M2 21c0-3.9 3.1-7 7-7 1.4 0 2.6.4 3.7 1" />
                  <circle cx="17.5" cy="14.5" r="2.5" />
                  <path d="M17.5 17v4.5M17.5 19.5h2" />
                </svg>
                Đăng nhập bằng passkey
              </button>
            </>
          )}
          {!register && (
            <button
              type="button"
              className="btn text"
              onClick={() => {
                setForgot((f) => !f);
                setError('');
                setPassword('');
              }}
            >
              {forgot ? 'Quay lại đăng nhập' : 'Quên mật khẩu?'}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
