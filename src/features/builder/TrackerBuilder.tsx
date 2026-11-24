import { useState } from 'react';
import { askConfirm } from '../../components/confirm';
import { FIELD_TYPE_LIST, FIELD_TYPES, fmtLevel, scaleLevels } from '../../core/fields/fieldTypes';
import { uid } from '../../core/model/id';
import { optionRenames } from '../../core/fields/trackerEdit';
import { useDragReorder } from './useDragReorder';
import { WEEKDAY_SHORT } from '../../core/model/dates';
import { describeSchedule, slotMinutesForDay } from '../../core/diary/schedule';
import { TEMPLATES, emptyTracker, makeField, trackerFromTemplate } from '../../core/fields/templates';
import type { FieldDef, FieldValue, Schedule, Tracker, ViewType } from '../../core/model/types';
import { useStore } from '../../state/store';
import { FieldConfigEditor, FieldInput } from '../../components/fieldInputs';
import { navigate } from '../../app/router';
import { requestNotificationPermission } from '../../platform/reminders';

const STEPS = ['Was?', 'Welche Daten?', 'Wann?', 'Auswertung', 'Starten'];

export const VIEW_INFO: Record<ViewType, { label: string; hint: string }> = {
  history: { label: 'Verlauf', hint: 'Alle Einträge chronologisch' },
  chart: { label: 'Diagramm', hint: 'Wie sich ein Wert über die Zeit entwickelt' },
  calendar: { label: 'Kalender', hint: 'An welchen Tagen wurde getrackt?' },
  stats: { label: 'Statistiken', hint: 'Summen, Durchschnitte, Rekorde, Häufigkeiten' },
  daily: { label: 'Tagesübersicht', hint: 'Alle Werte eines bestimmten Tages' },
  compare: { label: 'Vergleich', hint: 'Zwei Werte vergleichen und Zusammenhänge finden' },
  report: { label: 'Bericht', hint: 'Druckbare Tabelle für Ärztin/Arzt – wie ein Papiertagebuch' },
  table: { label: 'Tabelle', hint: 'Alle Rohdaten als sortier- und durchsuchbare Tabelle' },
};

const ICONS = ['📈', '💪', '🌅', '🥗', '🏋️', '😴', '📚', '🥶', '💧', '🧘', '🚶', '💊', '🩺', '☕', '🧠', '❤️', '🌡️', '🎯', '✍️', '🎵'];
const COLORS = ['#2f5bea', '#e8590c', '#f59f00', '#2f9e44', '#1971c2', '#5f3dc4', '#c2255c', '#1098ad', '#868e96'];

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
      for (const f of tracker.fields.filter((x) => x.type === 'scale')) {
        const vals = scaleLevels(f.config).map((l) => l.value);
        if (vals.length < 2 || vals.length > 11) return `„${f.label}“: Eine Skala braucht 2–11 Stufen.`;
        if (new Set(vals).size !== vals.length) return `„${f.label}“: Jeder Stufenwert darf nur einmal vorkommen.`;
      }
      for (const f of tracker.fields.filter((x) => x.type === 'select' || x.type === 'multiselect')) {
        const opts = (f.config.options ?? []).map((o) => o.trim());
        if (opts.some((o) => !o)) return `„${f.label}“: Leere Option entfernen oder benennen.`;
        if (new Set(opts).size !== opts.length) return `„${f.label}“: Jede Option darf nur einmal vorkommen.`;
      }
      if (tracker.fields.every((f) => f.hidden)) return 'Mindestens ein Feld muss im Formular sichtbar sein.';
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
    const clean: Tracker = {
      ...tracker,
      name: tracker.name.trim(),
      fields: tracker.fields.map((f) => (f.config.options ? { ...f, config: { ...f.config, options: f.config.options.map((o) => o.trim()) } } : f)),
    };
    if (existing) {
      for (const r of optionRenames(existing, clean)) dispatch({ type: 'entries/renameOption', trackerId: clean.id, ...r });
    }
    dispatch({ type: 'tracker/save', tracker: clean });
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
        {step === 1 && (
          <StepFields
            fields={tracker.fields}
            onChange={(fields) => {
              // Selbst entfernte Felder von „Mein Befinden“ nicht automatisch wieder ergänzen.
              const gone = tracker.fields.filter((f) => !fields.some((x) => x.id === f.id)).map((f) => f.label);
              update(gone.length && tracker.quick ? { fields, templateSkip: [...new Set([...(tracker.templateSkip ?? []), ...gone])] } : { fields });
            }}
            warnRemoval={hasEntries}
          />
        )}
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
        <input autoFocus value={tracker.name} placeholder="z. B. Mein Morgen" onChange={(e) => update({ name: e.target.value })} />
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
      <label className="switch">
        <input type="checkbox" checked={!!tracker.quick} onChange={(e) => update({ quick: e.target.checked })} />
        <span>Auf der Seite „Eintragen“ anzeigen</span>
      </label>
    </>
  );
}

