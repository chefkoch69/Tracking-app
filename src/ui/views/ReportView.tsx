import { useState } from 'react';
import { CAN_PRINT } from '../env';
import { entriesOf, frequencies } from '../../core/analytics';
import { BODY_MAPS } from '../../core/bodyMaps';
import { addDays, dayKey, formatClock, parseDayKey, startOfDay } from '../../core/dates';
import { formatShort, isEmptyValue } from '../../core/fieldTypes';
import type { Entry, FieldDef, Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { BodyMapSvg } from '../BodyMap';
import { NoData } from './shared';

const COLS = 7;

/**
 * Druckbarer Bericht – aufgebaut wie ein Papiertagebuch: Felder als Zeilen,
 * Einträge als Spalten, darunter Legenden (Skalen, Lokalisationsschema).
 */
export function ReportView({ tracker }: { tracker: Tracker }) {
  const { data, dispatch } = useStore();
  const all = entriesOf(tracker, data.entries);
  const today = dayKey(new Date());
  const [from, setFrom] = useState(() => dayKey(addDays(startOfDay(new Date()), -13)));
  const [to, setTo] = useState(today);
  if (!all.length) return <NoData tracker={tracker} />;

  const entries = all.filter((e) => {
    const k = dayKey(new Date(e.timestamp));
    return k >= from && k <= to;
  });
  const rows = tracker.fields.filter((f) => !(f.type === 'text' && f.config.multiline));
  const notes = tracker.fields.filter((f) => f.type === 'text' && f.config.multiline);
  const chunks: Entry[][] = [];
  for (let i = 0; i < entries.length; i += COLS) chunks.push(entries.slice(i, i + COLS));
  const scales = tracker.fields.filter((f) => f.type === 'scale' && f.config.scaleLabels?.some(Boolean));
  const legendKeys = new Map<string, FieldDef>();
  for (const f of scales) {
    const key = `${f.config.min}|${f.config.scaleLabels?.join('|')}`;
    if (!legendKeys.has(key)) legendKeys.set(key, f);
  }
  const maps = tracker.fields.filter((f) => f.type === 'bodymap');
  const preset = (days: number) => {
    setFrom(dayKey(addDays(startOfDay(new Date()), -(days - 1))));
    setTo(today);
  };

  return (
    <div className="report-wrap">
      <div className="card no-print report-controls">
        <div className="controls">
          <label className="cfg-row">
            <span>Von</span>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </label>
          <label className="cfg-row">
            <span>Bis</span>
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>
          <label className="cfg-row">
            <span>Name (für den Bericht)</span>
            <input value={data.profile?.name ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { name: e.target.value } })} />
          </label>
          <label className="cfg-row">
            <span>Geboren</span>
            <input type="date" value={data.profile?.birthdate ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { birthdate: e.target.value } })} />
          </label>
        </div>
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <span className="chips">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} className="chip small" onClick={() => preset(d)}>{d} Tage</button>
            ))}
          </span>
          {CAN_PRINT ? (
            <button className="btn primary" onClick={() => window.print()}>🖨 Drucken / als PDF speichern</button>
          ) : (
            <span className="muted small">Drucken ist in dieser Vorschau nicht möglich – in der installierten App gibt es „Drucken / als PDF“.</span>
          )}
        </div>
      </div>

      <article className="report card">
        <header className="report-head">
          <h2>{tracker.name.replace(/\s*\(Demo\)$/, '')}</h2>
          <div className="report-meta">
            <span>Name: <b>{data.profile?.name || '________________'}</b></span>
            <span>geboren: <b>{data.profile?.birthdate ? parseDayKey(data.profile.birthdate).toLocaleDateString('de-DE') : '__________'}</b></span>
            <span>Zeitraum: <b>{parseDayKey(from).toLocaleDateString('de-DE')} – {parseDayKey(to).toLocaleDateString('de-DE')}</b></span>
            <span>{entries.length} Einträge</span>
          </div>
        </header>

        {!entries.length && <p className="muted">Keine Einträge im gewählten Zeitraum.</p>}

        {chunks.map((chunk, ci) => (
          <div key={ci} className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  {chunk.map((e) => (
                    <th key={e.id}>
                      {new Date(e.timestamp).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      <small>{formatClock(new Date(e.timestamp))}</small>
                    </th>
                  ))}
                  {Array.from({ length: COLS - chunk.length }, (_, i) => <th key={`pad${i}`} />)}
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <th>
                      {f.label}
                      {f.type === 'scale' && <small> ({f.config.min ?? 0}–{f.config.max})</small>}
                      {f.config.unit && f.type !== 'timerange' && <small> ({f.config.unit})</small>}
                    </th>
                    {chunk.map((e) => (
                      <td key={e.id}>{cell(f, e) || <span className="muted">–</span>}</td>
                    ))}
                    {Array.from({ length: COLS - chunk.length }, (_, i) => <td key={`pad${i}`} />)}
                  </tr>
                ))}
                {notes.map((f) => (
                  <tr key={f.id}>
                    <th>{f.label}</th>
                    <td colSpan={COLS} className="report-notes">
                      {chunk
                        .filter((e) => !isEmptyValue(e.values[f.id]))
                        .map((e) => `${new Date(e.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}: ${e.values[f.id]}`)
                        .join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <footer className="report-legend">
          {[...legendKeys.values()].map((f) => (
            <div key={f.id}>
              <b>{f.description?.startsWith('Stärkegrade') ? 'Stärkegrade' : f.label}:</b>
              <ul>
                {f.description?.startsWith('Stärkegrade')
                  ? f.description.replace('Stärkegrade: ', '').split(' · ').map((l) => <li key={l}>{l}</li>)
                  : f.config.scaleLabels!.map((l, i) => <li key={i}>{(f.config.min ?? 0) + i} = {l}</li>)}
              </ul>
            </div>
          ))}
          {maps.map((f) => {
            const kind = f.config.bodyMap ?? 'abdomen';
            const freq = frequencies(f, entries);
            const max = Math.max(1, ...freq.map((x) => x.count));
            const intensity = Object.fromEntries(
              BODY_MAPS[kind].regions.map((r) => [r.id, (freq.find((x) => x.label === r.label)?.count ?? 0) / max]),
            );
            return (
              <div key={f.id} className="report-map">
                <b>{f.label} – Häufigkeit im Zeitraum</b>
                <BodyMapSvg kind={kind} intensity={intensity} color={tracker.color} size="small" />
                <ul>
                  {freq.map((x) => <li key={x.label}>{x.label}: {x.count}×</li>)}
                </ul>
              </div>
            );
          })}
        </footer>
        <p className="report-foot muted small">Erstellt am {new Date().toLocaleDateString('de-DE')} mit „Build Your Own Tracker“.</p>
      </article>
    </div>
  );
}

function cell(f: FieldDef, e: Entry): string {
  return formatShort(f, e.values[f.id]);
}
