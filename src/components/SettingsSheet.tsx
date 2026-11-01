import { useRef, useState } from 'react';
import type { SyncStatus } from '../lib/sync';
import type { ThemePref } from '../lib/theme';
import { Seg, Sheet, Toggle } from './ui';

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
  recurringSummary,
  onRecurring,
  onExportJson,
  onExportCsv,
  onImport,
  themePref,
  onTheme,
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
  recurringSummary: string;
  onRecurring: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImport: (file: File) => void;
  themePref: ThemePref;
  onTheme: (p: ThemePref) => void;
  sound: boolean;
  haptics: boolean;
  onSound: (v: boolean) => void;
  onHaptics: (v: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
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
          <b>Giao dịch định kỳ</b>
          <p className="hint">{recurringSummary}</p>
        </div>
        <button className="btn" onClick={onRecurring}>
          Mở
        </button>
      </div>
      <section className="field">
        <h3 className="label">Giao diện</h3>
        <Seg
          label="Giao diện"
          value={themePref}
          onChange={onTheme}
          options={[
            { value: 'system', label: 'Tự động' },
            { value: 'light', label: 'Sáng' },
            { value: 'dark', label: 'Tối' },
          ]}
        />
        <p className="hint">Tự động theo cài đặt của máy. Lựa chọn này chỉ áp dụng cho thiết bị đang dùng.</p>
      </section>
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
      <section className="field">
        <h3 className="label">Sao lưu dữ liệu</h3>
        <p className="hint">
          Dữ liệu được lưu theo tài khoản trên máy chủ và giữ một bản trên máy này. Bản sao lưu là một file chứa toàn bộ hũ và giao dịch của bạn, hãy giữ riêng tư.
        </p>
        <div className="row wrap">
          <button className="btn" onClick={onExportJson}>
            Tải bản sao lưu
          </button>
          <button className="btn" onClick={onExportCsv}>
            Xuất giao dịch (Excel)
          </button>
          <button className="btn" onClick={() => picker.current?.click()}>
            Khôi phục từ file
          </button>
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onImport(file);
            }}
          />
        </div>
        <p className="hint">Khôi phục sẽ gộp file vào dữ liệu hiện có, không ghi đè và không nhân đôi. Có thể hoàn tác ngay sau đó.</p>
      </section>
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
