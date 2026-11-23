import { useMemo, useState } from 'react';
import { symptomTrend } from '../core/analytics';
import { fmtLevel, scaleLevels } from '../core/fieldTypes';
import type { Tracker } from '../core/types';
import { useStore } from '../state/store';
import { MultiLineChart, SERIES_COLORS } from './charts/Charts';

/**
 * „Beschwerden im Verlauf“: mehrere Symptome als Linien (Tageshöchstwerte),
 * ein-/ausblendbar, mit Vergleich zur Woche davor.
 */
export function SymptomTrendCard({ tracker, days: initialDays = 14, title = 'Beschwerden im Verlauf', compact = false, end }: { tracker: Tracker; days?: number; title?: string; compact?: boolean; end?: Date }) {
  const { data } = useStore();
  const [days, setDays] = useState(initialDays);
  const endKey = end?.getTime();
  const trend = useMemo(() => symptomTrend(tracker, data.entries, days, endKey ? new Date(endKey) : new Date()), [tracker, data.entries, days, endKey]);
  const [chosen, setChosen] = useState<string[] | null>(null);
  if (!trend.series.length) return null;
  const selected = chosen ?? trend.series.slice(0, 3).map((s) => s.field.id);
  const color = (id: string) => SERIES_COLORS[trend.series.findIndex((s) => s.field.id === id) % SERIES_COLORS.length];
  const shown = trend.series.filter((s) => selected.includes(s.field.id));
  const max = Math.max(1, ...shown.map((s) => s.field.config.max ?? 3));
  const cmp = trend.compare(selected);
  const diff = cmp ? cmp.recent - cmp.previous : 0;
  const levels = shown[0] ? scaleLevels(shown[0].field.config) : [];
  const toggle = (id: string) => setChosen(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <section className="card trend-card">
      <div className="section-head">
        <h2>{title}</h2>
        {cmp && Math.abs(diff) >= 0.15 && (
          <span className={`pill ${diff < 0 ? 'good' : 'bad-pill'}`} title={`Ø Tageshöchstwert ${fmtLevel(Math.round(cmp.previous * 10) / 10)} → ${fmtLevel(Math.round(cmp.recent * 10) / 10)}`}>
            {diff < 0 ? '▼ besser' : '▲ schlechter'} als die Woche davor
          </span>
        )}
        {cmp && Math.abs(diff) < 0.15 && <span className="pill">≈ wie die Woche davor</span>}
      </div>
      {!compact && <p className="muted small">Tageshöchstwerte · {levels.map((l) => `${fmtLevel(l.value)} ${l.label}`).filter(Boolean).join(' · ')}</p>}
      <MultiLineChart
        days={trend.days}
        max={max}
        series={shown.map((s) => ({ key: s.field.id, label: s.field.label, color: color(s.field.id), values: s.values }))}
      />
      <div className="legend-chips">
        {trend.series.map((s) => {
          const on = selected.includes(s.field.id);
          return (
            <button key={s.field.id} type="button" className={`legend-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(s.field.id)}>
              <i style={{ background: on ? color(s.field.id) : 'transparent', borderColor: color(s.field.id) }} />
              {s.field.label}
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="seg trend-range">
          {[7, 14, 30].map((d) => (
            <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} Tage</button>
          ))}
        </div>
      )}
    </section>
  );
}
