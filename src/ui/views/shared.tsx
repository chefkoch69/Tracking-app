import { useState } from 'react';
import { formatClock } from '../../core/dates';
import { formatValue, isEmptyValue } from '../../core/fieldTypes';
import type { Entry, FieldDef, Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { navigate } from '../router';

export function EntryCard({ tracker, entry }: { tracker: Tracker; entry: Entry }) {
  const { dispatch } = useStore();
  const filled = tracker.fields.filter((f) => !isEmptyValue(entry.values[f.id]));
  return (
    <div className="entry-card">
      <div className="entry-head">
        <strong>{formatClock(new Date(entry.timestamp))}</strong>
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
      {filled.length ? (
        <dl className="entry-values">
          {filled.map((f) => (
            <div key={f.id} className={f.type === 'text' && f.config.multiline ? 'wide' : ''}>
              <dt>{f.label}</dt>
              <dd>{formatValue(f, entry.values[f.id])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted small">Ohne Werte erfasst.</p>
      )}
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
            {f.label}
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
      <p>{text}</p>
      <button className="btn primary" style={{ background: tracker.color }} onClick={() => navigate(`/t/${tracker.id}/entry`)}>
        Ersten Eintrag erfassen
      </button>
    </div>
  );
}

export function NeedsNumeric() {
  return (
    <div className="card empty">
      <p>Diese Ansicht benötigt mindestens ein Zahlen-, Mess-, Skalen- oder Checkbox-Feld.</p>
    </div>
  );
}
