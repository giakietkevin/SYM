import { useCallback, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { haptic } from './feedback';
import type { Loc } from './types';

export interface DragState {
  from: Loc;
  label: string;
  x: number;
  y: number;
  over: Loc | null;
}

/**
 * Pointer-based drag between money places (the wallet card and jar cards).
 * Touch needs a short press so vertical scrolling still works; a mouse starts on the first few pixels.
 * Drop targets are any element with data-drop="<wallet | jarId>".
 */
export function useDrag(onDrop: (from: Loc, to: Loc) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const justDragged = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const press = useCallback((e: RPointerEvent, from: Loc, label: string) => {
    if (e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    let timer = 0;
    let over: Loc | null = null;

    const overAt = (x: number, y: number): Loc | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
      const id = el?.dataset.drop ?? null;
      return id && id !== from ? id : null;
    };

    const stop = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', block);
    };
    const begin = (x: number, y: number) => {
      active = true;
      haptic('pick');
      setDrag({ from, label, x, y, over: null });
    };
    const block = (ev: TouchEvent) => {
      if (active) ev.preventDefault();
    };
    const move = (ev: PointerEvent) => {
      if (!active) {
        const far = Math.hypot(ev.clientX - sx, ev.clientY - sy);
        if (touch && far > 10) return stop(); // the finger is scrolling
        if (!touch && far > 6) begin(ev.clientX, ev.clientY);
        return;
      }
      const next = overAt(ev.clientX, ev.clientY);
      if (next !== over) {
        over = next;
        if (next) haptic('tap');
      }
      setDrag({ from, label, x: ev.clientX, y: ev.clientY, over: next });
    };
    const up = () => {
      stop();
      if (!active) return;
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 60);
      setDrag(null);
      if (over) {
        haptic('drop');
        dropRef.current(from, over);
      }
    };
    const cancel = () => {
      stop();
      if (active) setDrag(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', block, { passive: false });
    if (touch) timer = window.setTimeout(() => begin(sx, sy), 260);
  }, []);

  /** Wrap click handlers so the click that ends a drag does not also open the card. */
  const guard = useCallback((fn: () => void) => () => {
    if (!justDragged.current) fn();
  }, []);

  return { drag, press, guard };
}
