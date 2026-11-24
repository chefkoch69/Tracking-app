import { useEffect, useMemo, useState } from 'react';
import { SpeakCard } from './SpeakCard';
import { entriesOf } from '../core/analytics';
import { dayKey, formatClock, toLocalInput } from '../core/dates';
import {
  conditionMet,
  FIELD_TYPES,
  fmtLevel,
  formatValue,
  groupFields,
  isEmptyValue,
  itemName,
  listItems,
  polarityOf,
  scaleLevels,
  severity,
  validateValues,
} from '../core/fieldTypes';
import { FAVORITE_ICON, favoriteValues, favorites } from '../core/favorites';
import { MOODS, dayRhythm, entryFeedback, levelText, type ValueChange } from '../core/feedback';
import { isFoodField } from '../core/foodGroups';
import {
  MOMENTS,
  detailsOf,
  fieldByLabel,
  momentByKey,
  pendingFollowUp,
  suggestedMoment,
  symptomFields,
  withEvent,
  type FollowUp,
  type Moment,
  type MomentKey,
} from '../core/moments';
import { DayRhythmChart } from './DayRhythm';
import { useNow } from './reminders';
import { uid } from '../core/id';
import { TEMPLATES, trackerFromTemplate } from '../core/templates';
import type { Entry, FieldDef, FieldValue, Tracker } from '../core/types';
import { useStore } from '../state/store';
import { EntryDayContext } from './entryContext';
import { FieldInput, severityColor } from './fieldInputs';
import { navigate } from './router';
import { ValuePills } from './views/shared';

/**
 * Eintragen – nach Moment: Aufgestanden, Essen & Trinken, Beschwerde, Medikament & Maßnahme,
 * Schlafen gehen. Jeder Moment fragt nur, was dazu gehört; Details zu einer Beschwerde klappen
 * auf, sobald man sie angibt. Nur Ausgefülltes wird gespeichert.
 */
export function QuickPage({ talk, moment, at }: { talk?: boolean; moment?: string; at?: string }) {
  const { data, dispatch } = useStore();
  const quick = data.trackers.filter((t) => t.quick && !t.archived);
  const tracker = quick.find((t) => !t.demo) ?? quick[0];

  if (!tracker) {
    const tpl = TEMPLATES.find((t) => t.key === 'now')!;
    return (
      <div className="page">
        <section className="hero-band compact">
          <div className="hero-inner">
            <h1>Dein Körper-Tagebuch</h1>
            <p className="hero-lead">Aufstehen, Essen, Beschwerden, Schlafen gehen – kurz antippen, fertig.</p>
          </div>
        </section>
        <div className="card empty">
          <div className="empty-icon">💙</div>
          <p>Richte „Mein Befinden“ ein. Alles lässt sich später unter „Einstellungen“ anpassen.</p>
          <button className="btn primary" onClick={() => dispatch({ type: 'tracker/save', tracker: trackerFromTemplate(tpl) })}>
            „Mein Befinden“ einrichten
          </button>
        </div>
      </div>
    );
  }
  if (talk)
    return (
      <div className="page">
        <SpeakCard tracker={tracker} onDone={() => navigate('/')} />
      </div>
    );
  return <MomentEntry key={tracker.id} tracker={tracker} talk={talk} initial={moment} at={at} />;
}

/** Schnelle Zeitwahl: die meisten Einträge passieren „jetzt“ oder kurz davor. */
export const TIME_CHOICES = [
  { key: 'now', label: 'Jetzt', minutes: 0 },
  { key: '15', label: 'vor 15 Min', minutes: 15 },
  { key: '30', label: 'vor 30 Min', minutes: 30 },
  { key: '60', label: 'vor 1 Std', minutes: 60 },
  { key: '120', label: 'vor 2 Std', minutes: 120 },
] as const;

/** Nach dem Speichern: was sich verändert hat und ein Anstoß für den nächsten Eintrag. */
export interface SavedInfo {
  entry: Entry;
  changes: ValueChange[];
  rest: string[];
  hint: string | null;
}

