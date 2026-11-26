import { useMemo, useState } from 'react';
import { Doodle } from '../../components/Doodle';
import { entriesOf } from '../../core/analysis/analytics';
import { dayKey, formatClock } from '../../core/model/dates';
import { conditionMet, FIELD_TYPES, isEmptyValue, polarityOf, validateValues } from '../../core/fields/fieldTypes';
import { entryFeedback, type ValueChange } from '../../core/diary/feedback';
import { detailsOf, fieldByLabel, momentByKey, symptomFields, withEvent, type MomentKey } from '../../core/diary/moments';
import { uid } from '../../core/model/id';
import type { Entry, FieldDef, FieldValue, Tracker } from '../../core/model/types';
import { useStore } from '../../state/store';
import { EntryDayContext } from '../../components/entryContext';
import { CompactScale, DayMoodControl, LastMealLine, QuickField, TIME_CHOICES, WakeControl, nextHint } from '../entry/EntryPage';

export interface SavedNote {
  entry: Entry;
  changes: ValueChange[];
  hint: string | null;
}

/**
 * Ein Moment direkt auf „Heute“: Kopfzeile zum Auf- und Zuklappen, darunter nur die Fragen,
 * die dazugehören. Gespeichert wird in der Karte – keine eigene Seite, kein Zurück nötig.
 */
