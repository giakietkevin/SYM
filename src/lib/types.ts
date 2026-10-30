export type Hue = 'sage' | 'teal' | 'sky' | 'lav' | 'butter';
export type Theme = 'jar' | 'plant' | 'tree' | 'tank' | 'pig' | 'mug' | 'house' | 'heart' | 'bag' | 'gift' | 'star' | 'phone' | 'car' | 'shield' | 'bulb' | 'plane';
export type JarKind = 'spend' | 'save';

/** Where money sits: the unallocated wallet, or a jar id. */
export type Loc = 'wallet' | string;

export interface Jar {
  id: string;
  name: string;
  kind: JarKind;
  hue: Hue;
  theme: Theme;
  /** spend: monthly limit. save: target amount. */
  goal: number;
  /** save only: target date, YYYY-MM-DD */
  due?: string;
  deleted?: boolean;
  created: number;
}

/**
 * One ledger line. Balances are never stored, they are derived:
 * balance(loc) = sum of `to === loc` minus sum of `from === loc`.
 *  income   -> `to` only
 *  expense  -> `from` only
 *  transfer -> both
 */
export interface Tx {
  id: string;
  ts: number;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  from?: Loc;
  to?: Loc;
  note: string;
  /** lines created together (an income and its split, a month refill) share one id so they undo together */
  batch?: string;
  /** tombstone: removed by the user, kept so a merge from another device cannot resurrect it */
  deleted?: boolean;
}

/** Percent of an income sent to each jar; whatever is not assigned stays in the wallet. */
export type Rule = Record<string, number>;

/**
 * A monthly line (rent, a subscription, a salary). It is never a balance: each month it writes one ordinary
 * ledger line with the id `r:<id>:<YYYY-MM>`, so two devices that both write it end up with the same line.
 */
export interface Recurring {
  id: string;
  type: 'expense' | 'income';
  amount: number;
  /** expense: where it is paid from */
  from?: Loc;
  /** income: where it lands */
  to?: Loc;
  note: string;
  /** day of the month, 1-31; a short month uses its last day */
  day: number;
  /** first date it may apply, YYYY-MM-DD */
  start: string;
  /** income into the wallet follows the auto-split rule */
  split?: boolean;
  deleted?: boolean;
}

export interface State {
  jars: Jar[];
  txs: Tx[];
  sound: boolean;
  haptics: boolean;
  rule?: Rule;
  /** last month (YYYY-MM) whose spending jars were refilled or skipped */
  rolled?: string;
  recurring?: Recurring[];
}

/**
 * bg / ink are CSS variables so the pastel tiles can darken with the theme (see styles.css).
 * mid / pale are the liquid colours drawn inside the jar art and stay the same in both themes.
 */
export const HUES: Record<Hue, { name: string; bg: string; ink: string; mid: string; pale: string }> = {
  sage: { name: 'Xanh sage', bg: 'var(--hue-sage-bg)', ink: 'var(--hue-sage-ink)', mid: '#6db08a', pale: '#bfe0cc' },
  teal: { name: 'Xanh ngọc', bg: 'var(--hue-teal-bg)', ink: 'var(--hue-teal-ink)', mid: '#5fb3ac', pale: '#b4e0dc' },
  sky: { name: 'Xanh trời', bg: 'var(--hue-sky-bg)', ink: 'var(--hue-sky-ink)', mid: '#6bb4e8', pale: '#bfe2fa' },
  lav: { name: 'Tím lavender', bg: 'var(--hue-lav-bg)', ink: 'var(--hue-lav-ink)', mid: '#a09fd8', pale: '#cecdee' },
  butter: { name: 'Vàng bơ', bg: 'var(--hue-butter-bg)', ink: 'var(--hue-butter-ink)', mid: '#e9c34f', pale: '#f6e2a0' },
};

/** Soft coral is reserved for "running low", never a jar colour. */
export const CORAL = { bg: 'var(--coral-bg)', ink: 'var(--coral-ink)', mid: '#f08a73', pale: '#f9c3b6' };

/** The wallet is not a jar: a neutral tint. */
export const WALLET_TINT = { bg: 'var(--wallet-bg)', ink: 'var(--wallet-ink)' };

export const THEME_NAMES: Record<Theme, string> = {
  jar: 'Hũ nước',
  plant: 'Chậu cây',
  tank: 'Bể cá',
  pig: 'Heo đất',
  tree: 'Cây lớn',
  mug: 'Cà phê',
  house: 'Ngôi nhà',
  heart: 'Trái tim',
  bag: 'Mua sắm',
  gift: 'Hộp quà',
  star: 'Ngôi sao',
  phone: 'Điện thoại',
  car: 'Xe',
  shield: 'Bảo vệ',
  bulb: 'Ý tưởng',
  plane: 'Chuyến đi',
};
