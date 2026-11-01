import { useState } from 'react';
import { fmtD } from '../lib/money';
import { fold, isActive, type TxQuery } from '../lib/search';
import { topTags } from '../lib/tags';
import type { Tx } from '../lib/types';

/** Search box for History: words, #tags or an amount, plus an optional date range. */
export function HistorySearch({ query, onChange, shown, all }: { query: TxQuery; onChange: (q: TxQuery) => void; shown: Tx[]; all: Tx[] }) {
  const tags = topTags(all, 8);
  const words = fold(query.text).split(/\s+/);
  const [dates, setDates] = useState(!!(query.from || query.to));
  const active = isActive(query);
  const spent = shown.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const income = shown.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="search">
      <div className="search-row">
        <input
          className="input"
          type="search"
          value={query.text}
          onChange={(e) => onChange({ ...query, text: e.target.value })}
          placeholder="Tìm: phở, #cafe, 50k…"
          aria-label="Tìm giao dịch"
          enterKeyHint="search"
        />
        <button type="button" className={`btn ${dates ? 'on' : ''}`} aria-expanded={dates} onClick={() => setDates(!dates)}>
          Ngày
        </button>
      </div>
      {tags.length > 0 && (
        <div className="tag-row" role="group" aria-label="Lọc theo thẻ">
          {tags.map((t) => {
            const on = words.includes(`#${t.tag}`);
            return (
              <button
                key={t.tag}
                type="button"
                className={`chip tag-chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    ...query,
                    text: on
                      ? query.text
                          .split(/\s+/)
                          .filter((w) => fold(w) !== `#${t.tag}`)
                          .join(' ')
                      : `${query.text.trim()} #${t.label}`.trim(),
                  })
                }
              >
                #{t.label} <span className="tag-n">{t.n}</span>
              </button>
            );
          })}
        </div>
      )}
      {dates && (
        <div className="search-dates">
          <label className="field">
            <span className="label">Từ ngày</span>
            <input className="input" type="date" value={query.from} max={query.to || undefined} onChange={(e) => onChange({ ...query, from: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Đến ngày</span>
            <input className="input" type="date" value={query.to} min={query.from || undefined} onChange={(e) => onChange({ ...query, to: e.target.value })} />
          </label>
        </div>
      )}
      {active && (
        <p className="hint num search-sum" role="status">
          {shown.length} giao dịch · chi {fmtD(spent)} · thu {fmtD(income)}
          <button
            type="button"
            className="btn text"
            onClick={() => {
              onChange({ text: '', from: '', to: '' });
              setDates(false);
            }}
          >
            Xóa bộ lọc
          </button>
        </p>
      )}
    </div>
  );
}
