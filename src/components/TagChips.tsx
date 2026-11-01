import { useMemo } from 'react';
import { tagsOf, toggleTag, topTags } from '../lib/tags';
import type { Tx } from '../lib/types';

/** The tags this person uses most, under a note field: tap to add one to the note, tap again to take it out. */
export function TagChips({ txs, note, onNote }: { txs: Tx[]; note: string; onNote: (note: string) => void }) {
  const tags = useMemo(() => topTags(txs, 6), [txs]);
  const on = tagsOf(note);
  return (
    <div className="tag-row" role="group" aria-label="Thẻ hay dùng">
      {tags.map((t) => (
        <button key={t.tag} type="button" className={`chip tag-chip ${on.includes(t.tag) ? 'on' : ''}`} aria-pressed={on.includes(t.tag)} onClick={() => onNote(toggleTag(note, t.label))}>
          #{t.label}
        </button>
      ))}
      {!tags.length && <span className="hint">Mẹo: thêm #thẻ vào ghi chú (ví dụ #cafe, #congty) để lọc và thống kê sau này.</span>}
    </div>
  );
}
