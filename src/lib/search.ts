import { evalExpr } from './money';
import { dateKey } from './recurring';
import type { Jar, Tx } from './types';

/** Lower case, no accents, đ -> d: "Ăn Uống" and "an uong" are the same words. */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();

export interface TxQuery {
  /** free text: words in the note or the jar names, "#tag", or an amount like "50k" */
  text: string;
  /** YYYY-MM-DD, inclusive; empty for no bound */
  from: string;
  to: string;
}

export const emptyQuery: TxQuery = { text: '', from: '', to: '' };

export const isActive = (q: TxQuery) => !!(q.text.trim() || q.from || q.to);

/**
 * Every word must match. A word that reads as an amount ("50k", "1tr", "35000") matches lines of exactly that
 * amount, or its words in the text; anything else must appear in the note or the names of the places involved.
 */
export function matchTx(t: Tx, q: TxQuery, jars: Jar[]): boolean {
  const day = dateKey(new Date(t.ts));
  if (q.from && day < q.from) return false;
  if (q.to && day > q.to) return false;
  const words = fold(q.text).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const place = (loc?: string) => (!loc ? '' : loc === 'wallet' ? 'vi tong' : fold(jars.find((j) => j.id === loc)?.name ?? ''));
  // a query word matches the start of a word ("an" finds "ăn", not "tháng"); "#sang" and "sang" both find "#sáng"
  const tokens = `${fold(t.note)} ${place(t.from)} ${place(t.to)}`.split(/[^a-z0-9#]+/).filter(Boolean);
  const hay = [...tokens, ...tokens.filter((x) => x.startsWith('#')).map((x) => x.slice(1))];
  const has = (w: string) => hay.some((x) => x.startsWith(w));
  return words.every((w) => {
    if (/^[\d.,]+(k|tr)?$/.test(w)) {
      const n = evalExpr(w);
      if (n !== null && n > 0 && t.amount === n) return true;
    }
    return has(w);
  });
}

export function searchTxs(txs: Tx[], q: TxQuery, jars: Jar[]): Tx[] {
  return isActive(q) ? txs.filter((t) => matchTx(t, q, jars)) : txs;
}
