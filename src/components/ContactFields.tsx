import { validEmail, validPhone } from '../lib/validate';

export interface Contact {
  fullName: string;
  email: string;
  phone: string;
}

export type ContactErrors = Partial<Record<'email' | 'phone', string>>;

/** Email and phone are required; the name is not. */
export function contactErrors(c: Contact): ContactErrors {
  const e: ContactErrors = {};
  if (!c.email.trim()) e.email = 'Vui lòng nhập email';
  else if (!validEmail(c.email)) e.email = 'Email chưa đúng định dạng';
  if (!c.phone.trim()) e.phone = 'Vui lòng nhập số điện thoại';
  else if (!validPhone(c.phone)) e.phone = 'Số điện thoại cần 9–15 chữ số';
  return e;
}

/** The three profile fields, shared by sign-up and by "complete your profile". */
export function ContactFields({
  value,
  errors,
  onChange,
}: {
  value: Contact;
  errors: ContactErrors;
  onChange: (field: keyof Contact, v: string) => void;
}) {
  return (
    <>
      <label className="field">
        <span className="label">Họ và tên (không bắt buộc)</span>
        <input className="input" value={value.fullName} onChange={(e) => onChange('fullName', e.target.value)} autoComplete="name" maxLength={80} />
      </label>

      <label className="field">
        <span className="label">Email</span>
        <input
          className="input"
          type="email"
          inputMode="email"
          value={value.email}
          onChange={(e) => onChange('email', e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'err-email' : undefined}
        />
        {errors.email && (
          <span id="err-email" className="error" role="alert">
            {errors.email}
          </span>
        )}
      </label>

      <label className="field">
        <span className="label">Số điện thoại</span>
        <input
          className="input"
          type="tel"
          inputMode="tel"
          value={value.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          autoComplete="tel"
          maxLength={20}
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? 'err-phone' : undefined}
        />
        {errors.phone && (
          <span id="err-phone" className="error" role="alert">
            {errors.phone}
          </span>
        )}
        <span className="hint">Email và số điện thoại không thể thay đổi sau khi lưu. Mỗi email chỉ dùng cho một tài khoản.</span>
      </label>
    </>
  );
}
