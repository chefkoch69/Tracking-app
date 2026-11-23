import { useState } from 'react';
import { averageGapMinutes, bucketize, categoricalFields, consistencySeries, currentStreak, entriesOf, fieldStats, frequencies, longestStreak, numericFields, series, timeDistribution } from '../../core/analytics';
import { formatDuration, metricLabel } from '../../core/fieldTypes';
import { BarChart, LineChart } from '../charts/Charts';
import { dayKey, formatDateTime, formatDay, parseDayKey } from '../../core/dates';
import { AGGREGATION_LABELS, aggregationOf } from '../../core/fieldTypes';
import type { FieldDef, Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { BODY_MAPS } from '../../core/bodyMaps';
import { factorInsights, trendInsights } from '../../core/insights';
import { BodyMapSvg } from '../BodyMap';
import { FrequencyBars } from '../charts/Charts';
import { ConsistencyRing } from '../ConsistencyRing';
import { InsightList } from '../Insights';
import { NoData } from './shared';

const n = (v: number | null | undefined, unit?: string) =>
  v === null || v === undefined ? '–' : `${v.toLocaleString('de-DE', { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}`;

export function StatsView({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
  const entries = entriesOf(tracker, data.entries);
  if (!entries.length) return <NoData tracker={tracker} />;
  const nums = numericFields(tracker);
  const cats = categoricalFields(tracker).filter((f) => f.type !== 'checkbox');
  const first = new Date(entries[0].timestamp);
  const days = new Set(entries.map((e) => dayKey(new Date(e.timestamp)))).size;
  const consistency = consistencySeries(tracker, data.entries);
  const score = consistency.length ? consistency[consistency.length - 1].v : null;
  const gap = averageGapMinutes(entries);

  return (
    <>
      <div className="kpis">
        <Kpi label="Einträge" value={String(entries.length)} />
        <Kpi label="Tage mit Einträgen" value={String(days)} />
        <Kpi label="Aktuelle Serie" value={`${currentStreak(entries)} Tage`} />
        <Kpi label="Längste Serie" value={`${longestStreak(entries)} Tage`} />
        <Kpi label="Erster Eintrag" value={first.toLocaleDateString('de-DE')} />
        {gap !== null && <Kpi label="Ø Abstand zwischen Einträgen" value={gap >= 1440 ? `${(gap / 1440).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tage` : formatDuration(gap)} />}
      </div>

      {(() => {
        const ins = [...trendInsights(tracker, data.entries, new Date()), ...factorInsights(tracker, data.entries)].slice(0, 6);
        return ins.length ? (
          <section className="card">
            <h3>Was fällt auf?</h3>
            <InsightList insights={ins} />
          </section>
        ) : null;
      })()}

      {score !== null && (
        <section className="card">
          <div className="consistency-head">
            <ConsistencyRing value={score} color={tracker.color} size={64} />
            <div>
              <h3>Regelmäßigkeit</h3>
              <p className="muted small">
                {tracker.schedule.mode === 'manual'
                  ? 'Anteil der Tage mit Eintrag'
                  : 'Anteil der erledigten Erinnerungen'}
                , gleitend gewichtet: Jeder erledigte Tag baut den Wert auf, eine einzelne Lücke senkt ihn nur leicht.
              </p>
            </div>
          </div>
          <LineChart
            points={consistency.slice(-90).map((b) => ({ x: new Date(`${b.key}T12:00:00`).getTime(), y: Math.round(b.v * 100), label: new Date(`${b.key}T12:00:00`).toLocaleDateString('de-DE') }))}
            color={tracker.color}
            unit="%"
            xLabel={(x) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
          />
        </section>
      )}

      <TimeOfDay tracker={tracker} />

      {nums.map((f) => (
        <NumericStats key={f.id} field={f} tracker={tracker} />
      ))}


      {cats.map((f) => {
        const freq = frequencies(f, entries);
        if (!freq.length) return null;
        if (f.type === 'bodymap') {
          const kind = f.config.bodyMap ?? 'abdomen';
          const max = Math.max(1, ...freq.map((x) => x.count));
          const intensity = Object.fromEntries(
            BODY_MAPS[kind].regions.map((r) => [r.id, (freq.find((x) => x.label === r.label)?.count ?? 0) / max]),
          );
          return (
            <section key={f.id} className="card">
              <h3>{f.label} – wo am häufigsten?</h3>
              <div className="map-stats">
                <BodyMapSvg kind={kind} intensity={intensity} color={tracker.color} />
                <FrequencyBars items={freq} color={tracker.color} />
              </div>
            </section>
          );
        }
        return (
          <section key={f.id} className="card">
            <h3>{f.label} – Häufigkeit</h3>
            <FrequencyBars items={freq} color={tracker.color} />
          </section>
        );
      })}
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <small>{label}</small>
      <b>{value}</b>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

function NumericStats({ field, tracker }: { field: FieldDef; tracker: Tracker }) {
  const { data } = useStore();
  const entries = entriesOf(tracker, data.entries);
  const s = fieldStats(field, entries);
  if (!s.count) return null;
  const u = field.config.unit;
  const agg = aggregationOf(field);
  const isBool = field.type === 'checkbox';
  const weeks = bucketize(series(field, entries), 'week', agg).slice(-8).reverse();
  const months = bucketize(series(field, entries), 'month', agg).slice(-6).reverse();
  const trendDelta = s.trend.recent !== null && s.trend.previous !== null ? s.trend.recent - s.trend.previous : null;

  return (
    <section className="card">
      <h3>{field.label}</h3>
      <div className="kpis">
        {isBool ? (
          <>
            <Kpi label="Ja" value={`${s.sum}×`} sub={`${Math.round((s.sum / s.count) * 100)} %`} />
            <Kpi label="Nein" value={`${s.count - s.sum}×`} />
          </>
        ) : (
          <>
            <Kpi label="Werte" value={String(s.count)} />
            {agg === 'sum' && <Kpi label="Gesamt" value={n(s.sum, u)} />}
            <Kpi label="Ø pro Eintrag" value={n(s.avg, u)} />
            <Kpi label="Min / Max" value={`${n(s.min)} / ${n(s.max, u)}`} />
            <Kpi label="Letzter Wert" value={n(s.last, u)} />
            {s.bestEntry && <Kpi label="🏆 Bester Einzelwert" value={n(s.bestEntry.v, u)} sub={formatDateTime(new Date(s.bestEntry.t))} />}
            {s.bestDay && agg === 'sum' && <Kpi label="🏆 Bester Tag" value={n(s.bestDay.v, u)} sub={formatDay(parseDayKey(s.bestDay.key))} />}
          </>
        )}
        <Kpi
          label={`Ø Tageswert 7 Tage (${AGGREGATION_LABELS[agg]})`}
          value={n(s.trend.recent, isBool ? '' : u)}
          sub={trendDelta !== null ? `${trendDelta >= 0 ? '▲' : '▼'} ${n(Math.abs(trendDelta))} ggü. Vorwoche` : undefined}
        />
      </div>
      <div className="two-col">
        <div>
          <h4>Pro Woche ({AGGREGATION_LABELS[agg]})</h4>
          <table className="table">
            <tbody>
              {weeks.map((w) => (
                <tr key={w.key}>
                  <td>KW {w.key.split('-W')[1]} / {w.key.slice(0, 4)}</td>
                  <td className="num">{n(w.v, isBool ? '' : u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>Pro Monat ({AGGREGATION_LABELS[agg]})</h4>
          <table className="table">
            <tbody>
              {months.map((m) => {
                const [y, mo] = m.key.split('-').map(Number);
                return (
                  <tr key={m.key}>
                    <td>{new Date(y, mo - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</td>
                    <td className="num">{n(m.v, isBool ? '' : u)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** "Wann tritt es auf?" – Verteilung nach Uhrzeit und Wochentag. */
function TimeOfDay({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
  const entries = entriesOf(tracker, data.entries);
  const weights = numericFields(tracker).filter((f) => f.type !== 'checkbox');
  const [w, setW] = useState('__count');
  const field = weights.find((f) => f.id === w);
  const dist = timeDistribution(entries, field);
  const peakHour = dist.byHour.indexOf(Math.max(...dist.byHour));
  const peakDay = dist.byWeekday.indexOf(Math.max(...dist.byWeekday));
  if (entries.length < 3) return null;
  const unit = field ? 'Summe' : 'Einträge';
  return (
    <section className="card">
      <div className="section-head">
        <h3>Wann tritt es auf?</h3>
        <label className="cfg-row inline-select">
          <select value={w} onChange={(e) => setW(e.target.value)}>
            <option value="__count">nach Anzahl Einträge</option>
            {weights.map((f) => (
              <option key={f.id} value={f.id}>gewichtet nach {metricLabel(f)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        Am häufigsten um <b>{peakHour}–{peakHour + 1} Uhr</b> und am <b>{['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][peakDay]}</b>
        {field ? ` (gewichtet nach ${metricLabel(field)})` : ''}. Maßgeblich ist der Zeitpunkt des Eintrags.
      </p>
      <div className="two-col">
        <div>
          <h4>Tageszeit</h4>
          <BarChart bars={dist.byHour.map((v, h) => ({ label: `${h}–${h + 1} Uhr`, short: h % 3 === 0 ? `${h}h` : '', v }))} color={tracker.color} unit={unit} />
        </div>
        <div>
          <h4>Wochentag</h4>
          <BarChart bars={dist.byWeekday.map((v, i) => ({ label: WEEKDAYS[i], short: WEEKDAYS[i], v }))} color={tracker.color} unit={unit} />
        </div>
      </div>
    </section>
  );
}
