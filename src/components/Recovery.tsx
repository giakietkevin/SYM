import { useState } from 'react';
import { Logo } from './icons';
import { Mascot } from './Mascot';

/** Copy and save buttons for a recovery code. Nothing leaves the device. */
export function CodeBox({ code, username }: { code: string; username: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard blocked: the code is on screen and can be saved as a file */
    }
  };

  const save = () => {
    const text = `SYM - ma khoi phuc mat khau\nTai khoan: ${username}\nMa: ${code}\n\nMa nay dung duoc mot lan. Giu o noi an toan, khong gui cho ai.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sym-ma-khoi-phuc-${username}.txt`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="code-box">
      <output className="code num" aria-label="Mã khôi phục">
        {code}
      </output>
      <div className="row">
        <button type="button" className="btn" onClick={copy}>
          {copied ? 'Đã chép' : 'Chép mã'}
        </button>
        <button type="button" className="btn" onClick={save}>
          Lưu thành file
        </button>
      </div>
    </div>
  );
}

/** Shown once after sign-up or a password reset, before the app opens. */
export function RecoveryScreen({
  code,
  username,
  reason,
  onDone,
}: {
  code: string;
  username: string;
  reason: 'new' | 'reset';
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={36} />
          <span>SYM</span>
        </div>
        <Mascot mood="happy" />
        <h1>{reason === 'new' ? 'Giữ mã khôi phục' : 'Đã đặt lại mật khẩu'}</h1>
        <p className="auth-sub">
          {reason === 'new'
            ? 'Nếu quên mật khẩu, mã này là cách duy nhất để vào lại tài khoản. Nó chỉ hiện một lần.'
            : 'Mã cũ đã dùng xong. Đây là mã khôi phục mới, nó chỉ hiện một lần.'}
        </p>
        <CodeBox code={code} username={username} />
        <label className="check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>Tôi đã lưu mã này ở nơi an toàn</span>
        </label>
        <button className="btn primary block" disabled={!saved} onClick={onDone}>
          Vào SYM
        </button>
      </div>
    </main>
  );
}
