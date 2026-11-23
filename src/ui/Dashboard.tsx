import { useMemo } from 'react';
import { generateDemo } from '../core/demo';
import { WakeChip } from './HealthPanel';
import { withHealth } from '../core/health';
import { askConfirm } from './confirm';
import { bucketize, consistencyScore, currentStreak, entriesOf, numericFields, series } from '../core/analytics';
import { ConsistencyRing } from './ConsistencyRing';
import { addDays, dayKey, formatClock, startOfDay } from '../core/dates';
import { aggregationOf } from '../core/fieldTypes';
import { computeInsights } from '../core/insights';
import { daySlotStatus, describeSchedule, nextSlot, slotKey } from '../core/schedule';
import type { Tracker } from '../core/types';
import { useStore } from '../state/store';
import { combinedDayState, WeekStrip } from './Adherence';
import { Sparkline } from './charts/Charts';
import { InsightList } from './Insights';
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
  const archived = data.trackers.filter((t) => t.archived);
  const insights = useMemo(() => {
    const all = withHealth(data);
    return computeInsights(all.trackers, all.entries, new Date());
  }, [data]);

  if (!data.trackers.length) {
    return (
      <div className="page">
        <section className="hero-band">
          <div className="hero-inner center">
            <h1 className="display">Dein persönliches Datensystem</h1>
            <p className="hero-lead">
              Nicht die App entscheidet, was getrackt wird – du entscheidest. Baue dir deinen eigenen Tracker aus Skalen,
              Messwerten, Auswahlfeldern, Körperkarte und mehr.
            </p>
            <div className="actions center">
              <button className="btn white big" onClick={() => navigate('/new')}>＋ Ersten Tracker bauen</button>
              <button className="btn outline-white big" onClick={() => dispatch({ type: 'data/merge', ...generateDemo() })}>Mit Beispieldaten ansehen</button>
            </div>
          </div>
        </section>
        <div className="feature-grid">
          {[
            ['🧩', 'Baukasten', 'Zahlen, Skalen, Messwerte, Auswahl, Zeiträume, Körperkarte – frei kombinierbar.'],
            ['⏰', 'Erinnerungen', 'Feste Zeiten oder Intervalle, Wiederholung, Schlummern und Überspringen.'],
            ['📈', 'Auswertungen', 'Verläufe, Kalender, Rekorde, Zusammenhänge und was dir wirklich hilft.'],
            ['🩺', 'Arztbericht', 'Druckbare Tabelle wie ein Papiertagebuch – mit einem Tipp.'],
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

  const allSlots = active.flatMap((t) => daySlotStatus(t, data.entries, now));
  const doneToday = allSlots.filter((s) => s.done).length;

  return (
    <div className="page">
      <section className="hero-band">
        <div className="hero-inner">
          <p className="hero-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="display">{greeting(now)}</h1>
          <p className="hero-lead">
            {allSlots.length
              ? `${doneToday} von ${allSlots.length} geplanten Einträgen heute erledigt`
              : `${active.length} ${active.length === 1 ? 'Tracker' : 'Tracker'} aktiv`}
          </p>
          <div className="hero-cta">
            <button className="btn white" onClick={() => navigate('/now')}>⚡ Wie geht’s dir gerade?</button>
            <button className="btn outline-white" onClick={() => navigate('/arzt')}>🩺 Arztbericht</button>
          </div>
          <WakeChip now={now} />
          <WeekStrip now={now} state={(d) => combinedDayState(active, data.entries, d, now)} />
        </div>
      </section>

      {data.trackers.some((t) => t.demo) && (
        <div className="demo-banner">
          <span>
            <b>Beispieldaten</b> · Die mit „(Demo)“ markierten Tracker sind erfundene Beispiele zum Ausprobieren.
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
                <button className="btn primary small" onClick={() => navigate(`/t/${tracker.id}/entry`)}>Jetzt eintragen</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="section-head">
        <h2>Meine Tracker</h2>
        <button className="btn primary" onClick={() => navigate('/new')}>＋ Neuer Tracker</button>
      </div>
      <TrackerGroups trackers={active} now={now} />

      {insights.length > 0 && (
        <section className="card">
          <div className="section-head">
            <h2>Was hilft wirklich?</h2>
            <small className="muted">automatisch aus deinen Daten</small>
          </div>
          <InsightList insights={insights} showTracker />
        </section>
      )}

      <TodayTimeline trackers={active} now={now} />

      {archived.length > 0 && (
        <details className="archived">
          <summary>Archiviert ({archived.length})</summary>
          <div className="tracker-grid">
            {archived.map((t) => (
              <TrackerCard key={t.id} tracker={t} now={now} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TrackerCard({ tracker, now }: { tracker: Tracker; now: Date }) {
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

function TodayTimeline({ trackers, now }: { trackers: Tracker[]; now: Date }) {
  const { data } = useStore();
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
      <ul className="timeline">
        {items.map(({ e, t }) => (
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
    </section>
  );
}

/** Tracker nach Kategorie gruppiert (nur wenn es mehrere Kategorien gibt). */
function TrackerGroups({ trackers, now }: { trackers: Tracker[]; now: Date }) {
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
