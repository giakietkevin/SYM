import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { currentSubscription, disablePush, enablePush, pushSupport } from '../lib/push';
import type { NotifyPrefs } from '../lib/types';
import { Toggle } from './ui';

const WHY: Record<string, string> = {
  dev: 'Thông báo đẩy chỉ chạy ở bản build (npm run build rồi npm start), không chạy khi đang phát triển.',
  insecure: 'Thông báo cần mở SYM qua HTTPS.',
  'ios-install': 'Trên iPhone/iPad: bấm Chia sẻ → "Thêm vào MH chính", mở SYM từ màn hình chính rồi bật thông báo ở đây (iOS 16.4 trở lên).',
  unsupported: 'Trình duyệt này chưa hỗ trợ thông báo đẩy.',
};

/** Settings: push on this device, and what to be told about (for the account, on every device). */
export function NotifySettings({ prefs, onPrefs }: { prefs: NotifyPrefs; onPrefs: (p: NotifyPrefs) => void }) {
  const support = pushSupport();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    currentSubscription().then((s) => setOn(!!s));
  }, []);

  const toggle = async (want: boolean) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (want) await enablePush();
      else await disablePush();
      setOn(want);
      if (want) setMsg({ ok: true, text: 'Đã bật thông báo trên thiết bị này.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError && err.status === 0 ? 'Cần có mạng để bật thông báo' : err instanceof Error ? err.message : 'Không bật được thông báo' });
    }
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { delivered } = await api.pushTest();
      setMsg(delivered ? { ok: true, text: `Đã gửi tới ${delivered} thiết bị. Nếu không thấy, kiểm tra chế độ Không làm phiền.` } : { ok: false, text: 'Chưa gửi được tới thiết bị nào.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Không gửi được' });
    }
    setBusy(false);
  };

  const set = (p: Partial<NotifyPrefs>) => onPrefs({ ...prefs, ...p });

  return (
    <section className="field">
      <h3 className="label">Thông báo</h3>
      {support === 'ok' ? (
        <div className="setting">
          <div>
            <b>Nhận thông báo trên thiết bị này</b>
            <p className="hint">Xu nhắc bạn cả khi không mở app.</p>
          </div>
          <Toggle on={!!on} onChange={toggle} label="Nhận thông báo trên thiết bị này" />
        </div>
      ) : (
        <p className="hint">{WHY[support]}</p>
      )}
      {msg && (
        <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <div className="setting">
        <div>
          <b>Nhắc ghi chi tiêu</b>
          <p className="hint">Buổi tối, nếu hôm đó chưa ghi khoản nào.</p>
        </div>
        <div className="row">
          {prefs.log && (
            <select className="input hour-select" value={prefs.hour} onChange={(e) => set({ hour: Number(e.target.value) })} aria-label="Giờ nhắc">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          )}
          <Toggle on={prefs.log} onChange={(v) => set({ log: v })} label="Nhắc ghi chi tiêu" />
        </div>
      </div>
      <div className="setting">
        <div>
          <b>Khoản định kỳ sắp tới</b>
          <p className="hint">Sáng hôm trước, kèm cảnh báo nếu hũ chưa đủ tiền.</p>
        </div>
        <Toggle on={prefs.bills} onChange={(v) => set({ bills: v })} label="Khoản định kỳ sắp tới" />
      </div>
      <div className="setting">
        <div>
          <b>Hạn trả nợ</b>
          <p className="hint">Sáng hôm trước và sáng ngày đến hạn.</p>
        </div>
        <Toggle on={prefs.debts} onChange={(v) => set({ debts: v })} label="Hạn trả nợ" />
      </div>
      <div className="setting">
        <div>
          <b>Số dư âm</b>
          <p className="hint">Mỗi sáng, khi Ví tổng hoặc một hũ đang âm tiền.</p>
        </div>
        <Toggle on={prefs.negative !== false} onChange={(v) => set({ negative: v })} label="Số dư âm" />
      </div>
      {on && (
        <button className="btn" onClick={test} disabled={busy}>
          Gửi thử một thông báo
        </button>
      )}
      <p className="hint">Các lựa chọn nhắc gì áp dụng cho mọi thiết bị đã bật thông báo của tài khoản này.</p>
    </section>
  );
}
