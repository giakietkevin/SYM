// Mirrors the server's rules so mistakes show up before the request; the server stays the judge.

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const validEmail = (v: string) => EMAIL.test(v.trim().toLowerCase()) && v.trim().length <= 254;

/** "+84 912.345.678" and "0912 345 678" are the same number. */
export function normalizePhone(v: string): string {
  let p = v.replace(/[\s.\-()]/g, '');
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  return p;
}

export const validPhone = (v: string) => /^\+?\d{9,15}$/.test(normalizePhone(v));

/** 0912345678 -> "0912 345 678" for display. Other lengths are shown as stored. */
export function formatPhone(p: string): string {
  return /^0\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
}

/** Up to two letters for the round avatar: the last two words of the name, else the username. */
export function initials(fullName: string, username: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const src = words.length ? (words.length === 1 ? [words[0]] : words.slice(-2)) : [username];
  const letters = src.length === 1 ? src[0].slice(0, 2) : src.map((w) => w[0]).join('');
  return letters.toUpperCase();
}
