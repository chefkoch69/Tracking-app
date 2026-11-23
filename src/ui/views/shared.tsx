import { useState } from 'react';
import { formatClock } from '../../core/dates';
import { formatDuration, formatShort, formatValue, isEmptyValue, isTimeRange, metricLabel, rangeMinutes, severity } from '../../core/fieldTypes';
import type { Entry, FieldDef, Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { severityColor } from '../fieldInputs';
import { navigate } from '../router';

/** Werte eines Eintrags als kompakte Pills; Skalen ampelfarbig. */
export function ValuePills({ tracker, entry, limit }: { tracker: Tracker; entry: Entry; limit?: number }) {
  const filled = tracker.fields.filter(
    (f) => !isEmptyValue(entry.values[f.id]) && !(f.type === 'text' && f.config.multiline) && entry.values[f.id] !== false,
  );
  const shown = limit ? filled.slice(0, limit) : filled;
  return (
    <div className="pills">
      {shown.map((f) => {
        const v = entry.values[f.id];
        const sev = severity(f, v);
        const isScale = f.type === 'scale';
        return (
          <span key={f.id} className="value-pill" title={`${f.label}: ${formatValue(f, v)}`}>
            <span className="vp-label">{f.label}</span>
            <span className="vp-value" style={sev !== null ? { background: severityColor(sev), color: '#fff' } : undefined}>
              {isScale
                ? formatShort(f, v)
                : f.type === 'checkbox'
                  ? '✓'
                  : isTimeRange(v) && rangeMinutes(v) !== null
                    ? formatDuration(rangeMinutes(v)!)
                    : formatValue(f, v)}
            </span>
          </span>
        );
      })}
      {limit && filled.length > limit && <span className="value-pill more">+{filled.length - limit}</span>}
    </div>
  );
}

export function EntryCard({ tracker, entry }: { tracker: Tracker; entry: Entry }) {
  const { dispatch } = useStore();
  const notes = tracker.fields.filter((f) => f.type === 'text' && f.config.multiline && !isEmptyValue(entry.values[f.id]));
  return (
    <div className="entry-card" style={{ '--accent': tracker.color } as React.CSSProperties}>
      <div className="entry-head">
        <span className="entry-time">{formatClock(new Date(entry.timestamp))}</span>
        <span className="inline">
          <button className="btn ghost small" onClick={() => navigate(`/t/${tracker.id}/entry/${entry.id}`)}>Bearbeiten</button>
          <button
            className="btn ghost small danger"
            onClick={() => confirm('Diesen Eintrag löschen?') && dispatch({ type: 'entry/delete', id: entry.id })}
          >
            Löschen
          </button>
        </span>
      </div>
      <ValuePills tracker={tracker} entry={entry} />
      {notes.map((f) => (
        <p key={f.id} className="entry-note">
          <small className="muted">{f.label}</small>
          {String(entry.values[f.id])}
        </p>
      ))}
    </div>
  );
}

export function FieldSelect({ fields, value, onChange, label = 'Messgröße' }: { fields: FieldDef[]; value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <label className="cfg-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {metricLabel(f)}
            {f.config.unit ? ` (${f.config.unit})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useFieldChoice(fields: FieldDef[]) {
  const [id, setId] = useState(fields[0]?.id ?? '');
  const field = fields.find((f) => f.id === id) ?? fields[0];
  return [field, setId] as const;
}

export function NoData({ tracker, text = 'Noch keine Einträge.' }: { tracker: Tracker; text?: string }) {
  return (
    <div className="card empty">
      <div className="empty-icon">{tracker.icon}</div>
      <p>{text}</p>
      <button className="btn primary" onClick={() => navigate(`/t/${tracker.id}/entry`)}>
        Ersten Eintrag erfassen
      </button>
    </div>
  );
}

export function NeedsNumeric() {
  return (
    <div className="card empty">
      <p>Diese Ansicht benötigt mindestens ein Zahlen-, Mess-, Skalen-, Zeitraum- oder Checkbox-Feld.</p>
    </div>
  );
}
