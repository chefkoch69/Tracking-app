import { useState } from 'react';
import { entriesOf } from '../../core/analytics';
import { dayKey, formatDay, parseDayKey } from '../../core/dates';
import type { Entry, Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { EntryCard, NoData } from './shared';

const PAGE = 30;

export function HistoryView({ tracker }: { tracker: Tracker }) {
  const { data } = useStore();
  const [limit, setLimit] = useState(PAGE);
  const entries = entriesOf(tracker, data.entries).reverse();
  if (!entries.length) return <NoData tracker={tracker} />;

  const groups = new Map<string, Entry[]>();
  for (const e of entries.slice(0, limit)) {
    const k = dayKey(new Date(e.timestamp));
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return (
    <div className="history">
      {[...groups].map(([k, es]) => (
        <section key={k}>
          <h3 className="day-head">
            {formatDay(parseDayKey(k))} <small className="muted">{es.length} {es.length === 1 ? 'Eintrag' : 'Einträge'}</small>
          </h3>
          {es.map((e) => (
            <EntryCard key={e.id} tracker={tracker} entry={e} />
          ))}
        </section>
      ))}
      {entries.length > limit && (
        <button className="btn" onClick={() => setLimit(limit + PAGE)}>Ältere Einträge laden</button>
      )}
    </div>
  );
}
