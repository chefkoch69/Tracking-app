import { useMemo, useState } from 'react';
import { TalkCard } from './TalkCard';
import { askConfirm } from './confirm';
import { applyUpgrades, hasUpgrades, templateUpgrades } from '../core/trackerEdit';
import { entriesOf } from '../core/analytics';
import { dayKey, formatClock, toLocalInput } from '../core/dates';
import { FIELD_TYPES, fmtLevel, formatValue, groupFields, isEmptyValue, validateValues } from '../core/fieldTypes';
import { uid } from '../core/id';
import { TEMPLATES, trackerFromTemplate } from '../core/templates';
import type { Entry, FieldDef, FieldValue, Tracker } from '../core/types';
import { useStore } from '../state/store';
import { EntryDayContext } from './entryContext';
import { FieldInput } from './fieldInputs';
import { navigate } from './router';
import { ValuePills } from './views/shared';

/**
 * „Jetzt“: schneller Check-in über den Tag. Nur ausgefüllte Felder werden
 * gespeichert; neben jeder Bewertung steht der letzte Wert, damit man
 * „besser/schlechter“ sofort sieht.
 */
export function QuickPage({ talk }: { talk?: boolean }) {
  const { data, dispatch } = useStore();
  const quick = data.trackers.filter((t) => t.quick && !t.archived);
  const [activeId, setActiveId] = useState<string | null>(null);
  const tracker = quick.find((t) => t.id === activeId) ?? quick[0];

  if (!tracker) {
    const tpl = TEMPLATES.find((t) => t.key === 'now')!;
    return (
      <div className="page">
        <section className="hero-band compact">
          <div className="hero-inner">
            <h1>Wie geht’s dir gerade?</h1>
            <p className="hero-lead">Ein Schnell-Check-in für zwischendurch: antippen, was gerade ist, speichern – fertig.</p>
          </div>
        </section>
        <div className="card empty">
          <div className="empty-icon">⚡</div>
          <p>
            Richte „Mein Befinden“ ein – ein Tracker für alles: Ereignisse und Essen, Bauch und Verdauung, Übelkeit, Müdigkeit,
            Tinnitus, Kälteempfinden und Notizen. Alles danach frei änderbar.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              const t = trackerFromTemplate(tpl);
              dispatch({ type: 'tracker/save', tracker: t });
            }}
          >
            „Mein Befinden“ einrichten
          </button>
          <small className="muted">Oder einen eigenen Tracker bauen und dort „Auf der Jetzt-Seite zeigen“ einschalten.</small>
        </div>
      </div>
    );
  }
  return <QuickForm key={tracker.id} tracker={tracker} others={quick} onSwitch={setActiveId} talk={talk} />;
}

/** Hinweis, wenn die Vorlage neue Felder hat, die dem eigenen Check-in fehlen. */
function UpgradeHint({ tracker }: { tracker: Tracker }) {
  const { dispatch } = useStore();
  const [hidden, setHidden] = useState(false);
  const tpl = TEMPLATES.find((t) => t.key === 'now')!.build();
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  // Nur für Check-ins, die erkennbar aus der Vorlage stammen.
  const related = tracker.fields.filter((f) => tpl.fields.some((tf) => norm(tf.label) === norm(f.label))).length >= 3;
  const up = templateUpgrades(tracker, tpl);
  const rename = tracker.name === 'Befinden jetzt';
  if (hidden || !related || (!hasUpgrades(up) && !rename)) return null;
  const items = [...up.fields.map((f) => f.label), ...up.options.flatMap((o) => o.add.map((a) => `„${a}“`))];
  return (
    <div className="demo-banner">
      <span>
        <b>„Mein Befinden“: alles in einem.</b>{' '}
        {items.length ? `Dazu kommen: ${items.join(', ')}. ` : ''}
        Felder werden in Abschnitte sortiert (Ereignisse & Essen, Bauch, Allgemein, Kälte). Deine bisherigen Einträge bleiben unverändert.
      </span>
      <span className="inline">
        <button className="btn small ghost" onClick={() => setHidden(true)}>Nicht jetzt</button>
        <button
          className="btn small primary"
          onClick={() => {
            const next = applyUpgrades(tracker, up, tpl);
            dispatch({ type: 'tracker/save', tracker: rename ? { ...next, name: 'Mein Befinden', icon: tracker.icon === '⚡' ? '💙' : tracker.icon, color: '#2f63f0' } : next });
          }}
        >
          Übernehmen
        </button>
      </span>
    </div>
  );
}

