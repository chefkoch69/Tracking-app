import { bucketize, currentStreak, entriesOf, numericFields, series } from '../core/analytics';
import { addDays, dayKey, formatClock, formatDateTime, startOfDay } from '../core/dates';
import { aggregationOf, formatValue } from '../core/fieldTypes';
import { daySlotStatus, describeSchedule, nextSlot, slotKey } from '../core/schedule';
import type { Tracker } from '../core/types';
import { useStore } from '../state/store';
import { Sparkline } from './charts/Charts';
import { useDueTrackers, useNow } from './reminders';
import { navigate } from './router';

export function Dashboard() {
  const { data, dispatch } = useStore();
  const now = useNow();
  const due = useDueTrackers(now);
  const active = data.trackers.filter((t) => !t.archived);
  const archived = data.trackers.filter((t) => t.archived);

  if (!data.trackers.length) {
    return (
      <div className="page hero">
        <h1>Dein persönliches Datensystem</h1>
        <p className="lead">
          Nicht die App entscheidet, was getrackt wird – <strong>du</strong> entscheidest. Baue dir deinen eigenen Tracker aus
          Zahlen, Skalen, Messwerten, Auswahlfeldern, Checkboxen und Text, lege fest, wann du erinnert werden willst, und
          wähle, wie du deine Daten auswerten möchtest.
        </p>
        <div className="actions center">
          <button className="btn primary big" onClick={() => navigate('/new')}>＋ Ersten Tracker bauen</button>
          <button className="btn big" onClick={() => navigate('/settings')}>Beispieldaten ansehen</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {due.length > 0 && (
        <section className="due">
          {due.map(({ tracker, slot, snoozedUntil }) => (
            <div key={tracker.id} className="due-item" style={{ borderColor: tracker.color }}>
              <span>
                🔔 <strong>{tracker.name}</strong> ist fällig ({formatClock(slot)})
                {snoozedUntil && <small className="muted"> · geschlummert bis {formatClock(snoozedUntil)}</small>}
              </span>
              <span className="inline">
                <button
                  className="btn small ghost"
                  onClick={() =>
                    dispatch({
                      type: 'reminder/update',
                      trackerId: tracker.id,
                      patch: { snooze: { slot: slotKey(slot), until: new Date(now.getTime() + 15 * 60000).toISOString() } },
                    })
                  }
                >
                  +15 Min
                </button>
                <button className="btn small ghost" onClick={() => dispatch({ type: 'reminder/update', trackerId: tracker.id, patch: { skippedSlot: slotKey(slot) } })}>
                  Überspringen
                </button>
                <button className="btn small primary" style={{ background: tracker.color }} onClick={() => navigate(`/t/${tracker.id}/entry`)}>
                  Jetzt eintragen
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="section-head">
        <h1>Meine Tracker</h1>
        <button className="btn primary" onClick={() => navigate('/new')}>＋ Neuer Tracker</button>
      </div>

      <div className="tracker-grid">
        {active.map((t) => (
          <TrackerCard key={t.id} tracker={t} now={now} />
        ))}
      </div>

      <TodayOverview trackers={active} now={now} />

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
    ? (() => {
        const from = dayKey(addDays(startOfDay(now), -29));
        return bucketize(series(main, entries), 'day', aggregationOf(main))
          .filter((b) => b.key >= from)
          .map((b) => b.v);
      })()
    : [];
  const slots = daySlotStatus(tracker, data.entries, now);
  const next = nextSlot(tracker, now);

  return (
    <article className="tracker-card" style={{ '--accent': tracker.color } as React.CSSProperties}>
      <button className="tracker-card-main" onClick={() => navigate(`/t/${tracker.id}`)}>
        <div className="tc-head">
          <span className="tc-icon">{tracker.icon}</span>
          <span className="tc-title">
            <strong>{tracker.name}</strong>
            <small className="muted">{tracker.category || describeSchedule(tracker.schedule)}</small>
          </span>
        </div>
        <div className="tc-stats">
          <span>
            <b>{todayCount}</b>
            <small>heute</small>
          </span>
          <span>
            <b>{streak}</b>
            <small>Tage in Folge</small>
          </span>
          <span>
            <b>{entries.length}</b>
            <small>Einträge</small>
          </span>
        </div>
        {spark.length > 1 && <Sparkline values={spark} color={tracker.color} />}
        <small className="muted tc-foot">
          {last && main ? `Zuletzt: ${formatValue(main, last.values[main.id])} · ` : ''}
          {last ? formatDateTime(new Date(last.timestamp)) : 'Noch keine Einträge'}
          {slots.length > 0 && ` · heute ${slots.filter((s) => s.done).length}/${slots.length}`}
          {next && ` · nächste: ${formatClock(next)}`}
        </small>
      </button>
      <button className="btn quick-add" style={{ background: tracker.color }} onClick={() => navigate(`/t/${tracker.id}/entry`)} aria-label={`${tracker.name}: Eintrag hinzufügen`}>
        ＋
      </button>
    </article>
  );
}

function TodayOverview({ trackers, now }: { trackers: Tracker[]; now: Date }) {
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
  return (
    <section className="card">
      <h2>Heute</h2>
      <ul className="timeline">
        {items.map(({ e, t }) => (
          <li key={e.id}>
            <span className="tl-time">{formatClock(new Date(e.timestamp))}</span>
            <button className="tl-body linkish" onClick={() => navigate(`/t/${t.id}/entry/${e.id}`)}>
              <span style={{ color: t.color }}>{t.icon} {t.name}</span>
              <small className="muted">
                {t.fields
                  .filter((f) => e.values[f.id] !== undefined && formatValue(f, e.values[f.id]) !== '–')
                  .slice(0, 4)
                  .map((f) => `${f.label}: ${formatValue(f, e.values[f.id])}`)
                  .join(' · ')}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
