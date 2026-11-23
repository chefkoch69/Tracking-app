import { entriesOf } from '../core/analytics';
import { describeSchedule } from '../core/schedule';
import { download, exportCsv } from '../core/storage';
import type { Tracker, ViewType } from '../core/types';
import { useStore } from '../state/store';
import { navigate } from './router';
import { VIEW_INFO } from './TrackerBuilder';
import { CalendarView } from './views/CalendarView';
import { ChartView } from './views/ChartView';
import { CompareView } from './views/CompareView';
import { DailyView } from './views/DailyView';
import { HistoryView } from './views/HistoryView';
import { StatsView } from './views/StatsView';

const VIEW_COMPONENTS: Record<ViewType, (p: { tracker: Tracker }) => React.ReactNode> = {
  history: HistoryView,
  chart: ChartView,
  calendar: CalendarView,
  stats: StatsView,
  daily: DailyView,
  compare: CompareView,
};

export function TrackerDetail({ tracker, view }: { tracker: Tracker; view?: string }) {
  const { data, dispatch } = useStore();
  const entries = entriesOf(tracker, data.entries);
  const views = tracker.views.length ? tracker.views : (['history'] as ViewType[]);
  const active = (views.includes(view as ViewType) ? view : views[0]) as ViewType;
  const View = VIEW_COMPONENTS[active];

  const remove = () => {
    if (confirm(`Tracker „${tracker.name}“ und alle ${entries.length} Einträge endgültig löschen?`)) {
      dispatch({ type: 'tracker/delete', id: tracker.id });
      navigate('/');
    }
  };

  return (
    <div className="page" style={{ '--accent': tracker.color } as React.CSSProperties}>
      <div className="section-head">
        <div>
          <h1>
            {tracker.icon} {tracker.name}
          </h1>
          <p className="muted">
            {tracker.description && <>{tracker.description} · </>}
            {describeSchedule(tracker.schedule)} · {entries.length} Einträge
          </p>
        </div>
        <button className="btn primary" style={{ background: tracker.color }} onClick={() => navigate(`/t/${tracker.id}/entry`)}>
          ＋ Eintrag
        </button>
      </div>

      <nav className="tabs" role="tablist">
        {views.map((v) => (
          <button key={v} role="tab" aria-selected={v === active} className={v === active ? 'active' : ''} onClick={() => navigate(`/t/${tracker.id}/${v}`)}>
            {VIEW_INFO[v].label}
          </button>
        ))}
      </nav>

      <View tracker={tracker} />

      <div className="actions tracker-actions">
        <button className="btn ghost" onClick={() => navigate(`/t/${tracker.id}/edit`)}>Tracker bearbeiten</button>
        <button className="btn ghost" onClick={() => download(`${tracker.name}.csv`, exportCsv(tracker, entries), 'text/csv;charset=utf-8')}>
          CSV exportieren
        </button>
        <button className="btn ghost" onClick={() => dispatch({ type: 'tracker/archive', id: tracker.id, archived: !tracker.archived })}>
          {tracker.archived ? 'Wiederherstellen' : 'Archivieren'}
        </button>
        <button className="btn ghost danger" onClick={remove}>Löschen</button>
      </div>
    </div>
  );
}
