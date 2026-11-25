import { formatClock } from '../core/model/dates';
import { Doodle } from './Doodle';
import { entryStory } from '../core/diary/story';
import type { Entry, Tracker } from '../core/model/types';
import { navigate } from '../app/router';
import { severityColor } from './fieldInputs';

const ICON_COLOR: Record<string, string> = { '☀️': '#F0B43C', '🌙': '#7F8FD6', '🍽': '#E8835F', '🥤': '#5E9FD8', '💊': '#4FAF92', '🤕': '#E06A78', '😊': '#8DBA5E', '📝': '#A584D6' };

/** Ein Eintrag als lesbare Zeile – antippen öffnet ihn zum Bearbeiten (dort auch Löschen). */
export function EntryRow({ tracker, entry, showTracker }: { tracker: Tracker; entry: Entry; showTracker?: boolean }) {
  const s = entryStory(tracker, entry);
  return (
    <li className="entry-row">
      <button className="er-btn" onClick={() => navigate(`/t/${tracker.id}/entry/${entry.id}`)} aria-label={`${formatClock(new Date(entry.timestamp))}: ${s.title} – bearbeiten`}>
        <span className="er-time">{formatClock(new Date(entry.timestamp))}</span>
        <span className="er-icon" style={{ '--cat': ICON_COLOR[s.icon] ?? '#8a8fa8' } as React.CSSProperties}><Doodle name={s.icon} size={22} /></span>
        <span className="er-body">
          <strong className="er-title">
            {showTracker ? `${tracker.name}: ` : ''}
            {s.title}
          </strong>
          {s.symptoms.length > 0 && (
            <span className="er-symptoms">
              {s.symptoms.map((x) => (
                <span key={x.label} className="er-sym">
                  <b style={{ background: severityColor(x.level) }}>{x.text.split(' · ')[0]}</b>
                  {x.label}
                  {x.details.length > 0 && <small> · {x.details.join(', ')}</small>}
                </span>
              ))}
            </span>
          )}
          {s.facts.length > 0 && <small className="er-facts">{s.facts.join(' · ')}</small>}
          {s.none.length > 0 && <small className="er-none">✓ keine: {s.none.join(', ')}</small>}
          {s.note && <small className="er-note">„{s.note}“</small>}
        </span>
        <span className="er-chev" aria-hidden>›</span>
      </button>
    </li>
  );
}
