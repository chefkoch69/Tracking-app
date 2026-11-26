import { useState } from 'react';
import { addDays, dayKey, startOfDay, entryDay } from '../core/model/dates';
import { daySlotStatus } from '../core/diary/schedule';
import type { Entry, Tracker } from '../core/model/types';

export type DayState = 'done' | 'partial' | 'missed' | 'pending' | 'none' | 'future';

/** Erfüllungsstatus eines Trackers an einem Tag. */
export function trackerDayState(tracker: Tracker, entries: Entry[], day: Date, now: Date): DayState {
  const d = startOfDay(day);
  if (d > now) return 'future';
  const slots = daySlotStatus(tracker, entries, d);
  if (!slots.length) {
    const k = dayKey(d);
    return entries.some((e) => e.trackerId === tracker.id && entryDay(e.timestamp) === k) ? 'done' : 'none';
  }
  const done = slots.filter((s) => s.done).length;
  if (done === slots.length) return 'done';
  if (done > 0) return 'partial';
  // Nichts erledigt: verpasst, sobald mindestens ein Erledigt-Fenster abgelaufen ist.
  return slots.some((s) => s.windowEnd <= now) ? 'missed' : 'pending';
}

/** Kombinierter Status über mehrere Tracker. */
export function combinedDayState(trackers: Tracker[], entries: Entry[], day: Date, now: Date): DayState {
  const states = trackers.map((t) => trackerDayState(t, entries, day, now)).filter((s) => s !== 'none');
  if (startOfDay(day) > now) return 'future';
  if (!states.length) return 'none';
  if (states.every((s) => s === 'done')) return 'done';
  if (states.some((s) => s === 'done' || s === 'partial')) return 'partial';
  if (states.some((s) => s === 'missed')) return 'missed';
  return 'pending';
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function WeekStrip({ state, now, onPick }: { state: (d: Date) => DayState; now: Date; onPick?: (key: string) => void }) {
  const today = startOfDay(now);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  return (
    <div className="week-strip">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        const s = state(d);
        const isToday = dayKey(d) === dayKey(today);
        return (
          <button
            key={i}
            type="button"
            className={`ws-day ${isToday ? 'today' : ''}`}
            disabled={!onPick || d > today}
            onClick={() => onPick?.(dayKey(d))}
            aria-label={d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          >
            <small>{WD[d.getDay()]}</small>
            <span className="ws-num">
              {d.getDate()}
              {(s === 'done' || s === 'partial' || s === 'missed') && <i className={`ws-badge ${s}`}>{s === 'missed' ? '!' : '✓'}</i>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MonthRings({ state, now, title, selected, onSelect }: { state: (d: Date) => DayState; now: Date; title?: string; selected?: string; onSelect?: (key: string) => void }) {
  const [offset, setOffset] = useState(0);
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: days }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1));
  const states = cells.map((d) => state(d));
  const relevant = states.filter((s) => s === 'done' || s === 'partial' || s === 'missed');
  const rate = relevant.length ? Math.round(((states.filter((s) => s === 'done').length + 0.5 * states.filter((s) => s === 'partial').length) / relevant.length) * 100) : null;
  return (
    <div className="month-rings">
      <div className="mr-head">
        <button className="btn ghost small" onClick={() => setOffset(offset - 1)} aria-label="Vorheriger Monat">‹</button>
        <strong>{title ?? first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
        <button className="btn ghost small" disabled={offset >= 0} onClick={() => setOffset(offset + 1)} aria-label="Nächster Monat">›</button>
        {rate !== null && <span className="pill good">{rate} %</span>}
      </div>
      <div className="mr-grid">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
          <small key={w} className="mr-wd">{w}</small>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
        {cells.map((d, i) => (
          <button
            key={i}
            type="button"
            disabled={!onSelect || states[i] === 'future'}
            className={`ring ${states[i]} ${dayKey(d) === dayKey(now) ? 'today' : ''} ${selected === dayKey(d) ? 'selected' : ''}`}
            onClick={() => onSelect?.(dayKey(d))}
          >
            {d.getDate()}
          </button>
        ))}
      </div>
      <div className="mr-legend">
        <span><i className="dot done" />erledigt</span>
        <span><i className="dot partial" />teilweise</span>
        <span><i className="dot missed" />verpasst</span>
      </div>
    </div>
  );
}
