import { useId, type ReactNode } from 'react';
import { CORAL, HUES, type Hue, type Theme } from '../lib/types';

interface Props {
  theme: Theme;
  hue: Hue;
  /** 0..1 */
  fill: number;
  /** running low: the liquid turns soft coral */
  low?: boolean;
}

const WAVE =
  'M0 5 q15 -9 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V220 H0 Z';

const INK = '#1b1d1f';

/** Level of the liquid in viewBox units for a shape spanning [bottom - height, bottom]. */
function level(fill: number, bottom: number, height: number) {
  if (fill <= 0) return bottom + 8;
  return bottom - Math.max(0.06, fill) * height;
}

function Liquid({ clip, fill, bottom, height, a, b }: { clip: string; fill: number; bottom: number; height: number; a: string; b: string }) {
  const y = level(fill, bottom, height);
  return (
    <g clipPath={`url(#${clip})`}>
      <g className="liq" style={{ transform: `translateY(${y}px)` }}>
        <g className="wave wave-back">
          <path d={WAVE} fill={b} />
        </g>
        <g className="wave wave-front">
          <path d={WAVE} fill={a} transform="translate(-22 4)" />
        </g>
      </g>
    </g>
  );
}

export function JarArt({ theme, hue, fill, low }: Props) {
  const uid = useId().replace(/:/g, '');
  const c = low ? CORAL : HUES[hue];
  const glass = 'rgba(255,255,255,.62)';

  if (theme === 'plant') return <Plant hue={hue} fill={fill} />;
  if (theme === 'tree') return <Tree fill={fill} />;

  const shape = SHAPES[theme];
  if (shape) {
    const clip = `s${uid}`;
    return (
      <svg viewBox="0 0 120 120" className="art" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <path d={shape.body} />
          </clipPath>
        </defs>
        {shape.behind?.(c)}
        <path d={shape.body} fill={glass} />
        <Liquid clip={clip} fill={fill} bottom={shape.bottom} height={shape.height} a={c.mid} b={c.pale} />
        <path d={shape.body} fill="none" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        {shape.top?.(c)}
      </svg>
    );
  }

  if (theme === 'tank') {
    const clip = `t${uid}`;
    return (
      <svg viewBox="0 0 120 120" className="art" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <rect x="13" y="30" width="94" height="74" rx="11" />
          </clipPath>
        </defs>
        <rect x="13" y="30" width="94" height="74" rx="11" fill={glass} />
        <Liquid clip={clip} fill={fill} bottom={104} height={72} a={c.mid} b={c.pale} />
        <g clipPath={`url(#${clip})`}>
          <ellipse cx="30" cy="100" rx="9" ry="5" fill="#b9b2a4" />
          <ellipse cx="46" cy="102" rx="7" ry="4" fill="#d3ccbe" />
          <ellipse cx="88" cy="101" rx="10" ry="5" fill="#c4bdaf" />
          <path d="M96 104 q-6 -14 0 -26 q6 12 0 26z" fill="#4f9a70" />
          <path d="M104 104 q-4 -10 0 -18 q4 8 0 18z" fill="#6db08a" />
          {fill > 0.06 && (
            <g className="fish">
              <ellipse cx="58" cy="72" rx="9" ry="5.5" fill="#f3d36a" stroke={INK} strokeWidth="1.6" />
              <path d="M49 72 l-8 -6 v12z" fill="#f3d36a" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="62" cy="70.5" r="1.4" fill={INK} />
            </g>
          )}
          {fill > 0.5 && (
            <g className="fish fish-2">
              <ellipse cx="78" cy="88" rx="6" ry="3.8" fill="#9fd4f5" stroke={INK} strokeWidth="1.4" />
              <path d="M72 88 l-6 -4.5 v9z" fill="#9fd4f5" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="81" cy="87" r="1" fill={INK} />
            </g>
          )}
        </g>
        <rect x="13" y="30" width="94" height="74" rx="11" fill="none" stroke={INK} strokeWidth="2.4" />
        <rect x="9" y="26" width="102" height="7" rx="3.5" fill={INK} />
      </svg>
    );
  }

  if (theme === 'pig') {
    const clip = `p${uid}`;
    return (
      <svg viewBox="0 0 120 120" className="art" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <ellipse cx="58" cy="68" rx="40" ry="31" />
          </clipPath>
        </defs>
        <path d="M30 46 l4 -14 l15 8z" fill={c.pale} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <rect x="34" y="92" width="12" height="16" rx="4" fill={c.pale} stroke={INK} strokeWidth="2.4" />
        <rect x="70" y="92" width="12" height="16" rx="4" fill={c.pale} stroke={INK} strokeWidth="2.4" />
        <path d="M18 64 q-9 -4 -6 -12 q3 -6 9 -2" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
        <ellipse cx="58" cy="68" rx="40" ry="31" fill={glass} />
        <Liquid clip={clip} fill={fill} bottom={99} height={62} a={c.mid} b={c.pale} />
        <ellipse cx="58" cy="68" rx="40" ry="31" fill="none" stroke={INK} strokeWidth="2.4" />
        <ellipse cx="99" cy="70" rx="9" ry="11" fill={c.pale} stroke={INK} strokeWidth="2.4" />
        <circle cx="96.5" cy="67" r="1.5" fill={INK} />
        <circle cx="96.5" cy="74" r="1.5" fill={INK} />
        <circle cx="82" cy="57" r="2.6" fill={INK} />
        <rect x="46" y="35.5" width="20" height="5" rx="2.5" fill={INK} />
      </svg>
    );
  }

  const clip = `j${uid}`;
  const body =
    'M36 26 h48 v8 c0 6 10 8 10 24 v40 a12 12 0 0 1 -12 12 H38 a12 12 0 0 1 -12 -12 V58 c0 -16 10 -18 10 -24 Z';
  return (
    <svg viewBox="0 0 120 120" className="art" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={glass} />
      <Liquid clip={clip} fill={fill} bottom={108} height={76} a={c.mid} b={c.pale} />
      <path d={body} fill="none" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="30" y="13" width="60" height="13" rx="4" fill={INK} />
      {fill > 0.04 && <circle cx="42" cy="78" r="3" fill="rgba(255,255,255,.7)" className="bubble" />}
    </svg>
  );
}

