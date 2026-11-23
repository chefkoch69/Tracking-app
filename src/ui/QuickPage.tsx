import { useMemo, useState } from 'react';
import { TalkCard } from './TalkCard';
import { applyUpgrades, templateUpgrades } from '../core/trackerEdit';
import { entriesOf } from '../core/analytics';
import { dayKey, formatClock, toLocalInput } from '../core/dates';
import { FIELD_TYPES, fmtLevel, formatValue, isEmptyValue, validateValues } from '../core/fieldTypes';
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
            Richte deinen Schnell-Check-in ein. Er startet mit Ereignissen (gegessen, Medikament, aufgestanden …) und Befinden
            (Bauchschmerz, Übelkeit, Müdigkeit, Tinnitus, Erschöpfung) – alles danach frei änderbar.
          </p>
          <button
            className="btn primary"
            onClick={() => {
              const t = trackerFromTemplate(tpl);
              dispatch({ type: 'tracker/save', tracker: t });
            }}
          >
            Schnell-Check-in einrichten
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
  if (hidden || !related || (!up.fields.length && !up.options.length)) return null;
  const items = [...up.fields.map((f) => f.label), ...up.options.flatMap((o) => o.add.map((a) => `„${a}“`))];
  return (
    <div className="demo-banner">
      <span>
        <b>Neu für deinen Check-in:</b> {items.join(', ')}. Deine bisherigen Einträge bleiben unverändert.
      </span>
      <span className="inline">
        <button className="btn small ghost" onClick={() => setHidden(true)}>Nicht jetzt</button>
        <button className="btn small primary" onClick={() => dispatch({ type: 'tracker/save', tracker: applyUpgrades(tracker, up, tpl) })}>Hinzufügen</button>
      </span>
    </div>
  );
}

function QuickForm({ tracker, others, onSwitch, talk }: { tracker: Tracker; others: Tracker[]; onSwitch: (id: string) => void; talk?: boolean }) {
  const { data, dispatch } = useStore();
  const visible = tracker.fields.filter((f) => !f.hidden);
  const empty = () => Object.fromEntries(visible.map((f) => [f.id, FIELD_TYPES[f.type].emptyValue(f)]));
  const [values, setValues] = useState<Record<string, FieldValue>>(empty);
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [timeTouched, setTimeTouched] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

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
    setValues(empty());
    setTimeTouched(false);
    setWhen(toLocalInput(new Date()));
    window.scrollTo(0, 0);
  };

  return (
    <div className="page" style={{ '--accent': tracker.color } as React.CSSProperties}>
      <section className="hero-band tinted compact">
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
      <TalkCard quick={tracker} autoFocus={talk} />

      {saved && (
        <div className="saved-toast" role="status">
          <span>✓ {saved}</span>
          <button className="btn ghost small" onClick={() => setSaved(null)} aria-label="Hinweis schließen">✕</button>
        </div>
      )}

      <h2 className="quick-or">… oder antippen</h2>
      <form
        className="card entry-form quick-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <EntryDayContext.Provider value={when.slice(0, 10)}>
          {visible.map((f, i) => {
            const prev = last(f);
            const now = values[f.id];
            const delta = typeof now === 'number' && prev && typeof prev.v === 'number' ? now - prev.v : null;
            return (
              <div key={f.id} className="field quick-field">
                <div className="quick-label">
                  <label htmlFor={`q-${f.id}`}>{f.label}</label>
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
        </EntryDayContext.Provider>
        <div className="actions sticky">
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
  return f.type === 'text' ? 'Notiz' : s;
}
