import { useState } from 'react';
import { dailyValues, entriesOf, entriesPerDay, numericFields } from '../../core/analytics';
import { dayKey, formatDay, parseDayKey } from '../../core/dates';
import { AGGREGATION_LABELS, aggregationOf } from '../../core/fieldTypes';
import type { Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { MonthRings, trackerDayState } from '../Adherence';
import { CalendarHeatmap } from '../charts/Charts';
import { useNow } from '../reminders';
import { EntryCard, NoData } from './shared';

export function CalendarView({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
  const now = useNow();
  const entries = entriesOf(tracker, data.entries);
  const fields = numericFields(tracker);
  const [metric, setMetric] = useState<string>('__count');
  const [selected, setSelected] = useState<string>(dayKey(new Date()));
  if (!entries.length) return <NoData tracker={tracker} />;

  const field = fields.find((f) => f.id === metric);
  const values = field ? dailyValues(field, entries) : entriesPerDay(entries);
  const fmt = (v: number) =>
    field ? `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })}${field.config.unit ? ' ' + field.config.unit : ''}` : `${v} Einträge`;
  const dayEntries = entries.filter((e) => dayKey(new Date(e.timestamp)) === selected);

  return (
    <>
      <div className="two-col">
        <div className="card">
          <h3>{tracker.schedule.mode === 'manual' ? 'Tage mit Einträgen' : 'Erfüllung'}</h3>
          <MonthRings now={now} state={(d) => trackerDayState(tracker, data.entries, d, now)} />
        </div>
        <div className="card">
          <h3>Verteilung</h3>
          <div className="controls">
            <label className="cfg-row">
              <span>Einfärben nach</span>
              <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                <option value="__count">Anzahl Einträge</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ({AGGREGATION_LABELS[aggregationOf(f)]})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CalendarHeatmap values={values} weeks={18} color={tracker.color} selected={selected} onSelect={setSelected} format={fmt} />
          <p className="muted small">{values.size} Tage mit Einträgen · Tag antippen für Details</p>
        </div>
      </div>
      <h3 className="day-head">{formatDay(parseDayKey(selected))}</h3>
      <div className="timeline-rail">
        {dayEntries.length ? dayEntries.map((e) => <EntryCard key={e.id} tracker={tracker} entry={e} />) : <p className="muted">Keine Einträge an diesem Tag.</p>}
      </div>
    </>
  );
}