/** Eigene Tracker, die inhaltlich zu „Mein Befinden“ gehören, zum Zusammenführen anbieten. */
function MergeHint({ tracker }: { tracker: Tracker }) {
  const { data, dispatch } = useStore();
  const [hidden, setHidden] = useState<string[]>([]);
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  const candidates = data.trackers.filter(
    (t) =>
      t.id !== tracker.id && !t.demo && !t.archived && !hidden.includes(t.id) &&
      t.fields.filter((f) => tracker.fields.some((x) => norm(x.label) === norm(f.label))).length >= 1,
  );
  if (!candidates.length) return null;
  return (
    <>
      {candidates.map((c) => (
        <div key={c.id} className="demo-banner">
          <span>
            <b>{c.icon} {c.name}</b> ist noch ein eigener Tracker. In „{tracker.name}“ übernehmen? Gleiche Felder werden zusammengelegt, alle {data.entries.filter((e) => e.trackerId === c.id).length} Einträge wandern mit.
          </span>
          <span className="inline">
            <button className="btn small ghost" onClick={() => setHidden((h) => [...h, c.id])}>Getrennt lassen</button>
            <button
              className="btn small primary"
              onClick={async () => {
                if (await askConfirm(`„${c.name}“ in „${tracker.name}“ übernehmen? Danach gibt es nur noch einen Tracker.`, { okLabel: 'Zusammenführen', danger: false }))
                  dispatch({ type: 'tracker/merge', sourceId: c.id, targetId: tracker.id });
              }}
            >
              Zusammenführen
            </button>
          </span>
        </div>
      ))}
    </>
  );
}

