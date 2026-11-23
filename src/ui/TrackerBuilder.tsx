import { useState } from 'react';
import { FIELD_TYPE_LIST, FIELD_TYPES, validateValues } from '../core/fieldTypes';
import { WEEKDAY_SHORT } from '../core/dates';
import { describeSchedule, slotMinutesForDay } from '../core/schedule';
import { TEMPLATES, emptyTracker, makeField, trackerFromTemplate } from '../core/templates';
import type { FieldDef, FieldType, FieldValue, Schedule, Tracker, ViewType } from '../core/types';
import { useStore } from '../state/store';
import { FieldConfigEditor, FieldInput } from './fieldInputs';
import { navigate } from './router';
import { requestNotificationPermission } from './reminders';

const STEPS = ['Was?', 'Welche Daten?', 'Wann?', 'Auswertung', 'Starten'];

export const VIEW_INFO: Record<ViewType, { label: string; hint: string }> = {
  history: { label: 'Verlauf', hint: 'Alle Einträge chronologisch' },
  chart: { label: 'Diagramm', hint: 'Entwicklung einer Messgröße über die Zeit' },
  calendar: { label: 'Kalender', hint: 'An welchen Tagen wurde getrackt?' },
  stats: { label: 'Statistiken', hint: 'Summen, Durchschnitte, Rekorde, Häufigkeiten' },
  daily: { label: 'Tagesübersicht', hint: 'Alle Werte eines bestimmten Tages' },
  compare: { label: 'Vergleich', hint: 'Zusammenhänge zwischen Messgrößen finden' },
};

const ICONS = ['📈', '💪', '🌅', '🥗', '🏋️', '😴', '📚', '🥶', '💧', '🧘', '🚶', '💊', '🩺', '☕', '🧠', '❤️', '🌡️', '🎯', '✍️', '🎵'];
const COLORS = ['#4c6ef5', '#e8590c', '#f59f00', '#2f9e44', '#1971c2', '#5f3dc4', '#c2255c', '#1098ad', '#868e96'];