/** Fertige Felder aus allen Vorlagen – als Bibliothek zum schnellen Hinzufügen. */
function fieldLibrary(): { group: string; fields: FieldDef[] }[] {
  const seen = new Set<string>();
  return TEMPLATES.map((t) => ({
    group: `${t.icon} ${t.name}`,
    fields: t.build().fields.filter((f) => {
      const k = `${f.label}|${f.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  })).filter((g) => g.fields.length);
}

function fieldSummary(f: FieldDef): string {
  const spec = FIELD_TYPES[f.type];
  const parts = [spec.label];
  if (f.config.unit && f.type !== 'timerange') parts.push(f.config.unit);
  if (f.type === 'scale') parts.push(scaleLevels(f.config).map((l) => fmtLevel(l.value)).join(' · '));
  if (f.type === 'select' || f.type === 'multiselect') parts.push(`${f.config.options?.length ?? 0} Optionen`);
  if (f.required) parts.push('Pflicht');
  return parts.join(' · ');
}

function StepFields({ fields, onChange, warnRemoval }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void; warnRemoval: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState<false | 'types' | 'library'>(fields.length === 0 ? 'types' : false);
  const [showPreview, setShowPreview] = useState(false);
  const { item, handle, dragging } = useDragReorder(fields, onChange);

  const set = (id: string, patch: Partial<FieldDef>) => onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const addField = (f: FieldDef) => {
    onChange([...fields, f]);
    setOpen(f.id);
    setPicking(false);
  };
  const duplicate = (f: FieldDef) => {
    const copy: FieldDef = { ...structuredClone(f), id: uid(), label: `${f.label} (Kopie)`, hidden: false };
    const i = fields.findIndex((x) => x.id === f.id);
    onChange([...fields.slice(0, i + 1), copy, ...fields.slice(i + 1)]);
    setOpen(copy.id);
  };
  const remove = async (f: FieldDef) => {
    const msg = warnRemoval
      ? `Feld „${f.label || 'ohne Namen'}“ entfernen? Bereits erfasste Werte werden dann nicht mehr angezeigt. Tipp: „Ausblenden“ behält sie.`
      : `Feld „${f.label || 'ohne Namen'}“ entfernen?`;
    if (!(await askConfirm(msg, { okLabel: 'Feld entfernen' }))) return;
    onChange(fields.filter((x) => x.id !== f.id));
  };

  return (
    <div className={`fields-step ${showPreview ? 'with-preview' : ''}`}>
      <div className="fields-main">
        <div className="section-head">
          <h2>Welche Daten möchtest du erfassen?</h2>
          <button type="button" className={`chip small ${showPreview ? 'active' : ''}`} onClick={() => setShowPreview(!showPreview)}>
            👁 Vorschau {showPreview ? 'ausblenden' : 'anzeigen'}
          </button>
        </div>
        <p className="muted">
          Jeder Eintrag bekommt automatisch Datum und Uhrzeit. Felder mit ⠿ ziehen, um sie zu verschieben. Ausgeblendete Felder
          erscheinen nicht mehr im Formular, ihre Daten bleiben erhalten.
        </p>
        <datalist id="group-names">
          {[...new Set(fields.map((f) => f.group).filter(Boolean))].map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <div className={`field-list ${dragging ? 'is-dragging' : ''}`}>
          {fields.map((f, i) => {
            const spec = FIELD_TYPES[f.type];
            const isOpen = open === f.id;
            return (
              <div key={f.id} className={`field-card ${isOpen ? 'open' : ''} ${f.hidden ? 'is-hidden' : ''}`} {...item(i)}>
                <div className="field-card-head">
                  <button {...handle(i, `Feld „${f.label}“`)}>⠿</button>
                  <span className="type-badge" title={spec.label}>{spec.icon}</span>
                  <button className="field-card-title" onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen}>
                    <strong>
                      {f.label || <em className="muted">Ohne Bezeichnung</em>}
                      {f.hidden && <span className="pill">ausgeblendet</span>}
                      {f.group && <span className="pill group-pill">{f.group}</span>}
                    </strong>
                    <small className="muted">{fieldSummary(f)}</small>
                  </button>
                  <div className="field-card-actions">
                    <button
                      className="btn ghost small"
                      onClick={() => set(f.id, { hidden: !f.hidden })}
                      aria-label={f.hidden ? `„${f.label}“ wieder anzeigen` : `„${f.label}“ ausblenden`}
                      title={f.hidden ? 'Wieder anzeigen' : 'Ausblenden (Daten bleiben)'}
                    >
                      {f.hidden ? '🙈' : '👁'}
                    </button>
                    <button className="btn ghost small" onClick={() => duplicate(f)} aria-label={`„${f.label}“ duplizieren`} title="Duplizieren">⧉</button>
                    <button className="btn ghost small danger" onClick={() => remove(f)} aria-label={`„${f.label}“ entfernen`} title="Entfernen">✕</button>
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
                    <label className="field">
                      <span>Abschnitt (optional)</span>
                      <input
                        list="group-names"
                        value={f.group ?? ''}
                        placeholder="z. B. Bauch & Verdauung"
                        onChange={(e) => set(f.id, { group: e.target.value || undefined })}
                      />
                      <small className="muted">Felder mit gleichem Abschnitt stehen im Formular zusammen und lassen sich auf- und zuklappen.</small>
                    </label>
                    <FieldConfigEditor type={f.type} config={f.config} onChange={(patch) => set(f.id, { config: { ...f.config, ...patch } })} />
                    <div className="inline">
                      {f.type !== 'checkbox' && (
                        <label className="switch">
                          <input type="checkbox" checked={f.required} onChange={(e) => set(f.id, { required: e.target.checked })} />
                          <span>Pflichtfeld</span>
                        </label>
                      )}
                      <label className="switch">
                        <input type="checkbox" checked={!f.hidden} onChange={(e) => set(f.id, { hidden: !e.target.checked })} />
                        <span>Im Formular anzeigen</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {picking ? (
          <div className="type-picker">
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={picking === 'types'} className={picking === 'types' ? 'active' : ''} onClick={() => setPicking('types')}>Leere Bausteine</button>
              <button role="tab" aria-selected={picking === 'library'} className={picking === 'library' ? 'active' : ''} onClick={() => setPicking('library')}>Fertige Felder</button>
            </div>
            {picking === 'types' ? (
              <div className="type-grid">
                {FIELD_TYPE_LIST.map((t) => (
                  <button key={t.type} className="type-option" onClick={() => addField(makeField(t.type, ''))}>
                    <span className="type-badge">{t.icon}</span>
                    <span>
                      <strong>{t.label}</strong>
                      <small>{t.hint}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="library">
                {fieldLibrary().map((g) => (
                  <div key={g.group}>
                    <h4>{g.group}</h4>
                    <div className="chips">
                      {g.fields.map((f) => (
                        <button key={f.id} className="chip small" title={fieldSummary(f)} onClick={() => addField({ ...structuredClone(f), id: uid() })}>
                          {FIELD_TYPES[f.type].icon} {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {fields.length > 0 && <button className="btn ghost" onClick={() => setPicking(false)}>Abbrechen</button>}
          </div>
        ) : (
          <button className="btn add-field" onClick={() => setPicking('types')}>＋ Feld hinzufügen</button>
        )}
      </div>

      {showPreview && (
        <aside className="fields-preview" aria-label="Vorschau des Eingabeformulars">
          <h3>So sieht dein Formular aus</h3>
          <FormPreview fields={fields} />
        </aside>
      )}
    </div>
  );
}

/** Live-Vorschau des Eingabeformulars (zum Ausprobieren, speichert nichts). */
function FormPreview({ fields }: { fields: FieldDef[] }) {
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const visible = fields.filter((f) => !f.hidden);
  if (!visible.length) return <p className="muted">Noch keine sichtbaren Felder.</p>;
  return (
    <div className="preview">
      {visible.map((f, i) => (
        <div key={f.id} className="field-wrap">
        {(i === 0 ? !!f.group : (f.group ?? '') !== (visible[i - 1].group ?? '')) && <h3 className="form-group-title">{f.group || 'Weitere'}</h3>}
        <div className="field">
          <span>
            {f.label || <em className="muted">Ohne Bezeichnung</em>}
            {f.required && <b className="req">*</b>}
          </span>
          {f.description && !visible.slice(0, i).some((p) => p.description === f.description) && <small className="muted">{f.description}</small>}
          <FieldInput id={`pv-${f.id}`} field={f} value={values[f.id] ?? FIELD_TYPES[f.type].emptyValue(f)} onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))} />
        </div>
        </div>
      ))}
    </div>
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
  return (
    <>
      <h2>
        {tracker.icon} {tracker.name}
      </h2>
      <dl className="summary">
        <dt>Felder</dt>
        <dd>
          {tracker.fields.filter((f) => !f.hidden).map((f) => f.label).join(', ')}
          {tracker.fields.some((f) => f.hidden) && <span className="muted"> · ausgeblendet: {tracker.fields.filter((f) => f.hidden).map((f) => f.label).join(', ')}</span>}
        </dd>
        <dt>Erinnerung</dt>
        <dd>{describeSchedule(tracker.schedule)}</dd>
        <dt>Ansichten</dt>
        <dd>{tracker.views.map((v) => VIEW_INFO[v].label).join(', ')}</dd>
      </dl>
      <h3>Vorschau der Eingabe</h3>
      <FormPreview fields={tracker.fields} />
    </>
  );
}

