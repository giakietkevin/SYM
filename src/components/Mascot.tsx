export type Mood = 'happy' | 'nervous';

const INK = '#1b1d1f';

/** Xu, the coin. Smiles while every jar is fine, sweats when one passes 85% of its limit. */
export function Mascot({ mood }: { mood: Mood }) {
  const nervous = mood === 'nervous';
  return (
    <svg viewBox="0 0 120 120" className={`mascot ${nervous ? 'nervous' : 'happy'}`} role="img" aria-label={nervous ? 'Xu đang lo' : 'Xu đang vui'}>
      <g className="mascot-body">
        <circle cx="60" cy="62" r="46" fill="#f3d36a" stroke={INK} strokeWidth="2.6" />
        <circle cx="60" cy="62" r="36" fill="none" stroke="#c9a52e" strokeWidth="2" strokeDasharray="3 5" />
        <g className="eyes">
          <ellipse cx="45" cy="56" rx={nervous ? 6 : 4.8} ry={nervous ? 7.4 : 6} fill={INK} />
          <ellipse cx="75" cy="56" rx={nervous ? 6 : 4.8} ry={nervous ? 7.4 : 6} fill={INK} />
          {nervous && (
            <>
              <circle cx="47" cy="53" r="1.8" fill="#fff" />
              <circle cx="77" cy="53" r="1.8" fill="#fff" />
            </>
          )}
        </g>
        <circle cx="34" cy="70" r="5.5" fill="#f9c3b6" />
        <circle cx="86" cy="70" r="5.5" fill="#f9c3b6" />
        {nervous ? (
          <path d="M44 83 q4.4 -5 8.8 0 t8.8 0 t8.8 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        ) : (
          <path d="M42 74 q18 18 36 0" fill="#fff" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </g>
      {nervous && <path className="sweat" d="M96 28 q-7 10 0 15 q7 -5 0 -15z" fill="#9fd4f5" stroke={INK} strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  );
}
