import type { DayRhythm, EventKind } from '../core/feedback';
import { formatTime } from '../core/dates';
import { severityColor } from './fieldInputs';

const EVENT_ICON: Record<EventKind, string> = { meal: '🍽', drink: '☕', med: '💊', rest: '🛏', wake: '☀', move: '🚶', other: '•' };

/**
 * Der Tag auf einen Blick: oben Ereignisse (Essen, Medikamente, Schlaf …),
 * darunter je Beschwerde der Verlauf über den Tag. Höher und röter = stärker.
 */
export function DayRhythmChart({ rhythm, onPick }: { rhythm: DayRhythm; onPick?: (entryId: string) => void }) {
  const { rows, events, from, to } = rhythm;
  if (!rows.length && !events.length) return null;
  const pos = (m: number) => ((m - from) / (to - from)) * 100;
  const ticks: number[] = [];
  for (let h = Math.ceil(from / 180) * 3; h * 60 <= to; h += 3) ticks.push(h);
  return (
    <div className="rhythm" role="group" aria-label="Tagesverlauf">
      {events.length > 0 && (
        <div className="rh-row">
          <span className="rh-label">Ereignisse</span>
          <div className="rh-track rh-events">
            {events.map((e, i) => (
              <button
                key={`${e.entryId}-${i}`}
                type="button"
                className="rh-event"
                style={{ left: `${pos(e.minutes)}%` }}
                title={`${formatTime(e.minutes)} ${e.label}`}
                aria-label={`${formatTime(e.minutes)} ${e.label}`}
                onClick={() => onPick?.(e.entryId)}
              >
                {EVENT_ICON[e.kind]}
              </button>
            ))}
          </div>
        </div>
      )}
      {rows.map((r) => {
        // Senkrecht: 0 (unten) … stärkste Stufe (oben), mit etwas Rand.
        const y = (level: number) => 88 - level * 76;
        return (
          <div key={r.field.id} className="rh-row">
            <span className="rh-label">{r.field.label}</span>
            <div className="rh-track">
              {r.points.length > 1 && (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  <polyline points={r.points.map((p) => `${pos(p.minutes)},${y(p.level)}`).join(' ')} />
                </svg>
              )}
              {r.points.map((p, i) => (
                <button
                  key={`${p.entryId}-${i}`}
                  type="button"
                  className="rh-dot"
                  style={{ left: `${pos(p.minutes)}%`, top: `${y(p.level)}%`, background: severityColor(p.level) }}
                  title={`${formatTime(p.minutes)} ${r.field.label} ${p.text}`}
                  aria-label={`${formatTime(p.minutes)} ${r.field.label} ${p.text}`}
                  onClick={() => onPick?.(p.entryId)}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="rh-row rh-axis" aria-hidden>
        <span className="rh-label" />
        <div className="rh-track">
          {ticks.map((h) => (
            <span key={h} style={{ left: `${pos(h * 60)}%` }}>{h}:00</span>
          ))}
        </div>
      </div>
    </div>
  );
}
