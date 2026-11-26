import { useMemo, useState } from 'react';
import { Doodle } from '../../components/Doodle';
import { SetupCard } from './SetupCard';
import { TEMPLATES, trackerFromTemplate } from '../../core/fields/templates';
import { askConfirm } from '../../components/confirm';
import { entriesOf } from '../../core/analysis/analytics';
import { dayKey, formatClock } from '../../core/model/dates';
import { fmtLevel } from '../../core/fields/fieldTypes';
import { FAVORITE_ICON, favoriteValues, favorites } from '../../core/diary/favorites';
import { uid } from '../../core/model/id';
import { slotKey } from '../../core/diary/schedule';
import type { Tracker } from '../../core/model/types';
import { useStore } from '../../state/store';
import { DayRhythmChart } from '../../components/DayRhythm';
import { appointmentLabel, dayRhythm, daysUntil, questionList } from '../../core/diary/feedback';
import { experimentDay } from '../../core/diary/experiments';
import { MomentCard, type SavedNote } from './MomentCard';
import { QuickCheck } from './QuickCheck';
import { FollowUpCard, SavedCard } from '../entry/EntryPage';
import { useDueTrackers, useNow } from '../../platform/reminders';
import { navigate } from '../../app/router';
import { EntryRow } from '../../components/EntryRow';


