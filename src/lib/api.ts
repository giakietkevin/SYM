import type { State } from './types';

/** status 0 means the network itself failed (offline, server down). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: any,
  ) {
    super(message);
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ');
  }
  const data = await res.json().catch(() => ({}));
  // our own server always answers errors with JSON; a 5xx without it came from something in front of it
  // (a proxy with nothing behind it), so treat it like being offline instead of a failed request
  if (!res.ok && !data.error && res.status >= 500) throw new ApiError(0, 'Không kết nối được máy chủ');
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Có lỗi xảy ra', data);
  return data as T;
}

export interface Remote {
  state: State | null;
  rev: number;
}

/** What we know about the person. email and phone are null only on accounts made before profiles existed. */
export interface Profile {
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  /** whether a recovery code exists for forgotten-password reset (the code itself is never sent again) */
  hasRecovery: boolean;
  /** small JPEG data URL, or null for the initials circle */
  avatar?: string | null;
}

/** Sign-up and a password reset answer with the profile plus a fresh recovery code, shown once. */
export type WithCode = Profile & { recoveryCode?: string };

export interface Registration {
  username: string;
  password: string;
  fullName: string;
  email: string;
  phone: string;
}

export const api = {
  me: () => call<Profile>('/api/me'),
  register: (r: Registration) => call<WithCode>('/api/register', 'POST', r),
  /** `identifier` is the username or the email */
  login: (identifier: string, password: string) => call<Profile>('/api/login', 'POST', { username: identifier, password }),
  /** The name can always change. Email and phone can only be given once, by an account that has none yet. */
  updateProfile: (p: { fullName?: string; email?: string; phone?: string }) => call<Profile>('/api/profile', 'PUT', p),
  changePassword: (current: string, next: string) => call<{ ok: true }>('/api/password', 'POST', { current, next }),
  newRecoveryCode: (password: string) => call<{ recoveryCode: string }>('/api/recovery-code', 'POST', { password }),
  /** forgotten password: username or email + recovery code -> new password, signed in */
  reset: (identifier: string, code: string, password: string) => call<WithCode>('/api/reset', 'POST', { username: identifier, code, password }),
  /** a data URL from avatarFromFile, or null to remove the picture */
  setAvatar: (image: string | null) => call<Profile>('/api/avatar', 'PUT', { image }),
  logout: () => call<{ ok: true }>('/api/logout', 'POST', {}),
  getData: () => call<Remote>('/api/data'),
  putData: (state: State, rev: number) => call<{ rev: number }>('/api/data', 'PUT', { state, rev }),
};
