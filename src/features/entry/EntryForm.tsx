import { useState } from 'react';
import { dayKey, toLocalInput } from '../../core/model/dates';
import { EntryDayContext } from '../../components/entryContext';
import { FIELD_TYPES, conditionMet, validateValues } from '../../core/fields/fieldTypes';
import { questionFor } from '../../core/diary/moments';
import { askConfirm } from '../../components/confirm';
import { uid } from '../../core/model/id';
import type { Entry, FieldValue, Tracker } from '../../core/model/types';
import { useStore } from '../../state/store';
import { FieldInput } from '../../components/fieldInputs';
import { goBack } from '../../app/router';

/** Generisches Eingabeformular – vollständig aus der Feldkonfiguration erzeugt. */
export function EntryForm({ tracker, entry, date }: { tracker: Tracker; entry?: Entry; date?: string }) {
  const { data, dispatch } = useStore();
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(
      tracker.fields.map((f) => {
        if (entry && f.id in entry.values) return [f.id, entry.values[f.id]];
        // Zeitraum "seit dem Aufstehen": Beginn mit der Aufstehzeit des Tages vorbelegen.
        const wake = data.health?.[date ?? dayKey(new Date())]?.wake;
        if (!entry && f.type === 'timerange' && f.config.fromWake && wake) return [f.id, { from: wake, to: '' }];
        return [f.id, FIELD_TYPES[f.type].emptyValue(f)];
      }),
    ),
  );
  const [when, setWhen] = useState(() => {
    if (entry) return toLocalInput(new Date(entry.timestamp));
    // Nachtragen für einen bestimmten Tag (aus dem Kalender): aktuelle Uhrzeit an diesem Tag.
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T${toLocalInput(new Date()).slice(11)}`;
    return toLocalInput(new Date());
  });
  const [tried, setTried] = useState(false);
  // Ausgeblendete Felder erscheinen nicht im Formular; ihre alten Werte bleiben erhalten.
  // Details nur, wenn ihre Beschwerde angegeben ist (wie beim Eintragen).
  const visible = tracker.fields.filter((f) => !f.hidden && conditionMet(f, tracker.fields, values));
  const errors = validateValues(visible, values);
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
      goBack('/');
    }
  };
  const remove = async () => {
    if (!entry || !(await askConfirm('Diesen Eintrag löschen?', { okLabel: 'Löschen' }))) return;
    dispatch({ type: 'entry/delete', id: entry.id });
    goBack('/');
  };

  return (
    <div className="page">
      <form
        className="card entry-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <div className="field">
          <label htmlFor="when">Wann?</label>
          <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <EntryDayContext.Provider value={when.slice(0, 10)}>
        {visible.map((f, i) => (
          <div key={f.id} className="field-wrap">
          {(i === 0 ? !!f.group : (f.group ?? '') !== (visible[i - 1].group ?? '')) && <h3 className="form-group-title">{f.group || 'Weitere'}</h3>}
          <div className={`field ${tried && errors[f.id] ? 'invalid' : ''}`}>
            <label htmlFor={`f-${f.id}`}>
              {questionFor(f.label, f.description).ask}
              {f.required && <b className="req">*</b>}
            </label>
            {questionFor(f.label, f.description).hint && !visible.slice(0, i).some((p) => p.description === f.description && !questionFor(p.label).hint) && (
              <small className="muted">{questionFor(f.label, f.description).hint}</small>
            )}
            <FieldInput id={`f-${f.id}`} field={f} value={values[f.id] ?? null} onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))} />
            {tried && errors[f.id] && <small className="error">{errors[f.id]}</small>}
          </div>
          </div>
        ))}
        </EntryDayContext.Provider>
        {entry && (
          <button type="button" className="btn ghost danger entry-delete" onClick={remove}>
            Eintrag löschen
          </button>
        )}
        <div className="actions sticky">
          <button type="button" className="btn ghost hide-mobile" onClick={() => goBack('/')}>Abbrechen</button>
          {!entry && (
            <button type="button" className="btn" onClick={() => submit(true)}>Speichern & neu</button>
          )}
          <button type="submit" className="btn primary">Speichern</button>
        </div>
      </form>
    </div>
  );
}
