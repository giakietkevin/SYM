import { useEffect, useMemo, useRef, useState } from 'react';
import { packBubbles } from '../lib/bubbles';
import { fmtD, short } from '../lib/money';
import type { Store } from '../lib/store';
import { HUES, WALLET_TINT, type Loc } from '../lib/types';

/** Where the money is, at a glance: one circle per place, its area following the balance. Tap to open. */
export function BubbleMap({ store, onOpen }: { store: Store; onOpen: (loc: Loc) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(Math.min(440, Math.max(260, width * 0.95)));

  const places = useMemo(
    () => [
      { id: 'wallet', name: 'Ví', full: 'Ví tổng', value: store.wallet, bg: WALLET_TINT.bg, ink: WALLET_TINT.ink },
      ...store.jars.map((j) => ({ id: j.id, name: j.name, full: j.name, value: store.bal[j.id] ?? 0, bg: HUES[j.hue].bg, ink: HUES[j.hue].ink })),
    ],
    [store.wallet, store.jars, store.bal],
  );

  const bubbles = useMemo(() => packBubbles(places.map((p) => ({ id: p.id, value: p.value })), width, height), [places, width, height]);
  const total = places.reduce((s, p) => s + Math.max(0, p.value), 0);

  return (
    <div className="bubbles" ref={box}>
      {width > 0 && (
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="group" aria-label="Biểu đồ bong bóng: tiền đang nằm ở đâu">
          {bubbles.map((b) => {
            const p = places.find((x) => x.id === b.id)!;
            const pct = total > 0 ? Math.round((Math.max(0, p.value) / total) * 100) : 0;
            const fs = Math.max(11, Math.min(16, b.r / 3.4));
            const label = b.r * 2 >= 62 ? p.name : '';
            const clipped = label.length * fs * 0.58 > b.r * 1.7 ? `${label.slice(0, Math.max(2, Math.floor((b.r * 1.7) / (fs * 0.58)) - 1))}…` : label;
            return (
              <g
                key={b.id}
                className="bubble-node"
                role="button"
                tabIndex={0}
                aria-label={`${p.full}: ${fmtD(p.value)}${total > 0 ? `, ${pct}% tổng số tiền` : ''}`}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(p.id))}
                transform={`translate(${b.x} ${b.y})`}
              >
                <circle r={b.r} style={{ fill: p.bg }} />
                {clipped && (
                  <text y={b.r >= 40 ? -fs * 0.15 : fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight={600} style={{ fill: p.ink }}>
                    {clipped}
                  </text>
                )}
                {clipped && b.r >= 40 && (
                  <text y={fs * 1.15} textAnchor="middle" fontSize={Math.max(11, fs - 1)} className="num" style={{ fill: p.ink }}>
                    {short(p.value)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <p className="hint">
        Diện tích mỗi bong bóng theo số tiền trong hũ. Tổng {fmtD(total)}. Bấm vào bong bóng để mở hũ.
      </p>
    </div>
  );
}
