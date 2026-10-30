import { useEffect } from 'react';
import { haptic } from '../lib/feedback';
import { evalExpr, fmt, hasOperator, prettyExpr } from '../lib/money';
import { IconBackspace } from './icons';

const MAX_LEN = 16;

/** Applies one key to the expression, refusing anything that would not parse. */
export function applyKey(expr: string, key: string): string {
  if (key === 'back') return expr.slice(0, -1);
  if (key === 'clear') return '';
  if (expr.length >= MAX_LEN) return expr;
  const last = expr.slice(-1);
  const lastIsDigit = /\d/.test(last);
  const lastIsOp = last === '+' || last === '-';

  if (key === '+' || key === '-') {
    if (!expr) return expr;
    return lastIsOp ? expr.slice(0, -1) + key : expr + key;
  }
  if (key === 'k') return lastIsDigit ? expr + 'k' : expr;
  if (key === '000') return lastIsDigit ? expr + '000' : expr;
  // a digit straight after "k" would read as 35k5, which means nothing
  if (/^\d$/.test(key)) return last === 'k' ? expr : expr === '0' ? key : expr + key;
  return expr;
}

const KEYS = ['7', '8', '9', 'back', '4', '5', '6', '+', '1', '2', '3', '-', 'k', '0', '000', 'clear'];

const LABEL: Record<string, string> = { '-': '−', clear: 'Xóa', k: 'k', '000': '000' };

export function AmountPad({
  expr,
  onChange,
  shortcuts = [50_000, 100_000, 200_000, 500_000],
  extraShortcut,
}: {
  expr: string;
  onChange: (e: string) => void;
  shortcuts?: number[];
  extraShortcut?: { label: string; value: number };
}) {
  const value = evalExpr(expr) ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (/^\d$/.test(k) || k === 'k' || k === '+') onChange(applyKey(expr, k));
      else if (k === '-') onChange(applyKey(expr, '-'));
      else if (k === 'backspace') onChange(applyKey(expr, 'back'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expr, onChange]);

  return (
    <div className="amount">
      <div className="amount-show" aria-live="polite">
        <div className="amount-expr num">{hasOperator(expr) ? prettyExpr(expr) : ' '}</div>
        <div className={`amount-value num ${value === 0 ? 'zero' : ''}`}>
          {fmt(value)}
          <span className="cur">₫</span>
        </div>
      </div>

      {(shortcuts.length > 0 || extraShortcut) && (
      <div className="chips" role="group" aria-label="Số tiền nhanh">
        {shortcuts.map((v) => (
          <button key={v} type="button" className="chip" onClick={() => { haptic('tap'); onChange(String(v)); }}>
            {v >= 1_000_000 ? `${v / 1_000_000}tr` : `${v / 1000}k`}
          </button>
        ))}
        {extraShortcut && (
          <button type="button" className="chip" onClick={() => { haptic('tap'); onChange(String(Math.max(0, extraShortcut.value))); }}>
            {extraShortcut.label}
          </button>
        )}
      </div>
      )}

      <div className="keypad" role="group" aria-label="Bàn phím tính toán">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={`key ${/^[+-]$/.test(k) ? 'op' : ''} ${k === 'clear' || k === 'back' ? 'fn' : ''}`}
            aria-label={k === 'back' ? 'Xóa một ký tự' : k === '-' ? 'Trừ' : k === '+' ? 'Cộng' : undefined}
            onClick={() => {
              haptic('tap');
              onChange(applyKey(expr, k));
            }}
          >
            {k === 'back' ? <IconBackspace /> : LABEL[k] ?? k}
          </button>
        ))}
      </div>
    </div>
  );
}
