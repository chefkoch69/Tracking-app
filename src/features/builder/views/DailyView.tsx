import { useState } from 'react';
import { aggregate, entriesOf, numericFields } from '../../../core/analysis/analytics';
import { addDays, dayKey, formatClock, formatDay, parseDayKey } from '../../../core/model/dates';
import { daySlotStatus } from '../../../core/diary/schedule';
import { AGGREGATION_LABELS, aggregationOf, fieldSpec } from '../../../core/fields/fieldTypes';
import type { Tracker } from '../../../core/model/types';
import { useStore } from '../../../state/store';
import { EntryCard } from '../../../components/entryViews';

export function DailyView({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
  const [day, setDay] = useState(dayKey(new Date()));
  const date = parseDayKey(day);
  const entries = entriesOf(tracker, data.entries).filter((e) => dayKey(new Date(e.timestamp)) === day);
  const slots = daySlotStatus(tracker, data.entries, date);
  const shift = (d: number) => setDay(dayKey(addDays(date, d)));

  return (
    <>
      <div className="card">
        <div className="day-nav">
          <button className="btn ghost" onClick={() => shift(-1)} aria-label="Vorheriger Tag">‹</button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button className="btn ghost" onClick={() => shift(1)} aria-label="Nächster Tag">›</button>
        </div>
        <h3>{formatDay(date)}</h3>
        {slots.length > 0 && (
          <div className="chips">
            {slots.map((s) => (
              <span key={s.slot.toISOString()} className={`chip ${s.done ? 'active' : ''}`}>
                {s.done ? '✓' : '○'} {formatClock(s.slot)}
              </span>
            ))}
          </div>
        )}
        {entries.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Angabe</th>
                <th className="num">Tageswert</th>
              </tr>
            </thead>
            <tbody>
              {numericFields(tracker).map((f) => {
                const vals = entries.flatMap((e) => {
                  const v = fieldSpec(f).toNumber(f, e.values[f.id] ?? null);
                  return v === null ? [] : [v];
                });
                if (!vals.length) return null;
                const agg = aggregationOf(f);
                return (
                  <tr key={f.id}>
                    <td>
                      {f.label} <small className="muted">({AGGREGATION_LABELS[agg]})</small>
                    </td>
                    <td className="num">
                      {aggregate(vals, agg).toLocaleString('de-DE', { maximumFractionDigits: 2 })} {f.config.unit ?? ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {entries.length ? entries.map((e) => <EntryCard key={e.id} tracker={tracker} entry={e} />) : <p className="muted">Keine Einträge an diesem Tag.</p>}
    </>
  );
}
