import { useState } from 'react';
import { entriesOf } from '../../../core/analysis/analytics';
import { dayKey, formatDay, parseDayKey, entryDay } from '../../../core/model/dates';
import type { Entry, Tracker } from '../../../core/model/types';
import { useStore } from '../../../state/store';
import { EntryCard, NoData } from '../../../components/entryViews';

const PAGE = 20;

function dayTitle(key: string): string {
  const today = dayKey(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return 'Heute';
  if (key === dayKey(y)) return 'Gestern';
  return formatDay(parseDayKey(key));
}

/** Verlauf als Timeline, gruppiert nach Tagen. */
export function HistoryView({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
  const [limit, setLimit] = useState(PAGE);
  const entries = entriesOf(tracker, data.entries).reverse();
  if (!entries.length) return <NoData tracker={tracker} />;

  const groups = new Map<string, Entry[]>();
  for (const e of entries.slice(0, limit)) {
    const k = entryDay(e.timestamp);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return (
    <div className="history">
      {[...groups].map(([k, es]) => (
        <section key={k} className="day-group">
          <h3 className="day-head">
            {dayTitle(k)} <small className="muted">{es.length} {es.length === 1 ? 'Eintrag' : 'Einträge'}</small>
          </h3>
          <div className="timeline-rail">
            {es.map((e) => (
              <EntryCard key={e.id} tracker={tracker} entry={e} />
            ))}
          </div>
        </section>
      ))}
      {entries.length > limit && (
        <button className="btn" onClick={() => setLimit(limit + PAGE)}>Ältere Einträge laden</button>
      )}
    </div>
  );
}