export function TrackerBuilder({ existing }: { existing?: Tracker }) {
  const { data, dispatch } = useStore();
  const [tracker, setTracker] = useState<Tracker>(() => (existing ? structuredClone(existing) : emptyTracker()));
  const [step, setStep] = useState(existing ? 1 : 0);
  const [chosen, setChosen] = useState(!!existing);
  const update = (patch: Partial<Tracker>) => setTracker((t) => ({ ...t, ...patch }));

  const hasEntries = !!existing && data.entries.some((e) => e.trackerId === existing.id);

  const stepError = (s: number): string | null => {
    if (s === 0 && !tracker.name.trim()) return 'Bitte gib deinem Tracker einen Namen.';
    if (s === 1) {
      if (!tracker.fields.length) return 'Füge mindestens ein Feld hinzu.';
      if (tracker.fields.some((f) => !f.label.trim())) return 'Jedes Feld braucht eine Bezeichnung.';
      if (tracker.fields.some((f) => (f.type === 'select' || f.type === 'multiselect') && !(f.config.options ?? []).length))
        return 'Auswahlfelder brauchen mindestens eine Option.';
      if (tracker.fields.some((f) => f.type === 'scale' && ((f.config.max ?? 0) <= (f.config.min ?? 0) || (f.config.max ?? 0) - (f.config.min ?? 0) > 10)))
        return 'Eine Skala braucht 2–11 Stufen.';
    }
    if (s === 2 && tracker.schedule.mode !== 'manual') {
      if (!tracker.schedule.weekdays.length) return 'Wähle mindestens einen Wochentag.';
      if (tracker.schedule.mode === 'times' && !tracker.schedule.times.length) return 'Füge mindestens eine Uhrzeit hinzu.';
      if (tracker.schedule.mode === 'interval' && !slotMinutesForDay({ ...tracker.schedule, weekdays: [0, 1, 2, 3, 4, 5, 6] }, new Date()).length)
        return 'Das Zeitfenster ergibt keine Erinnerung.';
    }
    if (s === 3 && !tracker.views.length) return 'Wähle mindestens eine Ansicht.';
    return null;
  };

  const error = stepError(step);
  const save = async () => {
    for (let s = 0; s < 4; s++) {
      if (stepError(s)) {
        setStep(s);
        return;
      }
    }
    if (tracker.schedule.mode !== 'manual') await requestNotificationPermission();
    dispatch({ type: 'tracker/save', tracker: { ...tracker, name: tracker.name.trim() } });
    navigate(`/t/${tracker.id}`);
  };

  if (!chosen) {
    return (
      <div className="page">
        <h1>Neuen Tracker bauen</h1>
        <p className="lead">Starte mit einem leeren Baukasten – oder nimm eine Vorlage als Ausgangspunkt und passe sie an.</p>
        <button className="template-card blank" onClick={() => setChosen(true)}>
          <span className="tpl-icon">＋</span>
          <span>
            <strong>Eigener Tracker</strong>
            <small>Von Grund auf selbst zusammenstellen</small>
          </span>
        </button>
        <h2>Oder Vorlage wählen</h2>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              className="template-card"
              style={{ '--accent': t.color } as React.CSSProperties}
              onClick={() => {
                setTracker(trackerFromTemplate(t));
                setChosen(true);
              }}
            >
              <span className="tpl-icon">{t.icon}</span>
              <span>
                <strong>{t.name}</strong>
                <small>{t.description}</small>
                <small className="muted">{t.build().fields.length} Felder · {describeSchedule(t.build().schedule)}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page builder">
      <h1>{existing ? `„${existing.name}“ bearbeiten` : 'Neuen Tracker bauen'}</h1>
      <ol className="stepper">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'active' : i < step ? 'done' : ''}>
            <button onClick={() => (i <= step || !stepError(step)) && setStep(i)}>
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="card">
        {step === 0 && <StepBasics tracker={tracker} update={update} />}
        {step === 1 && <StepFields fields={tracker.fields} onChange={(fields) => update({ fields })} warnRemoval={hasEntries} />}
        {step === 2 && <StepSchedule schedule={tracker.schedule} onChange={(schedule) => update({ schedule })} />}
        {step === 3 && <StepViews tracker={tracker} onChange={(views) => update({ views })} />}
        {step === 4 && <StepSummary tracker={tracker} />}
      </section>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn ghost" onClick={() => (step === 0 ? (existing ? navigate(`/t/${existing.id}`) : setChosen(false)) : setStep(step - 1))}>
          {step === 0 ? 'Abbrechen' : 'Zurück'}
        </button>
        {step < 4 ? (
          <button className="btn primary" disabled={!!error} onClick={() => setStep(step + 1)}>
            Weiter
          </button>
        ) : (
          <button className="btn primary" onClick={save}>
            {existing ? 'Änderungen speichern' : 'Tracker speichern & starten'}
          </button>
        )}
      </div>
    </div>
  );
}

function StepBasics({ tracker, update }: { tracker: Tracker; update: (p: Partial<Tracker>) => void }) {
  return (
    <>
      <h2>Was möchtest du tracken?</h2>
      <label className="field">
        <span>Name</span>
        <input autoFocus value={tracker.name} placeholder="z. B. Morgen-Check-in" onChange={(e) => update({ name: e.target.value })} />
      </label>
      <label className="field">
        <span>Beschreibung / Ziel (optional)</span>
        <input value={tracker.description} placeholder="Worum geht es dir?" onChange={(e) => update({ description: e.target.value })} />
      </label>
      <label className="field">
        <span>Kategorie (optional)</span>
        <input value={tracker.category} placeholder="z. B. Gesundheit, Habit, Fitness" onChange={(e) => update({ category: e.target.value })} />
      </label>
      <div className="field">
        <span>Symbol</span>
        <div className="icon-picker">
          {ICONS.map((i) => (
            <button key={i} type="button" className={tracker.icon === i ? 'active' : ''} onClick={() => update({ icon: i })}>{i}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Farbe</span>
        <div className="color-picker">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} className={tracker.color === c ? 'active' : ''} style={{ background: c }} onClick={() => update({ color: c })} />
          ))}
        </div>
      </div>
    </>
  );
}

