import { bucketize, categoricalFields, currentStreak, entriesOf, fieldStats, frequencies, longestStreak, numericFields, series } from '../../core/analytics';
import { dayKey, formatDateTime, formatDay, parseDayKey } from '../../core/dates';
import { AGGREGATION_LABELS, aggregationOf } from '../../core/fieldTypes';
import type { FieldDef, Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { FrequencyBars } from '../charts/Charts';
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

  return (
    <>
      <div className="kpis">
        <Kpi label="Einträge" value={String(entries.length)} />
        <Kpi label="Tage mit Einträgen" value={String(days)} />
        <Kpi label="Aktuelle Serie" value={`${currentStreak(entries)} Tage`} />
        <Kpi label="Längste Serie" value={`${longestStreak(entries)} Tage`} />
        <Kpi label="Erster Eintrag" value={first.toLocaleDateString('de-DE')} />
      </div>

      {nums.map((f) => (
        <NumericStats key={f.id} field={f} tracker={tracker} />
      ))}

      {cats.map((f) => (
        <section key={f.id} className="card">
          <h3>{f.label} – Häufigkeit</h3>
          <FrequencyBars items={frequencies(f, entries)} color={tracker.color} />
        </section>
      ))}
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
