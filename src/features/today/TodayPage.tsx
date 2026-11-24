import { useMemo, useState } from 'react';
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
import { FollowUpCard, SavedCard } from '../entry/EntryPage';
import { useDueTrackers, useNow } from '../../platform/reminders';
import { navigate } from '../../app/router';
import { ValuePills } from '../../components/entryViews';

function greeting(d: Date) {
  const h = d.getHours();
  return h < 4 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
}

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
        <p className="today-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{greeting(now)}</h1>
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
      {h.wake && <span>☀ wach {h.wake}</span>}
      {h.sleepHours !== undefined && <span>☾ {fmtLevel(h.sleepHours)} h Schlaf</span>}
      {h.steps !== undefined && <span>👣 {h.steps.toLocaleString('de-DE')}</span>}
    </div>
  );
}

type Extra = 'meal' | 'med' | 'evening' | null;

/**
 * Eintragen direkt auf „Heute“: oben der Moment, der gerade dran ist (morgens Aufgestanden,
 * abends Schlafen gehen), dann „Wie geht’s dir gerade?“ und Knöpfe für Essen, Medikament usw.
 * Alles klappt an Ort und Stelle auf – keine Unterseiten.
 */
function TodayLog({ tracker, now }: { tracker: Tracker; now: Date }) {
  const { data, dispatch } = useStore();
  const h = now.getHours();
  const today = dayKey(now);
  const todays = entriesOf(tracker, data.entries).filter((e) => dayKey(new Date(e.timestamp)) === today);
  const find = (ev: string) => [...todays].reverse().find((e) => Object.values(e.values).some((v) => Array.isArray(v) && v.includes(ev)));
  const woke = find('aufgestanden');
  const slept = find('schlafen gegangen');
  const primary: 'morning' | 'evening' | null = h >= 4 && h < 15 ? 'morning' : h >= 19 || h < 4 ? 'evening' : null;
  const primaryDone = primary === 'morning' ? woke : primary === 'evening' ? slept : undefined;
  const [primaryOpen, setPrimaryOpen] = useState(!!primary && !primaryDone);
  const [feelOpen, setFeelOpen] = useState(!primary || !!primaryDone);
  const [extra, setExtra] = useState<Extra>(null);
  const [saved, setSaved] = useState<SavedNote | null>(null);
  const [undone, setUndone] = useState(false);
  const favs = useMemo(() => favorites(tracker, data.entries, new Date(), 5), [tracker, data.entries]);

  const onSaved = (s: SavedNote) => {
    setSaved(s);
    setUndone(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const at = (e?: { timestamp: string }) => (e ? formatClock(new Date(e.timestamp)) : '');
  const actions: { key: Exclude<Extra, null> | 'talk'; icon: string; label: string }[] = [
    { key: 'meal', icon: '🍽', label: 'Essen & Trinken' },
    { key: 'med', icon: '💊', label: 'Medikament' },
    ...(primary !== 'evening' ? [{ key: 'evening' as const, icon: '🌙', label: 'Schlafen gehen' }] : []),
    { key: 'talk', icon: '🎙', label: 'Erzählen' },
  ];

  return (
    <>
      {saved && (
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
      )}

      <FollowUpCard
        tracker={tracker}
        onSymptoms={() => {
          setPrimaryOpen(false);
          setFeelOpen(true);
          window.setTimeout(() => document.getElementById('feel-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        }}
      />

      {primary === 'morning' && (
        <MomentCard
          tracker={tracker}
          momentKey="morning"
          icon="☀️"
          title={woke ? 'Aufgestanden' : 'Guten Morgen – wie hast du geschlafen?'}
          subtitle="Aufwachzeit, Wecker, Schlaf und wie es dir geht"
          done={woke ? `um ${at(woke)} eingetragen` : undefined}
          open={primaryOpen}
          onToggle={setPrimaryOpen}
          onSaved={(s) => {
            onSaved(s);
            setFeelOpen(false);
          }}
        />
      )}
      {primary === 'evening' && (
        <MomentCard
          tracker={tracker}
          momentKey="evening"
          icon="🌙"
          title={slept ? 'Schlafen gehen' : 'Bevor du schlafen gehst'}
          subtitle="Wie war der Tag, Handy weg, Wecker, getrunken?"
          done={slept ? `um ${at(slept)} eingetragen` : undefined}
          open={primaryOpen}
          onToggle={setPrimaryOpen}
          onSaved={onSaved}
        />
      )}

      <div id="feel-card" hidden={!!primary && !primaryDone && primaryOpen}>
        <MomentCard
          tracker={tracker}
          momentKey="symptom"
          icon="🤕"
          title="Wie geht’s dir gerade?"
          subtitle="Bauch, Kopf, Tinnitus, Erschöpfung, Kälte …"
          open={feelOpen}
          onToggle={setFeelOpen}
          closeOnSave={false}
          onSaved={onSaved}
        />
      </div>

      <section className="quick-actions" aria-label="Weiteres eintragen">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`qa-btn ${extra === a.key ? 'active' : ''}`}
            aria-expanded={a.key === 'talk' ? undefined : extra === a.key}
            onClick={() => (a.key === 'talk' ? navigate('/now/talk') : setExtra(extra === a.key ? null : a.key))}
          >
            <span aria-hidden>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </section>

      {extra && (
        <MomentCard
          key={extra}
          tracker={tracker}
          momentKey={extra}
          icon={extra === 'meal' ? '🍽' : extra === 'med' ? '💊' : '🌙'}
          title={extra === 'meal' ? 'Essen & Trinken' : extra === 'med' ? 'Medikament & Maßnahme' : 'Schlafen gehen'}
          open
          onToggle={(o) => !o && setExtra(null)}
          onSaved={(s) => {
            onSaved(s);
            setExtra(null);
          }}
        />
      )}

      {favs.length > 0 && (
        <section className="fav-inline" aria-label="Schnell eintragen">
          <small className="muted">Mit einem Tipp gespeichert:</small>
          <div className="fav-chips">
            {favs.map((f) => (
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
                <span aria-hidden>{FAVORITE_ICON[f.kind]}</span> {f.text}
              </button>
            ))}
          </div>
        </section>
      )}

      <button className="linkish more-entry" onClick={() => navigate('/now?m=all')}>
        Alle Felder auf einmal oder zu einer anderen Uhrzeit ›
      </button>
    </>
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
      <ul className="timeline">
        {(showAll ? items : items.slice(0, 4)).map(({ e, t }) => (
          <li key={e.id} style={{ '--accent': t.color } as React.CSSProperties}>
            <button className="tl-item" onClick={() => navigate(`/t/${t.id}/entry/${e.id}`)}>
              <span className="tl-time-big">{formatClock(new Date(e.timestamp))}</span>
              <span className="tl-body">
                {!single && <strong>{t.name}</strong>}
                <ValuePills tracker={t} entry={e} limit={5} />
              </span>
            </button>
          </li>
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
