import { useMemo, useState } from 'react';
import { askConfirm } from './confirm';
import { saveFile } from './save';
import { addDays, dayKey, startOfDay } from '../core/dates';
import { fieldSpec, formatShort, formatValue, isEmptyValue, severity } from '../core/fieldTypes';
import { exportCsv } from '../core/storage';
import type { Entry, FieldDef, Tracker } from '../core/types';
import { useStore } from '../state/store';
import { severityColor } from './fieldInputs';
import { navigate } from './router';
import { ValuePills } from './views/shared';

const PAGE = 100;
const RANGES = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
  { days: 0, label: 'Alles' },
];

type SortKey = 'time' | 'tracker' | string;

/**
 * Rohdaten als Tabelle. Mit festem Tracker: eine Spalte je Feld (sortierbar).
 * Ohne: alle Tracker gemischt, Werte als Pills.
 */
export function DataTable({ fixedTracker }: { fixedTracker?: Tracker }) {
  const { data, dispatch } = useStore();
  const [trackerId, setTrackerId] = useState(fixedTracker?.id ?? 'all');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState(fixedTracker ? 0 : 30);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'time', dir: -1 });
  const [limit, setLimit] = useState(PAGE);

  const tracker = fixedTracker ?? data.trackers.find((t) => t.id === trackerId);
  const byId = useMemo(() => new Map(data.trackers.map((t) => [t.id, t])), [data.trackers]);

  const rows = useMemo(() => {
    const from = range ? dayKey(addDays(startOfDay(new Date()), -(range - 1))) : '';
    const q = query.trim().toLocaleLowerCase('de-DE');
    let list = data.entries.filter((e) => {
      const t = byId.get(e.trackerId);
      if (!t || (tracker && e.trackerId !== tracker.id)) return false;
      if (from && dayKey(new Date(e.timestamp)) < from) return false;
      if (!q) return true;
      const hay = [t.name, ...t.fields.map((f) => `${f.label} ${formatValue(f, e.values[f.id])}`)].join(' ').toLocaleLowerCase('de-DE');
      return hay.includes(q);
    });
    const field = tracker?.fields.find((f) => f.id === sort.key);
    const val = (e: Entry): number | string => {
      if (sort.key === 'time') return e.timestamp;
      if (sort.key === 'tracker') return byId.get(e.trackerId)?.name ?? '';
      if (!field) return '';
      const n = fieldSpec(field).toNumber(field, e.values[field.id] ?? null);
      return n ?? formatShort(field, e.values[field.id]);
    };
    list = [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      // Leere Werte immer ans Ende.
      if (x === '' && y !== '') return 1;
      if (y === '' && x !== '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de')) * sort.dir;
    });
    return list;
  }, [data.entries, byId, tracker, range, query, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'time' ? -1 : 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  const exportFiltered = () => {
    if (tracker) {
      void saveFile(`${tracker.name}-daten.csv`, exportCsv(tracker, rows), 'text/csv;charset=utf-8');
      return;
    }
    // Gemischt: "langes" Format – eine Zeile je Wert.
    const lines = [['Zeitstempel', 'Tracker', 'Feld', 'Wert']];
    for (const e of rows) {
      const t = byId.get(e.trackerId)!;
      for (const f of t.fields) {
        if (isEmptyValue(e.values[f.id])) continue;
        lines.push([e.timestamp, t.name, f.label, formatValue(f, e.values[f.id])]);
      }
    }
    const cell = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    void saveFile('alle-daten.csv', '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  };

  const shown = rows.slice(0, limit);
  const cols: FieldDef[] = tracker ? tracker.fields : [];

  return (
    <div className="data-view">
      <div className="card data-controls">
        <div className="controls">
          {!fixedTracker && (
            <label className="cfg-row">
              <span>Tracker</span>
              <select value={trackerId} onChange={(e) => { setTrackerId(e.target.value); setSort({ key: 'time', dir: -1 }); }}>
                <option value="all">Alle Tracker</option>
                {data.trackers.map((t) => (
                  <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="cfg-row">
            <span>Suchen</span>
            <input type="search" placeholder="z. B. Buscopan, Nabelregion, Stress …" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="cfg-row">
            <span>Zeitraum</span>
            <select value={range} onChange={(e) => setRange(Number(e.target.value))}>
              {RANGES.map((r) => (
                <option key={r.days} value={r.days}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <span className="muted small">{rows.length} {rows.length === 1 ? 'Eintrag' : 'Einträge'}</span>
          <button className="btn small" disabled={!rows.length} onClick={exportFiltered}>⤓ Auswahl als Tabelle (CSV)</button>
        </div>
      </div>

      {!rows.length ? (
        <div className="card empty"><p>Keine Einträge für diese Auswahl.</p></div>
      ) : (
        <div className="card table-card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sticky-col sortable" onClick={() => toggleSort('time')}>Zeitpunkt{arrow('time')}</th>
                  {!tracker && <th className="sortable" onClick={() => toggleSort('tracker')}>Tracker{arrow('tracker')}</th>}
                  {!tracker && <th>Werte</th>}
                  {cols.map((f) => (
                    <th key={f.id} className="sortable" onClick={() => toggleSort(f.id)} title={f.description}>
                      {f.label}
                      {f.config.unit && f.type !== 'timerange' ? ` (${f.config.unit})` : ''}
                      {arrow(f.id)}
                    </th>
                  ))}
                  <th aria-label="Aktionen" />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const t = byId.get(e.trackerId)!;
                  const d = new Date(e.timestamp);
                  return (
                    <tr key={e.id} onClick={() => navigate(`/t/${t.id}/entry/${e.id}`)}>
                      <td className="sticky-col nowrap">
                        <b>{d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</b>{' '}
                        <span className="muted">{d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      {!tracker && (
                        <td className="nowrap" style={{ color: t.color }}>{t.icon} {t.name}</td>
                      )}
                      {!tracker && (
                        <td><ValuePills tracker={t} entry={e} limit={5} /></td>
                      )}
                      {cols.map((f) => (
                        <td key={f.id} className={cellClass(f)}>
                          <Cell field={f} entry={e} />
                        </td>
                      ))}
                      <td className="row-actions" onClick={(ev) => ev.stopPropagation()}>
                        <button
                          className="btn ghost small danger"
                          aria-label="Eintrag löschen"
                          onClick={async () => (await askConfirm('Diesen Eintrag löschen?', { okLabel: 'Löschen' })) && dispatch({ type: 'entry/delete', id: e.id })}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <button className="btn" onClick={() => setLimit(limit + PAGE)}>Weitere {Math.min(PAGE, rows.length - limit)} anzeigen</button>
          )}
        </div>
      )}
    </div>
  );
}

function cellClass(f: FieldDef) {
  if (f.type === 'text' && f.config.multiline) return 'wrap';
  return fieldSpec(f).numeric ? 'num' : '';
}

function Cell({ field, entry }: { field: FieldDef; entry: Entry }) {
  const v = entry.values[field.id];
  const text = formatShort(field, v);
  if (!text) return <span className="muted">–</span>;
  const sev = severity(field, v);
  if (sev !== null) {
    return <span className="sev-badge" style={{ background: severityColor(sev) }} title={formatValue(field, v)}>{text}</span>;
  }
  return <span title={formatValue(field, v)}>{field.type === 'checkbox' ? (v ? '✓' : '–') : text}</span>;
}
