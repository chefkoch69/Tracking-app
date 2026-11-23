import { appointmentLabel, daysUntil, insightReadiness, questionList } from '../core/feedback';
import { dayKey, parseDayKey } from '../core/dates';
import { useStore } from '../state/store';
import { navigate } from './router';

/**
 * Das Ziel im Blick: Wann ist der Termin, wie viel ist schon gesammelt,
 * welche Fragen sind notiert – und der Bericht ist einen Tipp entfernt.
 */
export function AppointmentCard({ now }: { now: Date }) {
  const { data, dispatch } = useStore();
  const date = data.profile?.appointment;
  const n = date ? daysUntil(date, now) : null;
  const questions = questionList(data.profile?.questions);
  const ready = insightReadiness(data.trackers, data.entries, now);
  const setDate = (v: string) => dispatch({ type: 'profile/update', patch: { appointment: v || undefined } });
  const upcoming = n !== null && n >= -1;

  if (!date || !upcoming) {
    return (
      <section className="card appt-card">
        <div className="appt-head">
          <span className="appt-icon" aria-hidden>🩺</span>
          <div>
            <h2>Arzttermin</h2>
            <p className="muted small">
              {date ? `Dein letzter Termin ${appointmentLabel(date, now)}. ` : ''}
              Trag den nächsten Termin ein: Die App zählt die Tage, sammelt deine Fragen und hat den Bericht fertig.
            </p>
          </div>
        </div>
        <div className="appt-row">
          <label className="appt-date">
            <span>Nächster Termin</span>
            <input type="date" min={dayKey(now)} value="" onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn" onClick={() => navigate('/arzt')}>Bericht ansehen</button>
        </div>
      </section>
    );
  }

  const when = parseDayKey(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section className="card appt-card active">
      <div className="appt-head">
        <span className="appt-count" aria-hidden>
          {n! > 0 ? <><b>{n}</b><small>{n === 1 ? 'Tag' : 'Tage'}</small></> : <b className="appt-today">{n === 0 ? 'Heute' : '✓'}</b>}
        </span>
        <div>
          <h2>Arzttermin {appointmentLabel(date, now)}</h2>
          <p className="muted small">
            {when} · an {ready.days} {ready.days === 1 ? 'Tag' : 'Tagen'} eingetragen (letzte 4 Wochen)
          </p>
        </div>
      </div>
      <ul className="appt-checks">
        <li className={ready.days >= 7 ? 'done' : ''}>
          {ready.days >= 7 ? 'Genug Tage für einen aussagekräftigen Verlauf' : `Noch ${ready.need - ready.days} ${ready.need - ready.days === 1 ? 'Tag' : 'Tage'} eintragen für einen aussagekräftigen Verlauf`}
        </li>
        <li className={questions.length ? 'done' : ''}>
          {questions.length ? `${questions.length} ${questions.length === 1 ? 'Frage' : 'Fragen'} notiert` : 'Fragen für den Termin notieren'}
        </li>
      </ul>
      <div className="appt-row">
        <button className="btn primary" onClick={() => navigate('/arzt')}>Bericht & Fragen</button>
        <label className="appt-date compact">
          <span className="sr-only">Termin ändern</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
    </section>
  );
}
