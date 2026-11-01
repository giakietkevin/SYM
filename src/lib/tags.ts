import { fold } from './search';
import type { Tx } from './types';

/**
 * Tags live in the note as #words ("Phở #sáng #congty"), so nothing new has to be stored, synced or backed up.
 * A tag is compared folded (no case, no accents): #Sáng and #sang are the same tag.
 */
const TAG = /#([\p{L}\p{N}_-]{1,30})/gu;

/** The tags in a note, folded, each once, in order. */
export function tagsOf(note: string): string[] {
  const out: string[] = [];
  for (const m of note.matchAll(TAG)) {
    const t = fold(m[1]);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Tags by how often they are used, most used first; the display form is the one written most recently. */
export function topTags(txs: Tx[], limit = 8): { tag: string; label: string; n: number }[] {
  const map = new Map<string, { tag: string; label: string; n: number; ts: number }>();
  for (const t of txs) {
    if (t.deleted) continue;
    for (const m of t.note.matchAll(TAG)) {
      const tag = fold(m[1]);
      const cur = map.get(tag);
      if (!cur) map.set(tag, { tag, label: m[1], n: 1, ts: t.ts });
      else {
        cur.n++;
        if (t.ts > cur.ts) Object.assign(cur, { label: m[1], ts: t.ts });
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.n - a.n || b.ts - a.ts)
    .slice(0, limit)
    .map(({ tag, label, n }) => ({ tag, label, n }));
}

/** Adds "#label" to the end of a note, or takes it out if it is already there. */
export function toggleTag(note: string, label: string): string {
  const tag = fold(label);
  if (tagsOf(note).includes(tag)) {
    return note
      .replace(TAG, (whole, word: string) => (fold(word) === tag ? '' : whole))
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return `${note.trim()} #${label}`.trim();
}

/** Spending per tag (expenses only), biggest first. A line with two tags counts towards both. */
export function spendByTag(txs: Tx[]): { tag: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.deleted || t.type !== 'expense') continue;
    for (const tag of tagsOf(t.note)) map.set(tag, (map.get(tag) ?? 0) + t.amount);
  }
  return [...map].map(([tag, amount]) => ({ tag, amount })).sort((a, b) => b.amount - a.amount);
}
