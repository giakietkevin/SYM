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
}

export interface State {
  jars: Jar[];
  txs: Tx[];
  sound: boolean;
  haptics: boolean;
}

export const HUES: Record<Hue, { name: string; bg: string; ink: string; mid: string; pale: string }> = {
  sage: { name: 'Xanh sage', bg: '#dcefe3', ink: '#1d5a3a', mid: '#6db08a', pale: '#bfe0cc' },
  teal: { name: 'Xanh ngọc', bg: '#d5efec', ink: '#0f4f4c', mid: '#5fb3ac', pale: '#b4e0dc' },
  sky: { name: 'Xanh trời', bg: '#dcf1ff', ink: '#0a3a80', mid: '#6bb4e8', pale: '#bfe2fa' },
  lav: { name: 'Tím lavender', bg: '#e5e4f5', ink: '#34335f', mid: '#a09fd8', pale: '#cecdee' },
  butter: { name: 'Vàng bơ', bg: '#fbf0c8', ink: '#5e4700', mid: '#e9c34f', pale: '#f6e2a0' },
};

/** Soft coral is reserved for "running low", never a jar colour. */
export const CORAL = { bg: '#ffe2dc', ink: '#8a2a18', mid: '#f08a73', pale: '#f9c3b6' };

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
