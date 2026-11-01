import { describe, expect, it } from 'vitest';
import { spendByTag, tagsOf, toggleTag, topTags } from './tags';
import type { Tx } from './types';

const tx = (id: string, note: string, p: Partial<Tx> = {}): Tx => ({ id, ts: Number(id.replace(/\D/g, '')) || 1, type: 'expense', amount: 10, from: 'f', note, ...p });

describe('tags', () => {
  it('reads tags from a note, folded and once each', () => {
    expect(tagsOf('Phở #Sáng với #công_ty #sang')).toEqual(['sang', 'cong_ty']);
    expect(tagsOf('không có tag, giá 50# nhé')).toEqual([]);
  });

  it('ranks tags by use and shows the latest spelling', () => {
    const list = topTags([tx('t1', '#cafe'), tx('t2', '#Cafe #sang'), tx('t3', '#sang', { deleted: true })]);
    expect(list).toEqual([
      { tag: 'cafe', label: 'Cafe', n: 2 },
      { tag: 'sang', label: 'sang', n: 1 },
    ]);
  });

  it('toggles a tag on and off', () => {
    expect(toggleTag('Phở', 'sáng')).toBe('Phở #sáng');
    expect(toggleTag('', 'cafe')).toBe('#cafe');
    expect(toggleTag('Phở #Sáng ngon', 'sang')).toBe('Phở ngon');
  });

  it('sums spending per tag', () => {
    const list = spendByTag([tx('t1', '#cafe #sang', { amount: 30 }), tx('t2', '#cafe', { amount: 20 }), tx('t3', '#luong', { type: 'income', amount: 999 })]);
    expect(list).toEqual([
      { tag: 'cafe', amount: 50 },
      { tag: 'sang', amount: 30 },
    ]);
  });
});
