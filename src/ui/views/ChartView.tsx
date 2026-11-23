import { useState } from 'react';
import { bucketize, entriesOf, numericFields, series, type Grouping } from '../../core/analytics';
import { addDays, formatDateTime, parseDayKey, startOfDay } from '../../core/dates';
import { AGGREGATION_LABELS, aggregationOf } from '../../core/fieldTypes';
import type { Aggregation, Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { BarChart, LineChart } from '../charts/Charts';
import { FieldSelect, NeedsNumeric, NoData, useFieldChoice } from './shared';

const RANGES = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '3 Monate' },
  { days: 365, label: '1 Jahr' },
  { days: 0, label: 'Alles' },
];

const GROUPINGS: { g: Grouping; label: string }[] = [
  { g: 'entry', label: 'Einzelwerte' },
  { g: 'day', label: 'pro Tag' },
  { g: 'week', label: 'pro Woche' },
  { g: 'month', label: 'pro Monat' },
];

function bucketLabel(key: string, g: Grouping): { label: string; short: string } {
  if (g === 'day') {
    const d = parseDayKey(key);
    return { label: d.toLocaleDateString('de-DE'), short: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) };
  }
  if (g === 'week') return { label: `KW ${key.split('-W')[1]} ${key.slice(0, 4)}`, short: `KW${key.split('-W')[1]}` };
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return { label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), short: d.toLocaleDateString('de-DE', { month: 'short' }) };
}

export function ChartView({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
  const fields = numericFields(tracker);
  const [field, setField] = useFieldChoice(fields);
  const [range, setRange] = useState(30);
  const [grouping, setGrouping] = useState<Grouping>('day');
  const [aggOverride, setAgg] = useState<Aggregation | null>(null);

  if (!field) return <NeedsNumeric />;
  const entries = entriesOf(tracker, data.entries);
  if (!entries.length) return <NoData tracker={tracker} />;

  const from = range ? addDays(startOfDay(new Date()), -(range - 1)).getTime() : -Infinity;
  const pts = series(field, entries).filter((p) => p.t >= from);
  const agg = aggOverride ?? aggregationOf(field);
  const unit = agg === 'count' ? '' : field.config.unit;

  return (
    <div className="card">
      <div className="controls">
        <FieldSelect fields={fields} value={field.id} onChange={(id) => { setField(id); setAgg(null); }} />
        <label className="cfg-row">
          <span>Zeitraum</span>
          <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>{r.label}</option>
            ))}
          </select>
        </label>
        <label className="cfg-row">
          <span>Darstellung</span>
          <select value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)}>
            {GROUPINGS.map((g) => (
              <option key={g.g} value={g.g}>{g.label}</option>
            ))}
          </select>
        </label>
        {grouping !== 'entry' && (
          <label className="cfg-row">
            <span>Wert</span>
            <select value={agg} onChange={(e) => setAgg(e.target.value as Aggregation)}>
              {(Object.keys(AGGREGATION_LABELS) as Aggregation[]).map((a) => (
                <option key={a} value={a}>{AGGREGATION_LABELS[a]}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {grouping === 'entry' ? (
        <LineChart
          points={pts.map((p) => ({ x: p.t, y: p.v, label: formatDateTime(new Date(p.t)) }))}
          color={tracker.color}
          unit={field.config.unit}
          xLabel={(x) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
        />
      ) : (
        <BarChart
          bars={bucketize(pts, grouping, agg).map((b) => ({ ...bucketLabel(b.key, grouping), v: b.v }))}
          color={tracker.color}
          unit={unit}
        />
      )}
      <p className="muted small">
        {pts.length} Werte · {grouping === 'entry' ? 'jeder Eintrag einzeln' : `${AGGREGATION_LABELS[agg]} ${GROUPINGS.find((g) => g.g === grouping)?.label}`}
      </p>
    </div>
  );
}
