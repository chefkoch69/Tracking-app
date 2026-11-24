import { useState } from 'react';
import { SetupCard } from './SetupCard';
import { TEMPLATES, trackerFromTemplate } from '../core/templates';
import { WakeChip } from './HealthPanel';
import { askConfirm } from './confirm';
import { bucketize, consistencyScore, currentStreak, entriesOf, numericFields, series } from '../core/analytics';
import { ConsistencyRing } from './ConsistencyRing';
import { addDays, dayKey, formatClock, startOfDay } from '../core/dates';
import { aggregationOf } from '../core/fieldTypes';
import { daySlotStatus, describeSchedule, nextSlot, slotKey } from '../core/schedule';
import type { Tracker } from '../core/types';
import { useStore } from '../state/store';
import { combinedDayState, WeekStrip } from './Adherence';
import { Sparkline } from './charts/Charts';
import { DayRhythmChart } from './DayRhythm';
import { appointmentLabel, dayRhythm, daysUntil, questionList } from '../core/feedback';
import { MOMENTS, suggestedMoment } from '../core/moments';
import { experimentDay } from '../core/experiments';
import { FollowUpCard } from './QuickPage';
import { useDueTrackers, useNow } from './reminders';
import { navigate } from './router';
import { ValuePills } from './views/shared';

function greeting(d: Date) {
  const h = d.getHours();
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
}