export function MomentCard({
  tracker,
  momentKey,
  title,
  subtitle,
  icon,
  open,
  onToggle,
  onSaved,
  closeOnSave = true,
  done,
  bare = false,
}: {
  tracker: Tracker;
  momentKey: MomentKey;
  title: string;
  subtitle?: string;
  icon: string;
  open: boolean;
  onToggle?: (open: boolean) => void;
  onSaved: (s: SavedNote) => void;
  closeOnSave?: boolean;
  /** Schon erledigt (z. B. „Aufgestanden 10:03“) – zeigt ein Häkchen. */
  done?: string;
  /** Ohne eigene Karte und Kopfzeile – eingebettet in „Eintrag erstellen“. */
  bare?: boolean;
}) {
  const { data, dispatch } = useStore();
  const m = momentByKey(momentKey)!;
  const visible = tracker.fields.filter((f) => !f.hidden);
  const empty = () => Object.fromEntries(visible.map((f) => [f.id, FIELD_TYPES[f.type].emptyValue(f)]));
  const [values, setValues] = useState<Record<string, FieldValue>>(empty);
  const [timeKey, setTimeKey] = useState<string>('now');
  const [showMore, setShowMore] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const entries = useMemo(() => entriesOf(tracker, data.entries), [tracker, data.entries]);
  const today = dayKey(new Date());

  const last = (f: FieldDef): { v: FieldValue; t: Date } | null => {
    const limit = Date.now() - 24 * 3600 * 1000;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      const t = new Date(e.timestamp);
      if (t.getTime() < limit) break;
      const v = e.values[f.id];
      if (!isEmptyValue(v)) return { v: v as FieldValue, t };
    }
    return null;
  };

  const filled = visible.filter((f) => !isEmptyValue(values[f.id]) && values[f.id] !== false && conditionMet(f, visible, values));
  const errors = validateValues(filled, values);
  const set = (f: FieldDef, v: FieldValue) => setValues((s) => ({ ...s, [f.id]: v }));
  const momentFields = m.fields.flatMap((mf) => {
    const f = fieldByLabel(tracker, mf.label);
    return f ? [{ f, ask: mf.ask }] : [];
  });
  const inMoment = new Set(momentFields.map((x) => x.f.id));
  const sf = symptomFields(tracker);
  const main = sf.main.filter((f) => !inMoment.has(f.id));
  const more = sf.more.filter((f) => !inMoment.has(f.id));
  const note = visible.find((f) => f.type === 'text' && f.config.multiline);
  const stool = fieldByLabel(tracker, 'Stuhlgang');

  const save = () => {
    if (!filled.length || Object.keys(errors).length) return;
    const minutes = TIME_CHOICES.find((c) => c.key === timeKey)?.minutes ?? 0;
    const ts = new Date(Date.now() - minutes * 60000);
    const vals = withEvent(tracker, m, Object.fromEntries(filled.map((f) => [f.id, values[f.id]])));
    const entry: Entry = { id: uid(), trackerId: tracker.id, timestamp: ts.toISOString(), values: vals };
    dispatch({ type: 'entry/save', entry });
    const key = dayKey(ts);
    if (m.wake && !data.health?.[key]?.wake) dispatch({ type: 'health/upsert', days: [{ date: key, wake: formatClock(ts), source: 'manual' }] });
    onSaved({ entry, changes: entryFeedback(tracker, [...data.entries, entry], entry), hint: nextHint(tracker, vals) });
    setValues(empty());
    setTimeKey('now');
    setShowMore(false);
    setShowOptional(false);
    setShowExtra(false);
    if (closeOnSave) onToggle?.(false);
  };

  const field = (f: FieldDef, ask?: string) => (
    <QuickField key={f.id} field={f} label={ask} value={values[f.id] ?? null} prev={last(f)} error={errors[f.id]} onChange={(v) => set(f, v)} />
  );
  const symptomRows = (list: FieldDef[]) =>
    list.map((f) => (
      <div key={f.id} className="cs-block">
        <CompactScale field={f} value={values[f.id] ?? null} prev={last(f)} onChange={(v) => set(f, v)} />
        {typeof values[f.id] === 'number' && (values[f.id] as number) > 0 && detailsOf(tracker, f).length > 0 && (
          <div className="cs-details">{detailsOf(tracker, f).map((d) => field(d))}</div>
        )}
      </div>
    ));
  const showSymptoms = m.symptoms === 'main' || m.symptoms === 'all' || showOptional;
  const moreOpen = showMore || more.some((f) => filled.includes(f));

  const head = (
    <span className="mc-head-inner">
      <span className="mc-icon" aria-hidden><Doodle name={done ? 'check' : icon} size={26} /></span>
      <span className="mc-titles">
        <strong>{title}</strong>
        {(done || subtitle) && <small className="muted">{done ?? subtitle}</small>}
      </span>
      {onToggle && <span className={`mc-chev ${open ? 'open' : ''}`} aria-hidden>›</span>}
    </span>
  );

  const body = (
        <form
          className="mc-body"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <EntryDayContext.Provider value={today}>
            {m.wake && <WakeControl day={today} />}
            {m.key === 'evening' && <DayMoodControl day={today} />}
            {m.key === 'evening' && <LastMealLine tracker={tracker} entries={entries} now={new Date()} />}
            {momentFields.map(({ f, ask }, i) => {
              const head = f.group && f.group !== momentFields[i - 1]?.f.group && i > 0 ? <h3 className="mc-sub mc-group">{f.group}</h3> : null;
              // Beschwerden als Stärke-Zeile (mit ihren Details), Details selbst nicht doppelt
              if (f.type === 'scale' && polarityOf(f) === 'higher-worse')
                return (
                  <div key={f.id} className="mc-field-wrap">
                    {head}
                    {symptomRows([f])}
                  </div>
                );
              if (f.showIf && momentFields.some((x) => x.f.id === f.showIf!.fieldId)) return null;
              return (
                <div key={f.id} className="mc-field-wrap">
                  {head}
                  {field(f, ask)}
                </div>
              );
            })}

            {m.symptoms !== 'none' && (
              <div className="mc-symptoms">
                {!showSymptoms ? (
                  <button type="button" className="linkish add-more" onClick={() => setShowOptional(true)}>
                    ＋ Wie geht’s dir gerade? (optional)
                  </button>
                ) : (
                  <>
                    {m.fields.length > 0 || m.wake ? <h3 className="mc-sub">Wie geht’s dir?</h3> : null}
                    <p className="core-legend">0 keine · ½ sehr leicht · 1 leicht · 2 mittel · 3 schwer</p>
                    {symptomRows(main)}
                    {more.length > 0 &&
                      (moreOpen ? (
                        symptomRows(more)
                      ) : (
                        <button type="button" className="linkish add-more" onClick={() => setShowMore(true)}>
                          ＋ {more.map((f) => f.label).join(', ')}
                        </button>
                      ))}
                  </>
                )}
              </div>
            )}

            {m.key === 'symptom' && (stool || note) && (
              <div className="mc-extra">
                {showExtra || (stool && !isEmptyValue(values[stool.id])) || (note && !isEmptyValue(values[note.id])) ? (
                  <>
                    {stool && field(stool)}
                    {note && field(note)}
                  </>
                ) : (
                  <button type="button" className="linkish add-more" onClick={() => setShowExtra(true)}>
                    ＋ {[stool && 'Stuhlgang', note && 'Notiz'].filter(Boolean).join(' & ')}
                  </button>
                )}
              </div>
            )}
          </EntryDayContext.Provider>

          <div className="mc-save">
            <label className="mc-when">
              <span className="sr-only">Zeitpunkt</span>
              <select value={timeKey} onChange={(e) => setTimeKey(e.target.value)}>
                {TIME_CHOICES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {filled.length > 0 && (
              <button type="button" className="btn ghost small" onClick={() => setValues(empty())}>
                Leeren
              </button>
            )}
            <button type="submit" className="btn primary" disabled={!filled.length}>
              {filled.length ? `Speichern (${filled.length})` : 'Speichern'}
            </button>
          </div>
        </form>
  );
  if (bare) return body;

  return (
    <section className={`card moment-card-inline ${open ? 'open' : ''} ${done ? 'done' : ''}`}>
      {onToggle ? (
        <button type="button" className="mc-head" aria-expanded={open} onClick={() => onToggle(!open)}>
          {head}
        </button>
      ) : (
        <div className="mc-head static">{head}</div>
      )}
      {open && body}
    </section>
  );
}