function QuickForm({ tracker, others, onSwitch, talk }: { tracker: Tracker; others: Tracker[]; onSwitch: (id: string) => void; talk?: boolean }) {
  const { data, dispatch } = useStore();
  const visible = tracker.fields.filter((f) => !f.hidden);
  const groups = groupFields(visible);
  const OPEN_KEY = `byot:open:${tracker.id}`;
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}');
    } catch {
      return {};
    }
  });
  const toggleGroup = (name: string, v: boolean) =>
    setOpen((s) => {
      const next = { ...s, [name]: v };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* egal */
      }
      return next;
    });
  const empty = () => Object.fromEntries(visible.map((f) => [f.id, FIELD_TYPES[f.type].emptyValue(f)]));
  const [values, setValues] = useState<Record<string, FieldValue>>(empty);
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [timeTouched, setTimeTouched] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [undoIds, setUndoIds] = useState<string[]>([]);

  const entries = useMemo(() => entriesOf(tracker, data.entries), [tracker, data.entries]);
  const today = dayKey(new Date());
  const todays = entries.filter((e) => dayKey(new Date(e.timestamp)) === today).reverse();

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

  const filled = visible.filter((f) => !isEmptyValue(values[f.id]) && values[f.id] !== false);
  const errors = validateValues(visible.filter((f) => filled.includes(f)), values);

  const save = () => {
    if (!filled.length || Object.keys(errors).length) return;
    // Zeit: falls nicht angefasst, den tatsächlichen Speicherzeitpunkt nehmen.
    const ts = timeTouched ? new Date(when) : new Date();
    const onlyFilled = Object.fromEntries(filled.map((f) => [f.id, values[f.id]]));
    const entry: Entry = { id: uid(), trackerId: tracker.id, timestamp: ts.toISOString(), values: onlyFilled };
    dispatch({ type: 'entry/save', entry });
    // "aufgestanden" angetippt → Aufstehzeit für den Tag merken (falls noch keine).
    const key = dayKey(ts);
    const woke = filled.some((f) => Array.isArray(values[f.id]) && (values[f.id] as string[]).some((x) => x.toLowerCase() === 'aufgestanden'));
    if (woke && !data.health?.[key]?.wake) {
      dispatch({ type: 'health/upsert', days: [{ date: key, wake: formatClock(ts), source: 'manual' }] });
    }
    setSaved(`Gespeichert um ${formatClock(ts)}: ${filled.map((f) => short(f, values[f.id])).join(' · ')}`);
    setUndoIds([entry.id]);
    setValues(empty());
    setTimeTouched(false);
    setWhen(toLocalInput(new Date()));
    window.scrollTo(0, 0);
  };

  return (
    <div className="page">
      <section className="hero-band compact">
        <div className="hero-inner">
          <h1>Wie geht’s dir gerade?</h1>
          <div className="quick-time">
            <label htmlFor="quick-when">Zeitpunkt</label>
            <input
              id="quick-when"
              type="datetime-local"
              value={when}
              onChange={(e) => {
                setWhen(e.target.value);
                setTimeTouched(true);
              }}
            />
            {!timeTouched && <small>jetzt</small>}
          </div>
          {others.length > 1 && (
            <div className="chips">
              {others.map((t) => (
                <button key={t.id} className={`chip small on-hero ${t.id === tracker.id ? 'active' : ''}`} onClick={() => onSwitch(t.id)}>
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <UpgradeHint tracker={tracker} />
      <MergeHint tracker={tracker} />
      <TalkCard quick={tracker} autoFocus={talk} />

      {saved && (
        <div className="saved-toast" role="status">
          <span>✓ {saved}</span>
          <span className="inline">
            {undoIds.length > 0 && (
              <button
                className="btn ghost small"
                onClick={() => {
                  undoIds.forEach((id) => dispatch({ type: 'entry/delete', id }));
                  setUndoIds([]);
                  setSaved('Rückgängig gemacht – der Eintrag ist entfernt.');
                }}
              >
                Rückgängig
              </button>
            )}
            <button className="btn ghost small" onClick={() => { setSaved(null); setUndoIds([]); }} aria-label="Hinweis schließen">✕</button>
          </span>
        </div>
      )}

      <h2 className="quick-or">… oder antippen</h2>
      <form
        className="entry-form quick-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <EntryDayContext.Provider value={when.slice(0, 10)}>
          {groups.map((g, gi) => {
            const isOpen = open[g.name] ?? (gi === 0 || g.fields.length <= 2);
            const count = g.fields.filter((f) => filled.includes(f)).length;
            return (
              <section key={g.name} className={`card quick-group ${isOpen ? 'open' : ''}`}>
                <button type="button" className="quick-group-head" aria-expanded={isOpen} onClick={() => toggleGroup(g.name, !isOpen)}>
                  <span className="qg-title">{g.name}</span>
                  {count > 0 && <span className="pill good">{count} ausgefüllt</span>}
                  <span className="qg-chevron" aria-hidden>{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen &&
                  g.fields.map((f) => {
                    const i = visible.indexOf(f);
                    const prev = last(f);
                    const now = values[f.id];
                    const delta = typeof now === 'number' && prev && typeof prev.v === 'number' ? now - prev.v : null;
                    return (
                      <div key={f.id} className="field quick-field">
                        <div className="quick-label">
                          {/* Abschnitt mit nur einem gleichnamigen Feld: Bezeichnung nicht doppelt zeigen */}
                          <label htmlFor={`q-${f.id}`} className={g.fields.length === 1 && g.name === f.label ? 'sr-only' : ''}>{f.label}</label>
                          {prev && (
                            <small className="muted">
                              zuletzt {short(f, prev.v)} um {formatClock(prev.t)}
                              {delta !== null && delta !== 0 && (
                                <b className={`delta ${(delta < 0) === (f.config.polarity !== 'higher-better') ? 'good' : 'bad'}`}>
                                  {(delta < 0) === (f.config.polarity !== 'higher-better') ? ' ▼ besser' : ' ▲ schlechter'}
                                </b>
                              )}
                              {delta === 0 && <b className="delta"> = gleich</b>}
                            </small>
                          )}
                        </div>
                        {f.description && !visible.slice(0, i).some((p) => p.description === f.description) && <small className="muted">{f.description}</small>}
                        <FieldInput id={`q-${f.id}`} field={f} value={values[f.id] ?? null} onChange={(v) => setValues((s) => ({ ...s, [f.id]: v }))} />
                        {errors[f.id] && <small className="error">{errors[f.id]}</small>}
                      </div>
                    );
                  })}
              </section>
            );
          })}
        </EntryDayContext.Provider>
        <div className="actions sticky quick-save">
          <span className="muted small quick-count">{filled.length ? `${filled.length} ausgefüllt` : 'Tippe an, was gerade ist'}</span>
          <button type="submit" className="btn primary" disabled={!filled.length}>
            Speichern{timeTouched ? '' : ` · ${formatClock(new Date())}`}
          </button>
        </div>
      </form>

      {todays.length > 0 && (
        <section className="card">
          <div className="section-head">
            <h2>Heute</h2>
            <button className="btn ghost small" onClick={() => navigate(`/t/${tracker.id}/table`)}>Alle Daten</button>
          </div>
          <ul className="timeline">
            {todays.map((e) => (
              <li key={e.id} style={{ '--accent': tracker.color } as React.CSSProperties}>
                <button className="tl-item" onClick={() => navigate(`/t/${tracker.id}/entry/${e.id}`)}>
                  <span className="tl-time-big">{formatClock(new Date(e.timestamp))}</span>
                  <span className="tl-body">
                    <ValuePills tracker={tracker} entry={e} />
                    {visible.filter((f) => f.type === 'text' && !isEmptyValue(e.values[f.id])).map((f) => (
                      <small key={f.id} className="muted">{String(e.values[f.id])}</small>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function short(f: FieldDef, v: FieldValue): string {
  if (f.type === 'scale' && typeof v === 'number') return `${f.label} ${fmtLevel(v)}`;
  if (Array.isArray(v)) return v.join(', ');
  if (f.type === 'scale') return f.label;
  const s = formatValue(f, v);
  if (f.type === 'text') return f.config.multiline ? 'Notiz' : s.length > 28 ? `${s.slice(0, 27)}…` : s;
  return s;
}