export function nextHint(tracker: Tracker, values: Record<string, FieldValue>): string | null {
  const texts = tracker.fields
    .filter((f) => !isEmptyValue(values[f.id]) && (f.type === 'multiselect' || (f.type === 'text' && f.config.splitList)))
    .flatMap((f) => (Array.isArray(values[f.id]) ? (values[f.id] as string[]) : [`${f.label} ${values[f.id]}`]))
    .join(' ')
    .toLocaleLowerCase('de-DE');
  if (/medikament|maßnahme/.test(texts)) return 'Wie wirkt es? Ich frage später nach – trag dann ein, wie es dir geht.';
  if (/gegessen|getrunken/.test(texts)) return 'In 1–2 Stunden frage ich nach, wie es dir nach dem Essen geht – so werden mögliche Auslöser sichtbar.';
  return null;
}

const DISMISS_KEY = 'byot:followup-dismissed';
const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]');
  } catch {
    return [];
  }
};

/** Nachfrage nach dem Essen – auch auf „Heute“. */
export function FollowUpCard({ tracker, onSymptoms }: { tracker: Tracker; onSymptoms?: () => void }) {
  const { data, dispatch } = useStore();
  const now = useNow(60000);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [done, setDone] = useState(false);
  const f: FollowUp | null = pendingFollowUp(tracker, data.entries, now, dismissed);
  if (!f || done) return null;
  const dismiss = () => {
    const next = [...dismissed, f.meal.id].slice(-30);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* egal */
    }
  };
  const allGood = () => {
    const { main } = symptomFields(tracker);
    const belly = main.filter((x) => ['Bauchschmerz', 'Übelkeit'].includes(x.label));
    const values = Object.fromEntries((belly.length ? belly : main.slice(0, 1)).map((x) => [x.id, 0]));
    dispatch({ type: 'entry/save', entry: { id: uid(), trackerId: tracker.id, timestamp: new Date().toISOString(), values } });
    setDone(true);
  };
  const h = Math.floor(f.minutesAgo / 60);
  const ago = h >= 1 ? `vor ${h} Std${f.minutesAgo % 60 >= 20 ? ` ${f.minutesAgo % 60} Min` : ''}` : `vor ${f.minutesAgo} Min`;
  return (
    <section className="card followup-card" role="status">
      <div className="fu-head">
        <span className="fu-icon" aria-hidden>🍽</span>
        <div>
          <strong>Wie geht’s dir nach dem Essen?</strong>
          <small className="muted">
            {formatClock(new Date(f.meal.timestamp))} ({ago}): {f.what}
          </small>
        </div>
        <button className="btn ghost small icon-btn" onClick={dismiss} aria-label="Nicht nachfragen">✕</button>
      </div>
      <div className="fu-actions">
        <button className="btn" onClick={allGood}>😊 Alles gut</button>
        <button className="btn primary" onClick={() => (onSymptoms ? onSymptoms() : navigate('/now?m=symptom'))}>🤕 Beschwerden</button>
      </div>
    </section>
  );
}

