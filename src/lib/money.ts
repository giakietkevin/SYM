const nf = new Intl.NumberFormat('vi-VN');

/** 1250000 -> "1.250.000" */
export const fmt = (n: number) => nf.format(Math.round(n));

/** 1250000 -> "1.250.000₫" */
export const fmtD = (n: number) => `${fmt(n)}₫`;

/** Signed, for rows: income "+", outgoing "−". */
export const fmtSigned = (n: number, sign: '+' | '−' | '') => `${sign}${fmt(Math.abs(n))}₫`;

/** Tight form for chips: 1250000 -> "1,3tr", 35000 -> "35k". */
export function short(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1_000_000) {
    const v = a / 1_000_000;
    return `${s}${(Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',')}tr`;
  }
  if (a >= 1_000) return `${s}${Math.round(a / 1_000)}k`;
  return `${s}${a}`;
}

const TERM = /^(\d+)(k|tr)?$/i;

function termValue(t: string): number | null {
  const m = TERM.exec(t);
  if (!m) return null;
  const unit = (m[2] || '').toLowerCase();
  return parseInt(m[1], 10) * (unit === 'k' ? 1_000 : unit === 'tr' ? 1_000_000 : 1);
}

/**
 * Evaluates "35k+15k", "1tr-200k", "50000". Only + and − with k / tr suffixes,
 * so there is no eval. A trailing operator is ignored while typing.
 * Returns null when the text is not an expression.
 */
export function evalExpr(raw: string): number | null {
  const s = raw.replace(/[\s.,]/g, '').replace(/[+\-−]+$/, '');
  if (!s) return 0;
  const parts = s.replace(/−/g, '-').match(/[+-]?[^+-]+/g);
  if (!parts) return null;
  let sum = 0;
  for (const p of parts) {
    const sign = p.startsWith('-') ? -1 : 1;
    const v = termValue(p.replace(/^[+-]/, ''));
    if (v === null) return null;
    sum += sign * v;
  }
  return sum;
}

/** "35k+15k" -> "35k + 15k" for display. */
export function prettyExpr(raw: string): string {
  return raw.replace(/\+/g, ' + ').replace(/-/g, ' − ').trim();
}

export const hasOperator = (raw: string) => /[+\-−]/.test(raw.replace(/^[+\-−]/, ''));
