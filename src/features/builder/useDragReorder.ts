import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Sortieren per Ziehen – mit Maus und Finger (Pointer Events), plus
 * Tastatur (Pfeil hoch/runter auf dem Griff). Für senkrechte Listen.
 */
export function useDragReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const latest = useRef(items);
  latest.current = items;
  const [drag, setDrag] = useState<{ from: number; over: number; dy: number; h: number } | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= latest.current.length || to === from) return;
    const next = latest.current.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  const onPointerDown = (i: number) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rects = refs.current.map((el) => el?.getBoundingClientRect() ?? null);
    const own = rects[i];
    if (!own) return;
    const gap = rects[i + 1] ? rects[i + 1]!.top - own.bottom : rects[i - 1] ? own.top - rects[i - 1]!.bottom : 8;
    const h = own.height + Math.max(0, gap);
    const startY = e.clientY;
    let over = i;
    setDrag({ from: i, over: i, dy: 0, h });

    const onMove = (ev: globalThis.PointerEvent) => {
      const dy = ev.clientY - startY;
      const center = own.top + own.height / 2 + dy;
      // Zielindex = Anzahl der anderen Elemente, deren Mitte oberhalb liegt.
      over = rects.reduce((n, r, j) => (j !== i && r && r.top + r.height / 2 < center ? n + 1 : n), 0);
      setDrag({ from: i, over, dy, h });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      move(i, over);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /** Props für das Listenelement (Position, Verschiebung während des Ziehens). */
  const item = (i: number): { ref: (el: HTMLElement | null) => void; style?: CSSProperties; 'data-dragging'?: boolean } => {
    const ref = (el: HTMLElement | null) => {
      refs.current[i] = el;
    };
    if (!drag) return { ref };
    if (i === drag.from) {
      return { ref, 'data-dragging': true, style: { transform: `translateY(${drag.dy}px)`, zIndex: 5, position: 'relative' } };
    }
    let shift = 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) shift = -drag.h;
    if (drag.from > drag.over && i >= drag.over && i < drag.from) shift = drag.h;
    return { ref, style: { transform: `translateY(${shift}px)`, transition: 'transform 0.15s ease' } };
  };

  /** Props für den Griff. */
  const handle = (i: number, label: string) => ({
    onPointerDown: onPointerDown(i),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(i, i - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(i, i + 1);
      }
    },
    'aria-label': `${label} verschieben (ziehen oder Pfeiltasten)`,
    className: 'drag-handle',
    type: 'button' as const,
    style: { touchAction: 'none' } as CSSProperties,
  });

  return { item, handle, dragging: drag !== null };
}
