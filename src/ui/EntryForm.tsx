import { useState } from 'react';
import { toLocalInput } from '../core/dates';
import { FIELD_TYPES, validateValues } from '../core/fieldTypes';
import { uid } from '../core/id';
import type { Entry, FieldValue, Tracker } from '../core/types';
import { useStore } from '../state/store';
import { FieldInput } from './fieldInputs';
import { navigate } from './router';

/** Generisches Eingabeformular – vollständig aus der Feldkonfiguration erzeugt. */
export function EntryForm({ tracker, entry }: { tracker: Tracker; entry?: Entry }) {
  const { dispatch } = useStore();
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(
      tracker.fields.map((f) => [f.id, entry && f.id in entry.values ? entry.values[f.id] : FIELD_TYPES[f.type].emptyValue(f)]),
    ),
  );
  const [when, setWhen] = useState(() => toLocalInput(entry ? new Date(entry.timestamp) : new Date()));
  const [tried, setTried] = useState(false);
  const errors = validateValues(tracker.fields, values);
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (again: boolean) => {
    setTried(true);
    if (hasErrors) return;
    const ts = new Date(when);
    const saved: Entry = {
      id: entry?.id ?? uid(),
      trackerId: tracker.id,
      timestamp: (Number.isNaN(ts.getTime()) ? new Date() : ts).toISOString(),
      // Werte entfernter Felder bleiben beim Bearbeiten erhalten.
      values: { ...(entry?.values ?? {}), ...values },
    };
    dispatch({ type: 'entry/save', entry: saved });
    if (again) {
      setValues(Object.fromEntries(tracker.fields.map((f) => [f.id, FIELD_TYPES[f.type].emptyValue(f)])));
      setWhen(toLocalInput(new Date()));
      setTried(false);
      window.scrollTo(0, 0);
    } else {
      navigate(`/t/${tracker.id}`);
    }
  };

  return (
    <div className="page" style={{ '--accent': tracker.color } as React.CSSProperties}>
      <section className="hero-band tinted compact">
        <div className="hero-inner">
          <button className="back linkish" onClick={() => navigate(`/t/${tracker.id}`)}>‹ {tracker.name}</button>
          <h1>
            {tracker.icon} {entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
          </h1>
        </div>
      </section>
      <form
        className="card entry-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {tracker.fields.map((f, i) => (
          <div key={f.id} className={`field ${tried && errors[f.id] ? 'invalid' : ''}`}>
            <label htmlFor={`f-${f.id}`}>
              {f.label}
              {f.required && <b className="req">*</b>}
            </label>
            {f.description && !tracker.fields.slice(0, i).some((p) => p.description === f.description) && (
              <small className="muted">{f.description}</small>
            )}
            <FieldInput id={`f-${f.id}`} field={f} value={values[f.id] ?? null} onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))} />
            {tried && errors[f.id] && <small className="error">{errors[f.id]}</small>}
          </div>
        ))}
        <div className="field">
          <label htmlFor="when">Datum & Uhrzeit</label>
          <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div className="actions sticky">
          <button type="button" className="btn ghost" onClick={() => navigate(`/t/${tracker.id}`)}>Abbrechen</button>
          {!entry && (
            <button type="button" className="btn" onClick={() => submit(true)}>Speichern & weiterer</button>
          )}
          <button type="submit" className="btn primary">Speichern</button>
        </div>
      </form>
    </div>
  );
}
