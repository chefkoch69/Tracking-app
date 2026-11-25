import { MOODS } from '../../core/diary/feedback';
import { weekReview } from '../../core/diary/week';
import { fmtLevel } from '../../core/fields/fieldTypes';
import { parseDayKey } from '../../core/model/dates';
import { useStore } from '../../state/store';
import { navigate } from '../../app/router';

const moodIcon = (m: number | null) => (m === null ? null : MOODS.find((x) => x.value === Math.round(m))?.icon);
const weekday = (k: string) => parseDayKey(k).toLocaleDateString('de-DE', { weekday: 'long' });

/** Diese Woche bis heute im Vergleich zu denselben Tagen der Vorwoche. */
export function WeekReviewCard() {
  const { data } = useStore();
  const trackers = data.trackers.filter((t) => !t.archived && !t.demo);
  const r = weekReview(trackers, data.entries, new Date(), data.days, data.health);
  if (!r.logged && r.mood === null) return null;
  const top = r.symptoms.slice(0, 4);
  return (
    <section className="card week-card">
      <div className="section-head">
        <h2>Diese Woche</h2>
        <small className="muted">vs. gleiche Tage der Vorwoche</small>
      </div>
      <div className="wk-stats">
        <div>
          <b>
            {r.logged}/{r.span}
          </b>
          <small>Tage eingetragen</small>
        </div>
        {r.mood !== null && (
          <div>
            <b>
              {moodIcon(r.mood)} {fmtLevel(Math.round(r.mood * 10) / 10)}
            </b>
            <small>
              Stimmung{r.prevMood !== null ? ` (vorher ${fmtLevel(Math.round(r.prevMood * 10) / 10)})` : ''}
            </small>
          </div>
        )}
        {r.sleep !== null && (
          <div>
            <b>{fmtLevel(Math.round(r.sleep * 10) / 10)} h</b>
            <small>Schlaf{r.prevSleep !== null ? ` (vorher ${fmtLevel(Math.round(r.prevSleep * 10) / 10)} h)` : ''}</small>
          </div>
        )}
      </div>
      {top.length > 0 && (
        <ul className="wk-symptoms">
          {top.map((s) => (
            <li key={s.label} className={s.direction}>
              <span>{s.label}</span>
              <span className="wk-days">
                {s.days} {s.days === 1 ? 'Tag' : 'Tage'}
                <small> statt {s.prevDays}</small>
              </span>
              <b>{s.direction === 'better' ? '▼ besser' : s.direction === 'worse' ? '▲ mehr' : '≈ gleich'}</b>
            </li>
          ))}
        </ul>
      )}
      {(r.best || r.worst) && (
        <p className="wk-days-line">
          {r.best && (
            <button className="linkish" onClick={() => navigate(`/data?d=${r.best}`)}>
              Bester Tag: {weekday(r.best)}
            </button>
          )}
          {r.worst && r.worst !== r.best && (
            <button className="linkish" onClick={() => navigate(`/data?d=${r.worst}`)}>
              Schwerster Tag: {weekday(r.worst)}
            </button>
          )}
        </p>
      )}
    </section>
  );
}