const LEAVES = [
  { y: 61, side: -1, s: 1 },
  { y: 58, side: 1, s: 1 },
  { y: 50, side: -1, s: 2 },
  { y: 46, side: 1, s: 2 },
  { y: 38, side: -1, s: 3 },
  { y: 34, side: 1, s: 3 },
  { y: 28, side: -1, s: 4 },
];

const STEM = [0, 14, 28, 42, 50];

function Plant({ hue, fill }: { hue: Hue; fill: number }) {
  const c = HUES[hue];
  const stage = fill <= 0.01 ? 0 : fill < 0.34 ? 1 : fill < 0.67 ? 2 : fill < 1 ? 3 : 4;
  const top = 72 - STEM[stage];
  return (
    <svg viewBox="0 0 120 120" className="art" aria-hidden="true">
      <g className="sway">
        <line
          x1="60"
          y1="72"
          x2="60"
          y2="22"
          stroke="#3f8a5f"
          strokeWidth="3.4"
          strokeLinecap="round"
          className="stem"
          style={{ transform: `scaleY(${STEM[stage] / 50})` }}
        />
        {LEAVES.map((l, i) => (
          <g key={i} transform={`translate(60 ${l.y}) rotate(${l.side * -24})`}>
            <ellipse cx={l.side * 9} cy="0" rx="9.5" ry="4.6" fill={i % 2 ? '#6db08a' : '#4f9a70'} className={`leaf ${stage >= l.s ? '' : 'off'}`} />
          </g>
        ))}
        <g transform={`translate(60 ${top})`}>
          <g className={`bloom ${stage === 4 ? '' : 'off'}`}>
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx="0" cy="-7" rx="4.6" ry="6.6" fill="#f08a73" stroke={INK} strokeWidth="1.5" transform={`rotate(${a})`} />
            ))}
            <circle r="4.4" fill="#f3d36a" stroke={INK} strokeWidth="1.5" />
          </g>
        </g>
        {stage === 0 && <ellipse cx="60" cy="70" rx="4" ry="2.6" fill="#8a6a50" />}
      </g>
      <ellipse cx="60" cy="73" rx="24" ry="4.4" fill="#6b5240" />
      <path d="M36 74 h48 l-5 31 a5 5 0 0 1 -5 4 H46 a5 5 0 0 1 -5 -4 Z" fill={c.mid} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="32" y="68" width="56" height="9" rx="3.5" fill={c.pale} stroke={INK} strokeWidth="2.4" />
    </svg>
  );
}

