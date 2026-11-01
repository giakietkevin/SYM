import { useRef, useState, type FormEvent } from 'react';
import { avatarFromFile } from '../lib/image';
import { ApiError, api, type Profile } from '../lib/api';
import { formatPhone, initials } from '../lib/validate';
import { ContactFields, contactErrors, type Contact, type ContactErrors } from './ContactFields';
import { Logo } from './icons';
import { Mascot } from './Mascot';
import { DeleteAccountCard, PasskeysCard, SecurityCard, SessionsCard } from './Security';

export function Avatar({ profile, size = 40 }: { profile: Pick<Profile, 'fullName' | 'username' | 'avatar'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {profile.avatar ? <img src={profile.avatar} alt="" draggable={false} /> : initials(profile.fullName, profile.username)}
    </span>
  );
}

/**
 * Accounts made before email and phone were required are asked for them once, here.
 * After saving they are locked like every other account.
 */
export function CompleteProfile({
  profile,
  onDone,
  onLogout,
}: {
  profile: Profile;
  onDone: (p: Profile) => void;
  onLogout: () => void;
}) {
  const [contact, setContact] = useState<Contact>({ fullName: profile.fullName, email: '', phone: '' });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const errs = contactErrors(contact);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      onDone(await api.updateProfile(contact));
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
        <h1>Hoàn tất hồ sơ</h1>
        <p className="auth-sub">
          Chào {profile.fullName || profile.username}! SYM giờ cần email và số điện thoại cho mỗi tài khoản. Bạn chỉ cần nhập một lần, dữ liệu hũ của bạn vẫn nguyên vẹn.
        </p>
        <form onSubmit={submit} className="auth-form" noValidate>
          <ContactFields value={contact} errors={errors} onChange={(f, v) => setContact((c) => ({ ...c, [f]: v }))} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu và tiếp tục'}
          </button>
          <button type="button" className="btn text" onClick={onLogout}>
            Đăng xuất
          </button>
        </form>
      </div>
    </main>
  );
}

/** The profile page: the name can change, the login name, email and phone are shown but locked. */
export function ProfileScreen({ profile, onSaved, onDeleted }: { profile: Profile; onSaved: (p: Profile) => void; onDeleted: () => void }) {
  const [name, setName] = useState(profile.fullName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const setPhoto = async (make: () => Promise<string | null>) => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      onSaved(await api.setAvatar(await make()));
    } catch (err) {
      setPhotoError(err instanceof ApiError ? (err.status === 0 ? 'Cần có mạng để đổi ảnh' : err.message) : err instanceof Error ? err.message : 'Không lưu được ảnh');
    }
    setPhotoBusy(false);
  };

  const changed = name.trim().replace(/\s+/g, ' ') !== profile.fullName;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const next = await api.updateProfile({ fullName: name });
      onSaved(next);
      setName(next.fullName);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không lưu được, thử lại nhé');
    }
    setBusy(false);
  };

  return (
    <div className="profile">
      <div className="profile-head">
        <Avatar profile={profile} size={88} />
        <div className="profile-who">
          <h2 className="profile-name">{profile.fullName || profile.username}</h2>
          <p className="hint">@{profile.username}</p>
          <div className="row wrap">
            <button type="button" className="btn" disabled={photoBusy} onClick={() => picker.current?.click()}>
              {photoBusy ? 'Đang lưu…' : profile.avatar ? 'Đổi ảnh' : 'Thêm ảnh'}
            </button>
            {profile.avatar && (
              <button type="button" className="btn text negative" disabled={photoBusy} onClick={() => setPhoto(async () => null)}>
                Xóa ảnh
              </button>
            )}
            <input
              ref={picker}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) setPhoto(() => avatarFromFile(file));
              }}
            />
          </div>
        </div>
      </div>
      {photoError && (
        <p className="error" role="alert">
          {photoError}
        </p>
      )}

      <form className="profile-card" onSubmit={submit}>
        <label className="field">
          <span className="label">Họ và tên</span>
          <input
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            autoComplete="name"
            maxLength={80}
            placeholder="Chưa có tên"
          />
        </label>

        <LockedField label="Tên đăng nhập" value={profile.username} />
        <LockedField label="Email" value={profile.email ?? ''} />
        <LockedField label="Số điện thoại" value={formatPhone(profile.phone ?? '')} />
        <p className="hint">Tên đăng nhập, email và số điện thoại dùng để nhận diện tài khoản nên không thể thay đổi. Mỗi email chỉ thuộc về một tài khoản.</p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {saved && !changed && (
          <p className="ok" role="status">
            Đã lưu hồ sơ.
          </p>
        )}
        <button className="btn primary block" disabled={!changed || busy}>
          {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </form>

      <SecurityCard profile={profile} onProfile={onSaved} />
      <PasskeysCard />
      <SessionsCard />
      <DeleteAccountCard profile={profile} onDeleted={onDeleted} />
    </div>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <label className="field">
      <span className="label locked-label">
        {label}
        <span className="lock">Không thể thay đổi</span>
      </span>
      <input className="input locked" value={value} readOnly aria-readonly="true" tabIndex={0} />
    </label>
  );
}