function MomentEntry({ tracker, talk, initial, at }: { tracker: Tracker; talk?: boolean; initial?: string; at?: string }) {
  const { data, dispatch } = useStore();
  const now = useNow(30000);
  const visible = tracker.fields.filter((f) => !f.hidden);
  const empty = () => Object.fromEntries(visible.map((f) => [f.id, FIELD_TYPES[f.type].emptyValue(f)]));
  const [values, setValues] = useState<Record<string, FieldValue>>(empty);
  const [moment, setMoment] = useState<MomentKey | 'talk' | null>(talk ? 'talk' : (momentByKey(initial)?.key ?? null));
  useEffect(() => {
    if (talk) setMoment('talk');
    else if (initial && momentByKey(initial)) setMoment(momentByKey(initial)!.key);
  }, [talk, initial]);
  const [timeKey, setTimeKey] = useState<string>(at ? 'custom' : 'now');
  const [custom, setCustom] = useState(() => (at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T12:00` : toLocalInput(new Date())));
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [undone, setUndone] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const timeFor = (ref: Date): Date => {
    if (timeKey === 'custom') {
      const d = new Date(custom);
      return Number.isNaN(d.getTime()) ? ref : d;
    }
    const c = TIME_CHOICES.find((x) => x.key === timeKey) ?? TIME_CHOICES[0];
    return new Date(ref.getTime() - c.minutes * 60000);
  };
  const when = timeFor(now);
  const otherDay = dayKey(when) !== dayKey(now);

  const entries = useMemo(() => entriesOf(tracker, data.entries), [tracker, data.entries]);
  const today = dayKey(now);
  const todays = entries.filter((e) => dayKey(new Date(e.timestamp)) === today).reverse();
  const rhythm = useMemo(() => dayRhythm(tracker, data.entries, now), [tracker, data.entries, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const favs = useMemo(() => favorites(tracker, data.entries, new Date(), 6), [tracker, data.entries]);
  const suggestion = suggestedMoment(tracker, data.entries, now);

  /** Letzter erfasster Wert je Feld (innerhalb der letzten 24 h). */
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

  // Ausgefüllt und sichtbar (Details nur, wenn ihre Beschwerde angegeben ist).
  const filled = visible.filter((f) => !isEmptyValue(values[f.id]) && values[f.id] !== false && conditionMet(f, visible, values));
  const errors = validateValues(filled, values);

  const store = (vals: Record<string, FieldValue>) => {
    const ts = timeFor(new Date());
    const entry: Entry = { id: uid(), trackerId: tracker.id, timestamp: ts.toISOString(), values: vals };
    dispatch({ type: 'entry/save', entry });
    const key = dayKey(ts);
    const woke = Object.values(vals).some((v) => Array.isArray(v) && v.some((x) => x.toLowerCase() === 'aufgestanden'));
    if (woke && !data.health?.[key]?.wake) dispatch({ type: 'health/upsert', days: [{ date: key, wake: formatClock(ts), source: 'manual' }] });
    const changes = entryFeedback(tracker, [...data.entries, entry], entry);
    const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
    const rest = tracker.fields
      .filter((f) => vals[f.id] !== undefined && !changes.some((c) => c.field.id === f.id))
      .map((f) => (f.type === 'text' && !f.config.multiline ? clip(String(vals[f.id]), 90) : short(f, vals[f.id])));
    setSaved({ entry, changes, rest, hint: nextHint(tracker, vals) });
    setUndone(false);
    setTimeKey('now');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const m: Moment | undefined = moment && moment !== 'talk' ? momentByKey(moment) : undefined;
  const save = () => {
    if (!filled.length || Object.keys(errors).length) return;
    const vals = Object.fromEntries(filled.map((f) => [f.id, values[f.id]]));
    store(m ? withEvent(tracker, m, vals) : vals);
    setValues(empty());
    setMoment(null);
    setShowMore(false);
    setShowOptional(false);
    setShowNote(false);
  };

  const { main, more } = symptomFields(tracker);
  const note = visible.find((f) => f.type === 'text' && f.config.multiline);
  const set = (f: FieldDef, v: FieldValue) => setValues((s) => ({ ...s, [f.id]: v }));

  const field = (f: FieldDef, ask?: string) => (
    <QuickField key={f.id} field={f} label={ask} value={values[f.id] ?? null} prev={last(f)} error={errors[f.id]} onChange={(v) => set(f, v)} />
  );
  const symptomRows = (list: FieldDef[]) =>
    list.map((f) => (
      <div key={f.id} className="cs-block">
        <CompactScale field={f} value={values[f.id] ?? null} prev={last(f)} onChange={(v) => set(f, v)} />
        {typeof values[f.id] === 'number' && (values[f.id] as number) > 0 && detailsOf(tracker, f).length > 0 && (
          <div className="cs-details">
            {detailsOf(tracker, f).map((d) => field(d))}
          </div>
        )}
      </div>
    ));

  const title =
    timeKey === 'now'
      ? m
        ? `${m.icon} ${m.label}`
        : 'Was möchtest du eintragen?'
      : `${m ? `${m.icon} ${m.label}` : 'Eintragen'} ${otherDay ? `am ${when.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} ` : ''}um ${formatClock(when)}`;

  return (
    <div className="page">
      <section className="hero-band compact">
        <div className="hero-inner">
          <h1>{title}</h1>
          <div className="time-chips" role="group" aria-label="Zeitpunkt des Eintrags">
            {TIME_CHOICES.map((c) => (
              <button key={c.key} type="button" className={`chip small on-hero ${timeKey === c.key ? 'active' : ''}`} aria-pressed={timeKey === c.key} onClick={() => setTimeKey(c.key)}>
                {c.label}
              </button>
            ))}
            <button
              type="button"
              className={`chip small on-hero ${timeKey === 'custom' ? 'active' : ''}`}
              aria-pressed={timeKey === 'custom'}
              onClick={() => {
                if (timeKey !== 'custom') setCustom(toLocalInput(when));
                setTimeKey('custom');
              }}
            >
              Andere Zeit…
            </button>
          </div>
          {timeKey === 'custom' && (
            <div className="quick-time">
              <label htmlFor="quick-when" className="sr-only">Datum und Uhrzeit</label>
              <input id="quick-when" type="datetime-local" value={custom} max={toLocalInput(now)} onChange={(e) => setCustom(e.target.value)} />
            </div>
          )}
        </div>
      </section>

      {saved && (
        <SavedCard
          saved={saved}
          undone={undone}
          today={today}
          onClose={() => setSaved(null)}
          onUndo={() => {
            dispatch({ type: 'entry/delete', id: saved.entry.id });
            setUndone(true);
          }}
          onEdit={() => navigate(`/t/${tracker.id}/entry/${saved.entry.id}`)}
        />
      )}

      {!moment && <FollowUpCard tracker={tracker} onSymptoms={() => setMoment('symptom')} />}

      {/* Moment wählen */}
      {!moment ? (
        <section className="moment-grid" aria-label="Was möchtest du eintragen?">
          {MOMENTS.filter((x) => x.key !== 'all').map((x) => (
            <button key={x.key} className={`moment-tile ${suggestion === x.key ? 'suggested' : ''}`} onClick={() => setMoment(x.key)}>
              <span className="mt-icon" aria-hidden>{x.icon}</span>
              <span className="mt-label">{x.label}</span>
              <small>{suggestion === x.key ? 'jetzt passend' : x.hint}</small>
            </button>
          ))}
          <button className="moment-tile" onClick={() => setMoment('talk')}>
            <span className="mt-icon" aria-hidden>🎙</span>
            <span className="mt-label">Erzählen</span>
            <small>frei sprechen oder schreiben</small>
          </button>
        </section>
      ) : (
        <div className="moment-switch" role="tablist" aria-label="Moment wechseln">
          {MOMENTS.map((x) => (
            <button key={x.key} role="tab" aria-selected={moment === x.key} className={`chip small ${moment === x.key ? 'active' : ''}`} onClick={() => setMoment(x.key)}>
              {x.icon} {x.label}
            </button>
          ))}
          <button role="tab" aria-selected={moment === 'talk'} className={`chip small ${moment === 'talk' ? 'active' : ''}`} onClick={() => setMoment('talk')}>
            🎙 Erzählen
          </button>
        </div>
      )}

      {!moment && favs.length > 0 && (
        <section className="card fav-card">
          <div className="fav-head">
            <h2>Schnell eintragen</h2>
            <small className="muted">1 Tipp = gespeichert</small>
          </div>
          <div className="fav-chips">
            {favs.map((f) => (
              <button key={`${f.fieldId}|${f.text}`} type="button" className="fav-chip" onClick={() => store(favoriteValues(tracker, f))}>
                <span aria-hidden>{FAVORITE_ICON[f.kind]}</span> {f.text}
              </button>
            ))}
          </div>
        </section>
      )}

      {moment === 'talk' && <SpeakCard tracker={tracker} />}

      {m && (
        <form
          className="entry-form quick-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <EntryDayContext.Provider value={dayKey(when)}>
            {m.key === 'all' ? (
              groupFields(visible.filter((f) => conditionMet(f, visible, values))).map((g) => (
                <section key={g.name} className="card quick-group open">
                  <h2 className="qg-static">{g.name}</h2>
                  {g.fields.map((f) => field(f))}
                </section>
              ))
            ) : (
              <>
                {(m.wake || m.fields.length > 0 || m.key === 'evening') && (
                  <section className="card moment-card">
                    {m.wake && <WakeControl day={dayKey(when)} />}
                    {m.key === 'evening' && <DayMoodControl day={dayKey(when)} />}
                    {m.key === 'evening' && <LastMealLine tracker={tracker} entries={entries} now={now} />}
                    {m.fields.map((mf) => {
                      const f = fieldByLabel(tracker, mf.label);
                      return f ? field(f, mf.ask) : null;
                    })}
                  </section>
                )}

                {m.symptoms !== 'none' && (
                  <section className="card core-card">
                    {m.symptoms === 'optional' && !showOptional ? (
                      <button type="button" className="linkish add-more" onClick={() => setShowOptional(true)}>
                        ＋ Wie geht’s dir gerade? (optional)
                      </button>
                    ) : (
                      <>
                        <div className="fav-head">
                          <h2>{m.key === 'symptom' ? 'Was hast du?' : 'Wie geht’s dir?'}</h2>
                          {main.concat(more).some((f) => filled.includes(f)) && (
                            <button type="button" className="btn ghost small" onClick={() => setValues((v) => ({ ...v, ...Object.fromEntries(main.concat(more).map((f) => [f.id, null])) }))}>
                              Zurücksetzen
                            </button>
                          )}
                        </div>
                        <p className="core-legend">
                          0 keine · ½ sehr leicht · 1 leicht · 2 mittel · 3 schwer{m.key === 'symptom' ? ' – Details klappen auf, sobald du etwas antippst' : ''}
                        </p>
                        {symptomRows(main)}
                        {more.length > 0 &&
                          (showMore || m.key === 'symptom' || more.some((f) => filled.includes(f)) ? (
                            symptomRows(more)
                          ) : (
                            <button type="button" className="linkish add-more" onClick={() => setShowMore(true)}>
                              ＋ Weitere: {more.map((f) => f.label).join(', ')}
                            </button>
                          ))}
                        {m.key === 'symptom' &&
                          ['Stuhlgang'].map((l) => {
                            const f = fieldByLabel(tracker, l);
                            return f ? field(f) : null;
                          })}
                      </>
                    )}
                  </section>
                )}

                {note && (
                  <section className="card note-card">
                    {showNote || !isEmptyValue(values[note.id]) ? (
                      field(note)
                    ) : (
                      <button type="button" className="linkish add-more" onClick={() => setShowNote(true)}>
                        ＋ Notiz
                      </button>
                    )}
                  </section>
                )}
              </>
            )}
          </EntryDayContext.Provider>
          <div className="actions sticky quick-save">
            <span className="muted small quick-count">
              {filled.length ? `${filled.length} ${filled.length === 1 ? 'Angabe' : 'Angaben'}` : 'Tippe an, was zutrifft'}
            </span>
            {filled.length > 0 && (
              <button type="button" className="btn ghost small" onClick={() => setValues(empty())}>
                Leeren
              </button>
            )}
            <button type="submit" className="btn primary" disabled={!filled.length}>
              Speichern · {otherDay ? `${when.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })} ` : ''}{formatClock(when)}
            </button>
          </div>
        </form>
      )}

      {!moment && todays.length > 0 && (
        <section className="card">
          <div className="section-head">
            <h2>Heute</h2>
            <button className="btn ghost small" onClick={() => navigate('/data')}>Verlauf</button>
          </div>
          <DayRhythmChart rhythm={rhythm} onPick={(id) => navigate(`/t/${tracker.id}/entry/${id}`)} />
          <ul className="timeline">
            {(showAll ? todays : todays.slice(0, 3)).map((e) => (
              <li key={e.id} style={{ '--accent': tracker.color } as React.CSSProperties}>
                <button className="tl-item" onClick={() => navigate(`/t/${tracker.id}/entry/${e.id}`)}>
                  <span className="tl-time-big">{formatClock(new Date(e.timestamp))}</span>
                  <span className="tl-body">
                    <ValuePills tracker={tracker} entry={e} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {todays.length > 3 && (
            <button className="btn ghost small show-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Weniger zeigen' : `Alle ${todays.length} Einträge von heute zeigen`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** Ein Feld mit Bezeichnung, letztem Wert und Eingabe. */
export function QuickField({ field: f, label, value, prev, error, onChange }: { field: FieldDef; label?: string; value: FieldValue; prev: { v: FieldValue; t: Date } | null; error?: string; onChange: (v: FieldValue) => void }) {
  const delta = typeof value === 'number' && prev && typeof prev.v === 'number' ? value - prev.v : null;
  const better = delta !== null && (delta < 0) === (f.config.polarity !== 'higher-better');
  return (
    <div className="field quick-field">
      <div className="quick-label">
        <label htmlFor={`q-${f.id}`}>{label ?? f.label}</label>
        {prev && (
          <small className="muted">
            zuletzt {short(f, prev.v)} um {formatClock(prev.t)}
            {delta !== null && delta !== 0 && polarityOf(f) !== 'neutral' && <b className={`delta ${better ? 'good' : 'bad'}`}>{better ? ' ▼ besser' : ' ▲ schlechter'}</b>}
          </small>
        )}
      </div>
      {f.description && <small className="muted">{f.description}</small>}
      <FieldInput id={`q-${f.id}`} field={f} value={value} onChange={onChange} />
      {error && <small className="error">{error}</small>}
    </div>
  );
}

/** Aufwachzeit: aus Apple Health (Amazfit) übernommen oder selbst eintragen. */
export function WakeControl({ day }: { day: string }) {
  const { data, dispatch } = useStore();
  const h = data.health?.[day];
  return (
    <div className="field quick-field wake-control">
      <div className="quick-label">
        <label htmlFor="wake-time">Aufgewacht um</label>
        {h?.wake && <small className="muted">{h.source === 'health' ? 'aus Apple Health' : 'selbst eingetragen'}{h.sleepHours ? ` · ${fmtLevel(h.sleepHours)} h Schlaf` : ''}</small>}
      </div>
      <div className="time-input">
        <input
          id="wake-time"
          type="time"
          value={h?.wake ?? ''}
          onChange={(e) => e.target.value && dispatch({ type: 'health/upsert', days: [{ date: day, wake: e.target.value, source: h?.source === 'health' ? 'health' : 'manual' }] })}
        />
        {!h?.wake && <small className="muted">Mit dem Health-Kurzbefehl kommt die Zeit von deinem Armband (siehe Einstellungen).</small>}
      </div>
    </div>
  );
}

/** Abends: wann zuletzt gegessen wurde – aus den Einträgen, nicht nochmal fragen. */
export function LastMealLine({ tracker, entries, now }: { tracker: Tracker; entries: Entry[]; now: Date }) {
  const food = tracker.fields.filter((f) => isFoodField(f) && /gegessen|essen/i.test(f.label));
  const today = dayKey(now);
  const meals = entries.filter((e) => dayKey(new Date(e.timestamp)) === today && food.some((f) => typeof e.values[f.id] === 'string' && e.values[f.id]));
  const lastMeal = meals[meals.length - 1];
  if (!lastMeal) return <p className="muted small moment-info">Heute noch kein Essen eingetragen.</p>;
  const what = food.flatMap((f) => (typeof lastMeal.values[f.id] === 'string' ? listItems(lastMeal.values[f.id] as string).map(itemName) : [])).join(', ');
  return (
    <p className="muted small moment-info">
      Zuletzt gegessen: <b>{formatClock(new Date(lastMeal.timestamp))}</b> – {what}
    </p>
  );
}

export function SavedCard({ saved, undone, today, onClose, onUndo, onEdit }: { saved: SavedInfo; undone: boolean; today: string; onClose: () => void; onUndo: () => void; onEdit: () => void }) {
  const ts = new Date(saved.entry.timestamp);
  return (
    <section className={`saved-card ${undone ? 'undone' : ''}`} role="status">
      <div className="saved-head">
        <span className="saved-check" aria-hidden>{undone ? '↺' : '✓'}</span>
        <strong>{undone ? 'Rückgängig gemacht – der Eintrag ist entfernt.' : `Gespeichert · ${formatClock(ts)}${dayKey(ts) !== today ? ` am ${ts.toLocaleDateString('de-DE')}` : ''}`}</strong>
        <button className="btn ghost small icon-btn" onClick={onClose} aria-label="Rückmeldung schließen">✕</button>
      </div>
      {!undone && (
        <>
          {saved.changes.length > 0 && (
            <ul className="saved-changes">
              {saved.changes.map((c) => (
                <li key={c.field.id} className={c.direction}>
                  <span className="sc-label">{c.field.label}</span>
                  <b>{levelText(c.field, c.value)}</b>
                  <small>
                    {c.direction === 'better' ? '▼ besser als' : c.direction === 'worse' ? '▲ schlechter als' : '= gleich wie'} um {formatClock(c.prevAt)}
                    {c.direction !== 'same' && ` (${fmtLevel(c.prev)})`}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {saved.rest.length > 0 && <p className="saved-rest">{saved.rest.join(' · ')}</p>}
          {saved.hint && <p className="saved-hint">{saved.hint}</p>}
          <div className="saved-actions">
            <button className="btn ghost small" onClick={onUndo}>Rückgängig</button>
            <button className="btn ghost small" onClick={onEdit}>Bearbeiten</button>
          </div>
        </>
      )}
    </section>
  );
}

export function short(f: FieldDef, v: FieldValue): string {
  if (f.type === 'scale' && typeof v === 'number') return `${f.label} ${fmtLevel(v)}`;
  if (Array.isArray(v)) return f.type === 'bodymap' ? formatValue(f, v) : v.join(', ');
  if (f.type === 'scale') return f.label;
  const s = formatValue(f, v);
  if (f.type === 'text') return f.config.multiline ? 'Notiz' : s.length > 28 ? `${s.slice(0, 27)}…` : s;
  if (f.type === 'time') return `${f.label} ${s}`;
  return s;
}

/** ½ statt 0,5 – kurz genug für kleine Knöpfe. */
function stepText(v: number): string {
  return v === 0.5 ? '½' : fmtLevel(v);
}

/** Eine Beschwerde als kompakte Zeile: Name links, Stufen rechts. Nochmal tippen = abwählen. */
export function CompactScale({ field, value, prev, onChange }: { field: FieldDef; value: FieldValue; prev: { v: FieldValue; t: Date } | null; onChange: (v: FieldValue) => void }) {
  const levels = scaleLevels(field.config);
  const cur = typeof value === 'number' ? value : null;
  const label = cur !== null ? levels.find((l) => l.value === cur)?.label : null;
  const before = prev && typeof prev.v === 'number' ? prev.v : null;
  const diff = cur !== null && before !== null ? cur - before : null;
  return (
    <div className="cs-row">
      <div className="cs-label">
        <span className="cs-name">{field.label}</span>
        <small className="muted">
          {cur !== null ? label : before !== null ? `zuletzt ${stepText(before)} (${formatClock(prev!.t)})` : ' '}
          {diff !== null && diff !== 0 && <b className={`delta ${diff < 0 ? 'good' : 'bad'}`}>{diff < 0 ? ' ▼ besser' : ' ▲ schlechter'}</b>}
        </small>
      </div>
      <div className="cs-steps" role="radiogroup" aria-label={field.label}>
        {levels.map((l) => {
          const sev = severity(field, l.value) ?? 0;
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={cur === l.value}
              aria-label={`${field.label}: ${fmtLevel(l.value)} ${l.label}`}
              title={`${fmtLevel(l.value)} ${l.label}`}
              className={`cs-step ${cur === l.value ? 'on' : ''}`}
              style={{ '--sev': severityColor(sev) } as React.CSSProperties}
              onClick={() => onChange(cur === l.value ? null : l.value)}
            >
              {stepText(l.value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Abends: „Wie war der Tag?“ mit einem Tipp (gilt für den ganzen Tag). */
export function DayMoodControl({ day }: { day: string }) {
  const { data, dispatch } = useStore();
  const mood = data.days?.[day]?.mood;
  return (
    <div className="field quick-field">
      <div className="quick-label">
        <label>Wie war der Tag insgesamt?</label>
      </div>
      <div className="mood-row compact" role="radiogroup" aria-label="Wie war der Tag?">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mood === m.value}
            className={`mood-btn ${mood === m.value ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'day/update', date: day, patch: { mood: mood === m.value ? undefined : m.value } })}
          >
            <span aria-hidden>{m.icon}</span>
            <small>{m.label}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
