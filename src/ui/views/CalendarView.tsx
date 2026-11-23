import { useState } from 'react';
import { dailyValues, entriesOf, entriesPerDay, numericFields } from '../../core/analytics';
import { dayKey, formatDay, parseDayKey } from '../../core/dates';
import { AGGREGATION_LABELS, aggregationOf } from '../../core/fieldTypes';
import { adherence } from '../../core/schedule';
import type { Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { CalendarHeatmap } from '../charts/Charts';
import { EntryCard, NoData } from './shared';

export function CalendarView({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
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

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const adh = tracker.schedule.mode !== 'manual' ? adherence(tracker, data.entries, from, now) : null;

  return (
    <>
      <div className="card">
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
        <CalendarHeatmap values={values} color={tracker.color} selected={selected} onSelect={setSelected} format={fmt} />
        <p className="muted small">
          {values.size} Tage mit Einträgen
          {adh?.rate != null && ` · ${Math.round(adh.rate * 100)} % der geplanten Erinnerungen in den letzten 30 Tagen erledigt (${adh.done}/${adh.total})`}
        </p>
      </div>
      <h3 className="day-head">{formatDay(parseDayKey(selected))}</h3>
      {dayEntries.length ? dayEntries.map((e) => <EntryCard key={e.id} tracker={tracker} entry={e} />) : <p className="muted">Keine Einträge an diesem Tag.</p>}
    </>
  );
}