function StepFields({ fields, onChange, warnRemoval }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void; warnRemoval: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(fields.length === 0);

  const set = (id: string, patch: Partial<FieldDef>) => onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (type: FieldType) => {
    const f = makeField(type, '');
    onChange([...fields, f]);
    setOpen(f.id);
    setPicking(false);
  };
  const remove = (f: FieldDef) => {
    if (warnRemoval && !confirm(`Feld „${f.label || 'ohne Namen'}“ entfernen? Bereits erfasste Werte dieses Feldes werden nicht mehr angezeigt.`)) return;
    onChange(fields.filter((x) => x.id !== f.id));
  };

  return (
    <>
      <h2>Welche Daten möchtest du erfassen?</h2>
      <p className="muted">Jeder Eintrag bekommt automatisch Datum und Uhrzeit. Füge beliebig viele Felder hinzu.</p>
      <div className="field-list">
        {fields.map((f, i) => {
          const spec = FIELD_TYPES[f.type];
          const isOpen = open === f.id;
          return (
            <div key={f.id} className={`field-card ${isOpen ? 'open' : ''}`}>
              <div className="field-card-head">
                <span className="type-badge" title={spec.label}>{spec.icon}</span>
                <button className="field-card-title" onClick={() => setOpen(isOpen ? null : f.id)}>
                  <strong>{f.label || <em className="muted">Ohne Bezeichnung</em>}</strong>
                  <small className="muted">
                    {spec.label}
                    {f.config.unit ? ` · ${f.config.unit}` : ''}
                    {f.type === 'scale' ? ` · ${f.config.min ?? 0}–${f.config.max ?? 3}` : ''}
                    {f.required ? ' · Pflicht' : ''}
                  </small>
                </button>
                <div className="field-card-actions">
                  <button className="btn ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="nach oben">↑</button>
                  <button className="btn ghost small" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="nach unten">↓</button>
                  <button className="btn ghost small danger" onClick={() => remove(f)} aria-label="entfernen">✕</button>
                </div>
              </div>
              {isOpen && (
                <div className="field-card-body">
                  <label className="field">
                    <span>Bezeichnung</span>
                    <input autoFocus value={f.label} placeholder={spec.hint} onChange={(e) => set(f.id, { label: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Hinweis beim Ausfüllen (optional)</span>
                    <input value={f.description ?? ''} onChange={(e) => set(f.id, { description: e.target.value || undefined })} />
                  </label>
                  <FieldConfigEditor type={f.type} config={f.config} onChange={(patch) => set(f.id, { config: { ...f.config, ...patch } })} />
                  {f.type !== 'checkbox' && (
                    <label className="switch">
                      <input type="checkbox" checked={f.required} onChange={(e) => set(f.id, { required: e.target.checked })} />
                      <span>Pflichtfeld</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {picking ? (
        <div className="type-picker">
          <h3>Baustein wählen</h3>
          <div className="type-grid">
            {FIELD_TYPE_LIST.map((t) => (
              <button key={t.type} className="type-option" onClick={() => add(t.type)}>
                <span className="type-badge">{t.icon}</span>
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </span>
              </button>
            ))}
          </div>
          {fields.length > 0 && <button className="btn ghost" onClick={() => setPicking(false)}>Abbrechen</button>}
        </div>
      ) : (
        <button className="btn add-field" onClick={() => setPicking(true)}>＋ Feld hinzufügen</button>
      )}
    </>
  );
}

function StepSchedule({ schedule, onChange }: { schedule: Schedule; onChange: (s: Schedule) => void }) {
  const set = (p: Partial<Schedule>) => onChange({ ...schedule, ...p });
  const [newTime, setNewTime] = useState('12:00');
  const modes: { mode: Schedule['mode']; label: string; hint: string }[] = [
    { mode: 'manual', label: 'Manuell', hint: 'Ich trage ein, wann ich will – keine Erinnerungen.' },
    { mode: 'times', label: 'Zu festen Uhrzeiten', hint: 'z. B. täglich um 06:45' },
    { mode: 'interval', label: 'In regelmäßigen Intervallen', hint: 'z. B. alle 3 Stunden zwischen 9 und 21 Uhr' },
  ];
  return (
    <>
      <h2>Wann möchtest du tracken?</h2>
      <div className="radio-cards">
        {modes.map((m) => (
          <label key={m.mode} className={`radio-card ${schedule.mode === m.mode ? 'active' : ''}`}>
            <input type="radio" name="mode" checked={schedule.mode === m.mode} onChange={() => set({ mode: m.mode })} />
            <span>
              <strong>{m.label}</strong>
              <small>{m.hint}</small>
            </span>
          </label>
        ))}
      </div>

      {schedule.mode !== 'manual' && (
        <>
          {schedule.mode === 'times' && (
            <div className="field">
              <span>Uhrzeiten</span>
              <div className="chips">
                {schedule.times.map((t) => (
                  <span key={t} className="chip active">
                    {t}
                    <button className="chip-x" onClick={() => set({ times: schedule.times.filter((x) => x !== t) })} aria-label={`${t} entfernen`}>✕</button>
                  </span>
                ))}
              </div>
              <div className="inline">
                <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                <button
                  className="btn small"
                  onClick={() => newTime && !schedule.times.includes(newTime) && set({ times: [...schedule.times, newTime].sort() })}
                >
                  Uhrzeit hinzufügen
                </button>
              </div>
            </div>
          )}
          {schedule.mode === 'interval' && (
            <div className="cfg-grid">
              <label className="cfg-row">
                <span>Alle … Minuten</span>
                <input type="number" min={5} step={5} value={schedule.intervalMinutes} onChange={(e) => set({ intervalMinutes: Number(e.target.value) })} />
              </label>
              <label className="cfg-row">
                <span>Von</span>
                <input type="time" value={schedule.intervalStart} onChange={(e) => set({ intervalStart: e.target.value })} />
              </label>
              <label className="cfg-row">
                <span>Bis</span>
                <input type="time" value={schedule.intervalEnd} onChange={(e) => set({ intervalEnd: e.target.value })} />
              </label>
            </div>
          )}

          <div className="field">
            <span>An welchen Wochentagen?</span>
            <div className="chips">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip ${schedule.weekdays.includes(d) ? 'active' : ''}`}
                  onClick={() =>
                    set({ weekdays: schedule.weekdays.includes(d) ? schedule.weekdays.filter((x) => x !== d) : [...schedule.weekdays, d] })
                  }
                >
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Wiederkehrende Erinnerung, wenn noch nicht erledigt</span>
            <div className="cfg-grid">
              <label className="cfg-row">
                <span>Erneut erinnern nach (Min, 0 = aus)</span>
                <input type="number" min={0} step={5} value={schedule.repeatMinutes} onChange={(e) => set({ repeatMinutes: Math.max(0, Number(e.target.value)) })} />
              </label>
              {schedule.repeatMinutes > 0 && (
                <label className="cfg-row">
                  <span>Höchstens … Wiederholungen</span>
                  <input type="number" min={1} max={20} value={schedule.maxRepeats} onChange={(e) => set({ maxRepeats: Math.max(1, Number(e.target.value)) })} />
                </label>
              )}
            </div>
          </div>
          <p className="info">🔔 {describeSchedule(schedule)}</p>
        </>
      )}
    </>
  );
}

function StepViews({ tracker, onChange }: { tracker: Tracker; onChange: (v: ViewType[]) => void }) {
  const numeric = tracker.fields.filter((f) => FIELD_TYPES[f.type].numeric).length;
  return (
    <>
      <h2>Wie möchtest du deine Daten sehen?</h2>
      <div className="check-cards">
        {(Object.keys(VIEW_INFO) as ViewType[]).map((v) => {
          const on = tracker.views.includes(v);
          const needsNumeric = (v === 'chart' || v === 'compare') && numeric === 0;
          return (
            <label key={v} className={`check-card ${on ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? tracker.views.filter((x) => x !== v) : [...tracker.views, v])}
              />
              <span>
                <strong>{VIEW_INFO[v].label}</strong>
                <small>{VIEW_INFO[v].hint}</small>
                {needsNumeric && <small className="warn">Benötigt ein Zahlen-, Mess-, Skalen- oder Checkbox-Feld.</small>}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}

function StepSummary({ tracker }: { tracker: Tracker }) {
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    Object.fromEntries(tracker.fields.map((f) => [f.id, FIELD_TYPES[f.type].emptyValue(f)])),
  );
  const errors = validateValues(tracker.fields, values);
  return (
    <>
      <h2>
        {tracker.icon} {tracker.name}
      </h2>
      <dl className="summary">
        <dt>Felder</dt>
        <dd>{tracker.fields.map((f) => f.label).join(', ')}</dd>
        <dt>Erinnerung</dt>
        <dd>{describeSchedule(tracker.schedule)}</dd>
        <dt>Ansichten</dt>
        <dd>{tracker.views.map((v) => VIEW_INFO[v].label).join(', ')}</dd>
      </dl>
      <h3>Vorschau der Eingabe</h3>
      <div className="preview">
        {tracker.fields.map((f) => (
          <div key={f.id} className="field">
            <span>
              {f.label}
              {f.required && <b className="req">*</b>}
            </span>
            {f.description && <small className="muted">{f.description}</small>}
            <FieldInput id={`pv-${f.id}`} field={f} value={values[f.id] ?? null} onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))} />
            {errors[f.id] && values[f.id] !== null && <small className="error">{errors[f.id]}</small>}
          </div>
        ))}
      </div>
    </>
  );
}
