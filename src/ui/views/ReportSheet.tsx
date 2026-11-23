import { frequencies } from '../../core/analytics';
import { BODY_MAPS } from '../../core/bodyMaps';
import { fmtLevel, isEmptyValue, scaleLevels } from '../../core/fieldTypes';
import { dayColumns, entryColumns, type ReportColumn } from '../../core/report';
import type { Entry, FieldDef, Tracker } from '../../core/types';
import { BodyMapSvg } from '../BodyMap';

const COLS = 7;

/**
 * Tabellen im Stil eines Papiertagebuchs: Felder als Zeilen, Einträge oder
 * Tage als Spalten (je 7), darunter Legenden und die Körperkarte.
 */
export function ReportSheet({ tracker, entries, mode }: { tracker: Tracker; entries: Entry[]; mode: 'entries' | 'days' }) {
  const shown = tracker.fields.filter((f) => !f.hidden || entries.some((e) => !isEmptyValue(e.values[f.id])));
  const rows = shown.filter((f) => !(f.type === 'text' && f.config.multiline));
  const notes = shown.filter((f) => f.type === 'text' && f.config.multiline);
  const cols = mode === 'days' ? dayColumns(tracker, entries) : entryColumns(tracker, entries);
  const chunks: ReportColumn[][] = [];
  for (let i = 0; i < cols.length; i += COLS) chunks.push(cols.slice(i, i + COLS));

  const legend = new Map<string, FieldDef>();
  for (const f of shown.filter((x) => x.type === 'scale' && scaleLevels(x.config).some((l) => l.label))) {
    const key = `${f.description ?? ''}|${scaleLevels(f.config).map((l) => `${l.value}=${l.label}`).join('|')}`;
    if (!legend.has(key)) legend.set(key, f);
  }
  const maps = shown.filter((f) => f.type === 'bodymap');

  if (!entries.length) return <p className="muted">Keine Einträge im gewählten Zeitraum.</p>;
  return (
    <>
      {chunks.map((chunk, ci) => (
        <div key={ci} className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th>{mode === 'days' ? 'Tag' : 'Datum'}</th>
                {chunk.map((c) => (
                  <th key={c.key}>
                    {c.head}
                    {c.sub && <small>{c.sub}</small>}
                  </th>
                ))}
                {Array.from({ length: COLS - chunk.length }, (_, i) => <th key={`p${i}`} />)}
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <th>
                    {f.label}
                    {f.type === 'scale' && <small> ({fmtLevel(f.config.min ?? 0)}–{fmtLevel(f.config.max ?? 0)}{mode === 'days' ? ', Tagesmax.' : ''})</small>}
                    {f.config.unit && f.type !== 'timerange' && <small> ({f.config.unit})</small>}
                  </th>
                  {chunk.map((c) => (
                    <td key={c.key}>{c.values[f.id] || <span className="muted">–</span>}</td>
                  ))}
                  {Array.from({ length: COLS - chunk.length }, (_, i) => <td key={`p${i}`} />)}
                </tr>
              ))}
              {notes.map((f) => (
                <tr key={f.id}>
                  <th>{f.label}</th>
                  <td colSpan={COLS} className="report-notes">
                    {chunk
                      .filter((c) => c.notes[f.id]?.length)
                      .map((c) => `${c.head}: ${c.notes[f.id].join(' / ')}`)
                      .join(' · ') || <span className="muted">–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {(legend.size > 0 || maps.length > 0) && (
        <footer className="report-legend">
          {[...legend.values()].map((f) => (
            <div key={f.id}>
              <b>{f.description?.startsWith('Stärkegrade') ? 'Stärkegrade' : f.label}:</b>
              <ul>
                {f.description?.startsWith('Stärkegrade')
                  ? f.description.replace('Stärkegrade: ', '').split(' · ').map((l) => <li key={l}>{l}</li>)
                  : scaleLevels(f.config).map((l) => <li key={l.value}>{fmtLevel(l.value)} = {l.label || '–'}</li>)}
              </ul>
            </div>
          ))}
          {maps.map((f) => {
            const kind = f.config.bodyMap ?? 'abdomen';
            const freq = frequencies(f, entries);
            const max = Math.max(1, ...freq.map((x) => x.count));
            const intensity = Object.fromEntries(BODY_MAPS[kind].regions.map((r) => [r.id, (freq.find((x) => x.label === r.label)?.count ?? 0) / max]));
            return (
              <div key={f.id} className="report-map">
                <b>{f.label} – Häufigkeit</b>
                <BodyMapSvg kind={kind} intensity={intensity} color={tracker.color} size="small" />
                <ul>{freq.map((x) => <li key={x.label}>{x.label}: {x.count}×</li>)}</ul>
              </div>
            );
          })}
        </footer>
      )}
    </>
  );
}