export function TodayPage() {
  const { data, dispatch } = useStore();
  const now = useNow();
  const due = useDueTrackers(now);
  const active = data.trackers.filter((t) => !t.archived);

  if (!data.trackers.length) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Dein Körper-Tagebuch</h1>
          <p className="muted">Aufstehen, Essen, Beschwerden, Schlafen gehen – kurz antippen. Die App zeigt dir, was auffällt.</p>
        </header>
        <button
          className="btn primary big"
          onClick={() => dispatch({ type: 'tracker/save', tracker: trackerFromTemplate(TEMPLATES.find((t) => t.key === 'now')!) })}
        >
          💙 Tagebuch starten
        </button>
      </div>
    );
  }

  // Haupt-Tracker: der Schnell-Check-in, sonst der mit den meisten Symptomen.
  const mainTracker =
    active.find((t) => t.quick && !t.demo) ??
    active.find((t) => t.quick) ??
    [...active].sort((a, b) => b.fields.filter((f) => f.type === 'scale').length - a.fields.filter((f) => f.type === 'scale').length).find((t) => t.fields.filter((f) => f.type === 'scale').length >= 2);

  return (
    <div className="page today">
      <header className="page-head today-head">
        <h1>{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
        <BandLine now={now} />
      </header>

      <SetupCard />

      {data.trackers.some((t) => t.demo) && !data.entries.some((e) => data.trackers.find((t) => t.id === e.trackerId && !t.demo)) && (
        <div className="demo-banner">
          <span>
            <b>Beispieldaten</b> · Die mit „(Demo)“ markierten Tracker sind erfundene Beispiele.
          </span>
          <button className="btn small" onClick={async () => (await askConfirm('Alle Beispiel-Tracker und ihre Einträge entfernen? Deine eigenen Tracker bleiben erhalten.', { okLabel: 'Beispiele entfernen' })) && dispatch({ type: 'demo/remove' })}>
            Beispiele entfernen
          </button>
        </div>
      )}

      {due.length > 0 && (
        <section className="reminders">
          {due.map(({ tracker, slot, snoozedUntil }) => (
            <div key={tracker.id} className="reminder-card" style={{ '--accent': tracker.color } as React.CSSProperties}>
              <div className="rc-top">
                <span className="rc-icon">{tracker.icon}</span>
                <span>
                  <small className="muted">Erinnerung · {formatClock(slot)}{snoozedUntil && ` · geschlummert bis ${formatClock(snoozedUntil)}`}</small>
                  <strong>{tracker.name}</strong>
                </span>
              </div>
              <div className="rc-actions">
                <button className="btn ghost small" onClick={() => dispatch({ type: 'reminder/update', trackerId: tracker.id, patch: { skippedSlot: slotKey(slot) } })}>
                  Überspringen
                </button>
                <button
                  className="btn ghost small"
                  onClick={() =>
                    dispatch({
                      type: 'reminder/update',
                      trackerId: tracker.id,
                      patch: { snooze: { slot: slotKey(slot), until: new Date(now.getTime() + 15 * 60000).toISOString() } },
                    })
                  }
                >
                  Später (15 Min)
                </button>
                <button className="btn primary small" onClick={() => navigate(tracker.quick ? '/now' : `/t/${tracker.id}/entry`)}>Jetzt eintragen</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {mainTracker?.quick ? <TodayLog key={mainTracker.id} tracker={mainTracker} now={now} /> : mainTracker && <FollowUpCard tracker={mainTracker} />}

      <Streak now={now} />

      <TodayTimeline trackers={active} now={now} main={mainTracker} />

      <RunningExperiments />

      <AppointmentHint now={now} />
    </div>
  );
}

/** Aufwachzeit, Schlaf und Schritte vom Armband – eine Zeile. */
function BandLine({ now }: { now: Date }) {
  const { data } = useStore();
  const h = data.health?.[dayKey(now)];
  if (!h || (h.wake === undefined && h.sleepHours === undefined && h.steps === undefined)) return null;
  return (
    <div className="band-line">
      {h.wake && <span><Doodle name="sun" size={18} /> wach {h.wake}</span>}
      {h.sleepHours !== undefined && <span><Doodle name="moon" size={18} /> {fmtLevel(h.sleepHours)} h Schlaf</span>}
      {h.steps !== undefined && <span><Doodle name="steps" size={18} /> {h.steps.toLocaleString('de-DE')}</span>}
    </div>
  );
}

type Mode = 'morning' | 'now' | 'meal' | 'med' | 'evening';

/**
 * Eintragen direkt auf „Heute“ – für Tage mit wenig Energie gebaut:
 * oben eine einzige Frage (ein Tipp reicht), darunter große Knöpfe für Essen, Medikament,
 * Morgen/Abend. Alles Weitere klappt nur auf, wenn man es antippt.
 */
function TodayLog({ tracker, now }: { tracker: Tracker; now: Date }) {
  const { data, dispatch } = useStore();
  const h = now.getHours();
  const today = dayKey(now);
  const todays = entriesOf(tracker, data.entries).filter((e) => dayKey(new Date(e.timestamp)) === today);
  const find = (ev: string) => [...todays].reverse().find((e) => Object.values(e.values).some((v) => Array.isArray(v) && v.includes(ev)));
  const woke = find('aufgestanden');
  const slept = find('schlafen gegangen');
  // Was gerade dran ist: vor 11 Uhr Aufstehen (wenn noch nicht eingetragen), ab 20 Uhr Schlafen, sonst Jetzt.
  const auto: Mode = h >= 4 && h < 11 && !woke ? 'morning' : (h >= 20 || h < 4) && !slept ? 'evening' : 'now';
  const [mode, setMode] = useState<Mode>(auto);
  const [saved, setSaved] = useState<SavedNote | null>(null);
  const [undone, setUndone] = useState(false);
  const favs = useMemo(() => favorites(tracker, data.entries, new Date(), 6), [tracker, data.entries]);

  const onSaved = (s: SavedNote) => {
    setSaved(s);
    setUndone(false);
    window.setTimeout(() => document.querySelector('.composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };
  const at = (e?: { timestamp: string }) => (e ? formatClock(new Date(e.timestamp)) : '');
  const MODES: { key: Mode; icon: string; label: string; color: string; done?: string }[] = [
    { key: 'morning', icon: 'sun', label: 'Aufstehen', color: '#F0B43C', done: woke && at(woke) },
    { key: 'now', icon: 'face4', label: 'Jetzt', color: '#4FAF92' },
    { key: 'meal', icon: 'plate', label: 'Essen', color: '#E8835F' },
    { key: 'med', icon: 'pill', label: 'Medizin', color: '#5E9FD8' },
    { key: 'evening', icon: 'moon', label: 'Schlafen', color: '#7F8FD6', done: slept && at(slept) },
  ];
  const favFor = mode === 'meal' || mode === 'med' ? favs.filter((f) => (mode === 'med') === (f.kind === 'med')) : [];

  return (
    <>

      <FollowUpCard tracker={tracker} onSymptoms={() => setMode('now')} />

      <section className="card composer">
        <div className="cp-head">
          <h2 className="cp-title">Eintrag erstellen</h2>
          <div className="cp-modes" role="tablist" aria-label="Was möchtest du eintragen?">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={mode === m.key}
                className={`cp-mode ${mode === m.key ? 'on' : ''}`}
                style={{ '--cat': m.color } as React.CSSProperties}
                onClick={() => setMode(m.key)}
              >
                <Doodle name={m.icon} size={26} />
                <span>{m.label}</span>
                {m.done && <small>✓ {m.done}</small>}
              </button>
            ))}
          </div>
        </div>
        <div className="cp-body">
          {saved ? (
            <div className="cp-done">
              <SavedCard
                saved={{ ...saved, rest: [] }}
                undone={undone}
                today={today}
                onClose={() => setSaved(null)}
                onUndo={() => {
                  dispatch({ type: 'entry/delete', id: saved.entry.id });
                  setUndone(true);
                }}
                onEdit={() => navigate(`/t/${tracker.id}/entry/${saved.entry.id}`)}
              />
              <p className="muted small">{undone ? 'Nichts gespeichert.' : 'Steht jetzt unten unter „Bisher heute“ und im Verlauf.'}</p>
              <button type="button" className="btn primary big" onClick={() => setSaved(null)}>
                Noch etwas eintragen
              </button>
            </div>
          ) : mode === 'now' ? (
            <QuickCheck key="now" tracker={tracker} onSaved={onSaved} />
          ) : (
            <>
              {favFor.length > 0 && (
                <div className="fav-inline">
                  <small className="muted">{mode === 'med' ? 'Schon öfter genommen' : 'Schon öfter gegessen'} – antippen trägt es sofort ein:</small>
                  <div className="fav-chips">
                    {favFor.map((f) => (
                      <button
                        key={`${f.fieldId}|${f.text}`}
                        type="button"
                        className="fav-chip"
                        onClick={() => {
                          const entry = { id: uid(), trackerId: tracker.id, timestamp: new Date().toISOString(), values: favoriteValues(tracker, f) };
                          dispatch({ type: 'entry/save', entry });
                          onSaved({ entry, changes: [], hint: null });
                        }}
                      >
                        <Doodle name={FAVORITE_ICON[f.kind]} size={20} /> {f.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <MomentCard key={mode} bare tracker={tracker} momentKey={mode} icon="" title="" open closeOnSave={false} onSaved={onSaved} />
            </>
          )}
        </div>
      </section>

      <div className="more-links-row">
        <button className="linkish" onClick={() => navigate('/now/talk')}>
          <Doodle name="mic" size={18} /> Erzählen
        </button>
        <button className="linkish" onClick={() => navigate('/now?m=all')}>Andere Uhrzeit / alles</button>
      </div>
    </>
  );
}

/** Freundliche Rückmeldung zur Regelmäßigkeit – ohne schlechtes Gewissen. */
function Streak({ now }: { now: Date }) {
  const { data } = useStore();
  const keys = new Set([...data.entries.map((e) => dayKey(new Date(e.timestamp))), ...Object.entries(data.days ?? {}).filter(([, d]) => d.mood).map(([k]) => k)]);
  let week = 0;
  for (let i = 0; i < 7; i++) if (keys.has(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)))) week++;
  if (!week) return null;
  const text = week >= 6 ? 'Stark – fast jeden Tag dabei.' : week >= 3 ? 'Läuft. Jeder Eintrag hilft.' : 'Schön, dass du da bist.';
  return (
    <p className="streak">
      <span className="streak-dots" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (keys.has(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i))) ? '●' : '○')).join(' ')}
      </span>
      <span>
        {week} von 7 Tagen · {text}
      </span>
    </p>
  );
}

/** Was gerade ausprobiert wird – mit Tag-Zähler. */
function RunningExperiments() {
  const { data } = useStore();
  const running = (data.experiments ?? []).filter((x) => x.status === 'running');
  if (!running.length) return null;
  return (
    <button className="card appt-hint" onClick={() => navigate('/try')}>
      <span aria-hidden>🧪</span>
      <span>
        <strong>{running.map((x) => x.title).join(', ')}</strong>
        <small className="muted">Ausprobieren · {running.map((x) => `Tag ${experimentDay(x, new Date())}`).join(', ')}</small>
      </span>
      <span aria-hidden>›</span>
    </button>
  );
}

/** Arzttermin nur als kurzer Hinweis, wenn er bald ist. */
function AppointmentHint({ now }: { now: Date }) {
  const { data } = useStore();
  const date = data.profile?.appointment;
  if (!date) return null;
  const n = daysUntil(date, now);
  if (n < 0 || n > 21) return null;
  const q = questionList(data.profile?.questions).length;
  return (
    <button className="card appt-hint" onClick={() => navigate('/arzt')}>
      <span aria-hidden>🩺</span>
      <span>
        <strong>Arzttermin {appointmentLabel(date, now)}</strong>
        <small className="muted">{q ? `${q} ${q === 1 ? 'Frage' : 'Fragen'} notiert · ` : ''}Bericht vorbereiten</small>
      </span>
      <span aria-hidden>›</span>
    </button>
  );
}

function TodayTimeline({ trackers, now, main }: { trackers: Tracker[]; now: Date; main?: Tracker }) {
  const { data } = useStore();
  const [showAll, setShowAll] = useState(false);
  const rhythm = main ? dayRhythm(main, data.entries, now) : null;
  const today = dayKey(now);
  const items = data.entries
    .filter((e) => dayKey(new Date(e.timestamp)) === today)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .flatMap((e) => {
      const t = trackers.find((x) => x.id === e.trackerId);
      return t ? [{ e, t }] : [];
    });
  if (!items.length) return null;
  const single = trackers.length === 1;
  return (
    <section className="card timeline-card">
      <div className="section-head">
        <h2>Bisher heute</h2>
        <button className="btn ghost small" onClick={() => navigate(`/data?d=${today}`)}>Ganzer Tag ›</button>
      </div>
      {rhythm && main && <DayRhythmChart rhythm={rhythm} onPick={(id) => navigate(`/t/${main.id}/entry/${id}`)} />}
      <ul className="entry-list">
        {(showAll ? items : items.slice(0, 4)).map(({ e, t }) => (
          <EntryRow key={e.id} tracker={t} entry={e} showTracker={!single} />
        ))}
      </ul>
      {items.length > 4 && (
        <button className="btn ghost small show-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Weniger zeigen' : `Alle ${items.length} Einträge von heute`}
        </button>
      )}
    </section>
  );
}
