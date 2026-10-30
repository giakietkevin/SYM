import { useState } from 'react';
import type { SyncStatus } from '../lib/sync';
import { Sheet, Toggle } from './ui';

const STATUS: Record<SyncStatus, string> = {
  saved: 'Đã lưu lên máy chủ',
  saving: 'Đang lưu…',
  offline: 'Đang ngoại tuyến. Thay đổi được giữ trên máy và sẽ tự lưu khi có mạng.',
};

export function SettingsSheet({
  username,
  status,
  onLogout,
  ruleSummary,
  onSplit,
  sound,
  haptics,
  onSound,
  onHaptics,
  onReset,
  onClose,
}: {
  username: string;
  status: SyncStatus;
  onLogout: () => void;
  ruleSummary: string;
  onSplit: () => void;
  sound: boolean;
  haptics: boolean;
  onSound: (v: boolean) => void;
  onHaptics: (v: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Sheet title="Cài đặt" onClose={onClose}>
      <div className="setting">
        <div>
          <b>Tài khoản: {username}</b>
          <p className="hint" role="status">
            {STATUS[status]}
          </p>
        </div>
        <button className="btn" onClick={onLogout}>
          Đăng xuất
        </button>
      </div>
      <div className="setting">
        <div>
          <b>Quy tắc chia tiền</b>
          <p className="hint">{ruleSummary}</p>
        </div>
        <button className="btn" onClick={onSplit}>
          Mở
        </button>
      </div>
      <div className="setting">
        <div>
          <b>Âm thanh</b>
          <p className="hint">Tiếng “chinh!” khi tiền vào hũ.</p>
        </div>
        <Toggle on={sound} onChange={onSound} label="Âm thanh" />
      </div>
      <div className="setting">
        <div>
          <b>Rung phản hồi</b>
          <p className="hint">Rung nhẹ khi bấm, kéo và thả. Hoạt động trên Android và khi cài app.</p>
        </div>
        <Toggle on={haptics} onChange={onHaptics} label="Rung phản hồi" />
      </div>
      <div className="setting">
        <div>
          <b>Dữ liệu</b>
          <p className="hint">Lưu theo tài khoản trên máy chủ, và giữ một bản trên máy này để dùng khi không có mạng.</p>
        </div>
      </div>
      <div className="danger">
        {!confirming ? (
          <button className="btn text negative" onClick={() => setConfirming(true)}>
            Xóa toàn bộ dữ liệu
          </button>
        ) : (
          <div className="confirm">
            <p>Tất cả hũ và giao dịch sẽ bị xóa, mọi số dư về 0₫. Không hoàn tác được.</p>
            <div className="row">
              <button className="btn" onClick={() => setConfirming(false)}>
                Giữ dữ liệu
              </button>
              <button className="btn negative-fill" onClick={onReset}>
                Xóa dữ liệu
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
