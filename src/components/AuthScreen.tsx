import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { Logo } from './icons';
import { Mascot } from './Mascot';
import { Seg } from './ui';

type Mode = 'login' | 'register';

export function AuthScreen({
  notice,
  onSubmit,
}: {
  notice?: string;
  onSubmit: (mode: Mode, username: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const register = mode === 'register';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onSubmit(mode, username.trim(), password);
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
        <h1>{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
        <p className="auth-sub">Dữ liệu hũ của bạn được lưu theo tài khoản, mở ở đâu cũng thấy.</p>

        <Seg
          label="Chế độ"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          options={[
            { value: 'login', label: 'Đăng nhập' },
            { value: 'register', label: 'Đăng ký' },
          ]}
        />

        <form onSubmit={submit} className="auth-form">
          <label className="field">
            <span className="label">Tên đăng nhập</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              required
            />
            {register && <span className="hint">3–24 ký tự: chữ thường, số, dấu . _ -</span>}
          </label>

          <label className="field">
            <span className="label">Mật khẩu</span>
            <span className="pw">
              <input
                className="input"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? 'new-password' : 'current-password'}
                maxLength={128}
                required
              />
              <button type="button" className="btn text" onClick={() => setShow((s) => !s)} aria-pressed={show}>
                {show ? 'Ẩn' : 'Hiện'}
              </button>
            </span>
            {register && <span className="hint">Ít nhất 8 ký tự. Chưa có email nên chưa khôi phục được mật khẩu, hãy nhớ kỹ nhé.</span>}
          </label>

          {(error || notice) && (
            <p className="error" role="alert">
              {error || notice}
            </p>
          )}

          <button className="btn primary block" disabled={busy || !username || !password}>
            {busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </main>
  );
}
