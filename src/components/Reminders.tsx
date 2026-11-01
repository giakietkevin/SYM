import { useState } from 'react';
import type { Reminder } from '../lib/reminders';
import { dateKey } from '../lib/recurring';

const key = (user: string) => `sym.dismissed.${user}`;

/** Dismissed reminder ids for today only, on this device: tomorrow they come back if still true. */
function readDismissed(user: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(user)) ?? 'null') as { day: string; ids: string[] } | null;
    return raw && raw.day === dateKey(new Date()) && Array.isArray(raw.ids) ? raw.ids : [];
  } catch {
    return [];
  }
}

const ACTION: Record<Reminder['kind'], string> = { debt: 'Mở', recurring: 'Xem', log: 'Ghi', negative: 'Bù tiền' };

export function RemindersCard({ user, items, onOpen }: { user: string; items: Reminder[]; onOpen: (r: Reminder) => void }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(user));
  const shown = items.filter((r) => !dismissed.includes(r.id));
  if (!shown.length) return null;

  const dismiss = (id: string) => {
    const ids = [...dismissed, id];
    setDismissed(ids);
    try {
      localStorage.setItem(key(user), JSON.stringify({ day: dateKey(new Date()), ids }));
    } catch {
      /* blocked: it just comes back on the next visit */
    }
  };

  return (
    <section className="reminders" aria-labelledby="h-remind">
      <h2 id="h-remind" className="sec">
        Nhắc việc
      </h2>
      <ul>
        {shown.slice(0, 4).map((r) => (
          <li key={r.id} className={`remind ${r.tone}`}>
            <span className="remind-dot" aria-hidden="true" />
            <span className="remind-text">{r.text}</span>
            <button className="btn text" onClick={() => onOpen(r)}>
              {ACTION[r.kind]}
            </button>
            <button className="icon-btn remind-x" onClick={() => dismiss(r.id)} aria-label={`Ẩn nhắc việc hôm nay: ${r.text}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {shown.length > 4 && <p className="hint">và {shown.length - 4} việc khác</p>}
    </section>
  );
}
