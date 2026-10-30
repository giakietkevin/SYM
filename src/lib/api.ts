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
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Có lỗi xảy ra', data);
  return data as T;
}

export interface Remote {
  state: State | null;
  rev: number;
}

export const api = {
  me: () => call<{ username: string }>('/api/me'),
  register: (username: string, password: string) => call<{ username: string }>('/api/register', 'POST', { username, password }),
  login: (username: string, password: string) => call<{ username: string }>('/api/login', 'POST', { username, password }),
  logout: () => call<{ ok: true }>('/api/logout', 'POST', {}),
  getData: () => call<Remote>('/api/data'),
  putData: (state: State, rev: number) => call<{ rev: number }>('/api/data', 'PUT', { state, rev }),
};