export function Dashboard() {
  const { data, dispatch } = useStore();
  const now = useNow();
  const due = useDueTrackers(now);
  const active = data.trackers.filter((t) => !t.archived);

  if (!data.trackers.length) {
    return (
      <div className="page">
        <section className="hero-band">
          <div className="hero-inner center">
            <h1 className="display">Dein Körper-Tagebuch</h1>
            <p className="hero-lead">
              Aufstehen, Essen, Beschwerden, Schlafen gehen – kurz antippen. Die App zeigt dir, was auffällt, und hilft,
              Dinge auszuprobieren.
            </p>
            <div className="actions center">
              <button
                className="btn white big"
                onClick={() => {
                  dispatch({ type: 'tracker/save', tracker: trackerFromTemplate(TEMPLATES.find((t) => t.key === 'now')!) });
                  navigate('/now');
                }}
              >
                💙 „Mein Befinden“ starten
              </button>
            </div>
          </div>
        </section>
        <div className="feature-grid">
          {[
            ['☀️', 'Nach Moment eintragen', 'Aufgestanden, Essen & Trinken, Beschwerde, Schlafen gehen – jeweils nur, was dazu gehört.'],
            ['🤕', 'Details, wenn nötig', 'Bauchweh, Kopfweh, Tinnitus: die Details klappen erst auf, wenn du etwas angibst.'],
            ['🔍', 'Was auffällt', 'Mögliche Auslöser, was geholfen hat und wie es sich entwickelt.'],
            ['🧪', 'Ausprobieren', 'Eine Liste, was du testen willst – mit Vergleich vorher und währenddessen.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="feature card">
              <span className="feature-icon">{icon}</span>
              <strong>{title}</strong>
              <small className="muted">{text}</small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Haupt-Tracker für den Verlauf: der Schnell-Check-in, sonst der mit den meisten Symptomen.
  const mainTracker =
    active.find((t) => t.quick && !t.demo) ??
    active.find((t) => t.quick) ??
    [...active].sort((a, b) => b.fields.filter((f) => f.type === 'scale').length - a.fields.filter((f) => f.type === 'scale').length).find((t) => t.fields.filter((f) => f.type === 'scale').length >= 2);

  return (
    <div className="page">
      <section className="hero-band">
        <div className="hero-inner">
          <p className="hero-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="display">{greeting(now)}</h1>
          <div className="hero-cta">
            <button className="btn outline-white" onClick={() => navigate('/now/talk')}>🎙 Erzählen</button>
          </div>
          {/* Aufstehen wird über „Aufgestanden“ eingetragen – hier nur die Werte vom Armband/Health */}
          <WakeChip now={now} buttons={!mainTracker?.quick} />
          <WeekStrip now={now} state={(d) => combinedDayState(active, data.entries, d, now)} />
        </div>
      </section>

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

      {mainTracker && <FollowUpCard tracker={mainTracker} />}

      {mainTracker?.quick && <MomentShortcuts tracker={mainTracker} now={now} />}

      <RunningExperiments />

      <TodayTimeline trackers={active} now={now} main={mainTracker} />

      <AppointmentHint now={now} />

      <p className="feedback-link">
        <button className="linkish" onClick={() => navigate('/settings')}>💬 Etwas fehlt oder nervt? Sag es Claude.</button>
      </p>
    </div>
  );
}

/** Die Momente des Tages als Abkürzung – passend zur Tageszeit hervorgehoben. */
function MomentShortcuts({ tracker, now }: { tracker: Tracker; now: Date }) {
  const { data } = useStore();
  const suggestion = suggestedMoment(tracker, data.entries, now);
  return (
    <section className="moment-grid compact" aria-label="Eintragen">
      {MOMENTS.filter((m) => ['morning', 'meal', 'symptom', 'evening'].includes(m.key)).map((m) => (
        <button key={m.key} className={`moment-tile ${suggestion === m.key ? 'suggested' : ''}`} onClick={() => navigate(`/now?m=${m.key}`)}>
          <span className="mt-icon" aria-hidden>{m.icon}</span>
          <span className="mt-label">{m.label}</span>
          {suggestion === m.key && <small>jetzt passend</small>}
        </button>
      ))}
    </section>
  );
}

/** Was gerade ausprobiert wird – mit Tag-Zähler. */
function RunningExperiments() {
  const { data } = useStore();
  const running = (data.experiments ?? []).filter((x) => x.status === 'running');
  if (!running.length) return null;
  return (
    <section className="card running-card">
      <div className="section-head">
        <h2>Läuft gerade</h2>
        <button className="btn ghost small" onClick={() => navigate('/try')}>Ausprobieren</button>
      </div>
      <ul className="exp-list">
        {running.map((x) => (
          <li key={x.id}>
            <span className="exp-title">🧪 {x.title}</span>
            <span className="pill">Tag {experimentDay(x, new Date())}</span>
          </li>
        ))}
      </ul>
    </section>
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

export function TrackerCard({ tracker, now }: { tracker: Tracker; now: Date }) {
  const { data } = useStore();
  const entries = entriesOf(tracker, data.entries);
  const last = entries[entries.length - 1];
  const today = dayKey(now);
  const todayCount = entries.filter((e) => dayKey(new Date(e.timestamp)) === today).length;
  const streak = currentStreak(entries, now);
  const main = numericFields(tracker)[0];
  const spark = main
    ? bucketize(series(main, entries), 'day', aggregationOf(main))
        .filter((b) => b.key >= dayKey(addDays(startOfDay(now), -29)))
        .map((b) => b.v)
    : [];
  const slots = daySlotStatus(tracker, data.entries, now);
  const next = nextSlot(tracker, now);
  const score = consistencyScore(tracker, data.entries, now);

  return (
    <article className="tracker-card" style={{ '--accent': tracker.color } as React.CSSProperties}>
      <button className="tracker-card-main" onClick={() => navigate(`/t/${tracker.id}`)}>
        <div className="tc-head">
          <span className="tc-icon">{tracker.icon}</span>
          <span className="tc-title">
            <strong>{tracker.name}</strong>
            <small className="muted">{tracker.category || describeSchedule(tracker.schedule)}</small>
          </span>
          {score !== null && (
            <span className="tc-ring" title="Regelmäßigkeit">
              <ConsistencyRing value={score} color={tracker.color} size={38} />
            </span>
          )}
        </div>
        <div className="tc-chips">
          {slots.length > 0 && (
            <span className={`pill ${slots.every((s) => s.done) ? 'good' : ''}`}>
              Heute {slots.filter((s) => s.done).length}/{slots.length}
            </span>
          )}
          {slots.length === 0 && <span className="pill">{todayCount} heute</span>}
          {streak > 1 && <span className="pill">🔥 {streak} Tage</span>}
          {next && <span className="pill">⏰ {dayKey(next) === today ? formatClock(next) : next.toLocaleDateString('de-DE', { weekday: 'short' }) + ' ' + formatClock(next)}</span>}
        </div>
        {spark.length > 1 && (
          <div className="tc-spark">
            <small className="muted">{main.label} · 30 Tage</small>
            <Sparkline values={spark} color={tracker.color} />
          </div>
        )}
        {last ? <ValuePills tracker={tracker} entry={last} limit={3} /> : <small className="muted">Noch keine Einträge</small>}
      </button>
      <button className="quick-add" onClick={() => navigate(`/t/${tracker.id}/entry`)} aria-label={`${tracker.name}: Eintrag hinzufügen`}>
        ＋
      </button>
    </article>
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
  const ago = (iso: string) => {
    const m = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min` : `vor ${Math.floor(m / 60)} h`;
  };
  return (
    <section className="card timeline-card">
      <h2>Heute</h2>
      {rhythm && main && <DayRhythmChart rhythm={rhythm} onPick={(id) => navigate(`/t/${main.id}/entry/${id}`)} />}
      <ul className="timeline">
        {(showAll ? items : items.slice(0, 4)).map(({ e, t }) => (
          <li key={e.id} style={{ '--accent': t.color } as React.CSSProperties}>
            <button className="tl-item" onClick={() => navigate(`/t/${t.id}/entry/${e.id}`)}>
              <span className="tl-icon">{t.icon}</span>
              <span className="tl-body">
                <strong>{t.name}</strong>
                <small className="muted">{formatClock(new Date(e.timestamp))} ({ago(e.timestamp)})</small>
                <ValuePills tracker={t} entry={e} limit={4} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > 4 && (
        <button className="btn ghost small show-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Weniger zeigen' : `Alle ${items.length} Einträge von heute zeigen`}
        </button>
      )}
    </section>
  );
}

/** Tracker nach Kategorie gruppiert (nur wenn es mehrere Kategorien gibt). */
export function TrackerGroups({ trackers, now }: { trackers: Tracker[]; now: Date }) {
  const groups = new Map<string, Tracker[]>();
  for (const t of trackers) {
    const k = t.category.trim() || 'Ohne Kategorie';
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  if (groups.size <= 1 || trackers.length < 4) {
    return (
      <div className="tracker-grid">
        {trackers.map((t) => <TrackerCard key={t.id} tracker={t} now={now} />)}
      </div>
    );
  }
  return (
    <>
      {[...groups].map(([name, ts]) => (
        <details key={name} className="tracker-group" open>
          <summary>
            {name} <small className="muted">{ts.length}</small>
          </summary>
          <div className="tracker-grid">
            {ts.map((t) => <TrackerCard key={t.id} tracker={t} now={now} />)}
          </div>
        </details>
      ))}
    </>
  );
}