type Tint = { mid: string; pale: string };
interface Shape {
  body: string;
  /** liquid spans [bottom - height, bottom] */
  bottom: number;
  height: number;
  behind?: (c: Tint) => ReactNode;
  top?: (c: Tint) => ReactNode;
}

const line = { fill: 'none', stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Every shape fills with the same liquid as a jar: the outline is the only thing that changes. */
const SHAPES: Partial<Record<Theme, Shape>> = {
  mug: {
    body: 'M28 36 H88 V90 a16 16 0 0 1 -16 16 H44 a16 16 0 0 1 -16 -16 Z',
    bottom: 106,
    height: 70,
    behind: () => <path d="M88 48 h8 a12 13 0 0 1 0 28 h-8" {...line} />,
    top: () => (
      <>
        <rect x="24" y="32" width="68" height="8" rx="3" fill={INK} />
        <path d="M44 24 q-5 -6 0 -12 M58 24 q-5 -6 0 -12 M72 24 q-5 -6 0 -12" {...line} strokeWidth={2} />
      </>
    ),
  },
  house: {
    body: 'M60 14 L106 54 H95 V106 H25 V54 H14 Z',
    bottom: 106,
    height: 92,
    behind: () => <path d="M78 34 V20 H90 V46" {...line} fill="rgba(255,255,255,.62)" />,
    top: (c) => <path d="M50 106 V86 a10 10 0 0 1 20 0 V106" {...line} fill={c.pale} />,
  },
  heart: {
    body: 'M60 106 C18 76 12 52 21 39 C30 27 50 28 60 45 C70 28 90 27 99 39 C108 52 102 76 60 106 Z',
    bottom: 106,
    height: 78,
  },
  bag: {
    body: 'M26 42 H94 L101 106 H19 Z',
    bottom: 106,
    height: 64,
    top: () => <path d="M44 42 V32 a16 16 0 0 1 32 0 V42" {...line} />,
  },
  gift: {
    body: 'M24 58 H96 V106 H24 Z',
    bottom: 106,
    height: 48,
    top: () => (
      <>
        <rect x="19" y="42" width="82" height="16" rx="3" fill="#f3d36a" stroke={INK} strokeWidth="2.4" />
        <rect x="54" y="42" width="12" height="64" fill="#f3d36a" stroke={INK} strokeWidth="2.4" />
        <path d="M60 42 C46 40 40 26 50 24 C58 22 60 34 60 42 C60 34 62 22 70 24 C80 26 74 40 60 42 Z" {...line} fill="#f3d36a" />
      </>
    ),
  },
  star: {
    body: 'M60 11 L74 43 L109 46 L82 69 L91 103 L60 85 L29 103 L38 69 L11 46 L46 43 Z',
    bottom: 103,
    height: 92,
  },
  phone: {
    body: 'M38 12 H82 a8 8 0 0 1 8 8 V100 a8 8 0 0 1 -8 8 H38 a8 8 0 0 1 -8 -8 V20 a8 8 0 0 1 8 -8 Z',
    bottom: 108,
    height: 96,
    top: () => <path d="M52 20 H68 M52 100 H68" {...line} strokeWidth={3} />,
  },
  shield: {
    body: 'M60 11 L101 25 V58 C101 84 83 100 60 110 C37 100 19 84 19 58 V25 Z',
    bottom: 110,
    height: 99,
  },
  bulb: {
    body: 'M60 12 C36 12 24 30 24 46 C24 60 32 68 40 78 C44 83 44 88 44 92 H76 C76 88 76 83 80 78 C88 68 96 60 96 46 C96 30 84 12 60 12 Z',
    bottom: 92,
    height: 80,
    top: () => (
      <>
        <rect x="45" y="95" width="30" height="7" rx="3.5" fill={INK} />
        <rect x="50" y="104" width="20" height="7" rx="3.5" fill={INK} />
      </>
    ),
  },
  plane: {
    body: 'M60 8 C65 8 67 14 67 20 V44 L108 66 V76 L67 64 V88 L82 98 V106 L60 100 L38 106 V98 L53 88 V64 L12 76 V66 L53 44 V20 C53 14 55 8 60 8 Z',
    bottom: 106,
    height: 98,
  },
  car: {
    body: 'M10 92 V74 Q10 67 18 65 L32 62 L42 47 Q45 43 52 43 H80 Q86 43 90 49 L100 62 L108 65 Q112 67 112 74 V92 Z',
    bottom: 92,
    height: 49,
    top: () => (
      <>
        <circle cx="33" cy="93" r="11" fill={INK} />
        <circle cx="33" cy="93" r="4" fill="#fff" />
        <circle cx="89" cy="93" r="11" fill={INK} />
        <circle cx="89" cy="93" r="4" fill="#fff" />
      </>
    ),
  },
};

const CANOPY = [
  [60, 44, 22],
  [38, 58, 17],
  [82, 58, 17],
  [60, 62, 18],
];
const TREE_SCALE = [0, 0.3, 0.55, 0.8, 1];

/** Grows with progress like the plant: trunk first, then a fuller canopy, fruit at 100%. */
function Tree({ fill }: { fill: number }) {
  const stage = fill <= 0.01 ? 0 : fill < 0.34 ? 1 : fill < 0.67 ? 2 : fill < 1 ? 3 : 4;
  const s = TREE_SCALE[stage];
  return (
    <svg viewBox="0 0 120 120" className="art" aria-hidden="true">
      <ellipse cx="60" cy="106" rx="34" ry="5" fill="#6b5240" />
      <g className="sway">
        <rect x="54" y="62" width="12" height="44" rx="3" fill="#8a6a50" stroke={INK} strokeWidth="2.4" className="stem" style={{ transform: `scaleY(${Math.max(0.0001, Math.min(1, s * 1.25))})` }} />
        <g className="leaf" style={{ transform: `scale(${s})`, transformOrigin: '60px 72px', transformBox: 'view-box' }}>
          {CANOPY.map(([x, y, r], i) => (
            <circle key={`o${i}`} cx={x} cy={y} r={r + 2.4} fill={INK} />
          ))}
          {CANOPY.map(([x, y, r], i) => (
            <circle key={`i${i}`} cx={x} cy={y} r={r} fill={i % 2 ? '#6db08a' : '#4f9a70'} />
          ))}
          <g className={`bloom ${stage === 4 ? '' : 'off'}`}>
            <circle cx="50" cy="50" r="4" fill="#f08a73" stroke={INK} strokeWidth="1.5" />
            <circle cx="72" cy="58" r="4" fill="#f08a73" stroke={INK} strokeWidth="1.5" />
            <circle cx="42" cy="66" r="4" fill="#f08a73" stroke={INK} strokeWidth="1.5" />
          </g>
        </g>
      </g>
    </svg>
  );
}
