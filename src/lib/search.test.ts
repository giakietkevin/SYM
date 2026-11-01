import { describe, expect, it } from 'vitest';
import { fold, matchTx, searchTxs, type TxQuery } from './search';
import type { Jar, Tx } from './types';

const jars: Jar[] = [{ id: 'food', name: 'Ăn uống', kind: 'spend', hue: 'sage', theme: 'jar', goal: 0, created: 0 }];
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const txs: Tx[] = [
  { id: 'a', ts: at(2026, 10, 3), type: 'expense', amount: 35_000, from: 'food', note: 'Phở bò #sáng' },
  { id: 'b', ts: at(2026, 10, 9), type: 'income', amount: 10_000_000, to: 'wallet', note: 'Lương tháng 10' },
  { id: 'c', ts: at(2026, 10, 20), type: 'expense', amount: 50_000, from: 'food', note: 'Cà phê' },
];
const q = (p: Partial<TxQuery>): TxQuery => ({ text: '', from: '', to: '', ...p });

describe('search', () => {
  it('folds accents and đ', () => expect(fold('Đường Ăn Uống')).toBe('duong an uong'));

  it('matches note words without accents', () => {
    expect(searchTxs(txs, q({ text: 'pho' }), jars).map((t) => t.id)).toEqual(['a']);
    expect(searchTxs(txs, q({ text: 'CA PHE' }), jars).map((t) => t.id)).toEqual(['c']);
  });

  it('matches the jar name', () => expect(searchTxs(txs, q({ text: 'an uong' }), jars).map((t) => t.id)).toEqual(['a', 'c']));

  it('matches an exact amount written the short way', () => {
    expect(searchTxs(txs, q({ text: '50k' }), jars).map((t) => t.id)).toEqual(['c']);
    expect(searchTxs(txs, q({ text: '10tr' }), jars).map((t) => t.id)).toEqual(['b']);
  });

  it('a number can still be a word in the note', () => expect(searchTxs(txs, q({ text: '10' }), jars).map((t) => t.id)).toEqual(['b']));

  it('matches a tag', () => expect(searchTxs(txs, q({ text: '#sang' }), jars).map((t) => t.id)).toEqual(['a']));

  it('every word must match', () => expect(searchTxs(txs, q({ text: 'pho 50k' }), jars)).toEqual([]));

  it('filters by an inclusive date range', () => {
    expect(searchTxs(txs, q({ from: '2026-10-09' }), jars).map((t) => t.id)).toEqual(['b', 'c']);
    expect(searchTxs(txs, q({ from: '2026-10-03', to: '2026-10-09' }), jars).map((t) => t.id)).toEqual(['a', 'b']);
    expect(matchTx(txs[2], q({ to: '2026-10-19' }), jars)).toBe(false);
  });
});
