import { entriesOf } from '../core/analytics';
import { askConfirm } from './confirm';
import { saveFile } from './save';
import { describeSchedule } from '../core/schedule';
import { exportCsv } from '../core/storage';
import type { Tracker, ViewType } from '../core/types';
import { useStore } from '../state/store';
import { navigate } from './router';
import { VIEW_INFO } from './TrackerBuilder';
import { CalendarView } from './views/CalendarView';
import { ChartView } from './views/ChartView';
import { CompareView } from './views/CompareView';
import { DailyView } from './views/DailyView';
import { HistoryView } from './views/HistoryView';
import { ReportView } from './views/ReportView';
import { StatsView } from './views/StatsView';
import { DataTable } from './DataTable';

const VIEW_COMPONENTS: Record<ViewType, (p: { tracker: Tracker }) => React.ReactNode> = {
  history: HistoryView,
  chart: ChartView,
  calendar: CalendarView,
  stats: StatsView,
  daily: DailyView,
  compare: CompareView,
  report: ReportView,
  table: ({ tracker }) => <DataTable key={tracker.id} fixedTracker={tracker} />,
};

export function TrackerDetail({ tracker, view }: { tracker: Tracker; view?: string }) {
  const { data, dispatch } = useStore();
  const entries = entriesOf(tracker, data.entries);
  // "Tabelle" ist immer verfügbar – auch für Tracker, die vor dieser Ansicht angelegt wurden.
  const base = tracker.views.length ? tracker.views : (['history'] as ViewType[]);
  const views = base.includes('table') ? base : [...base, 'table' as ViewType];
  const active = (views.includes(view as ViewType) ? view : views[0]) as ViewType;
  const View = VIEW_COMPONENTS[active];

  const remove = async () => {
    if (await askConfirm(`Tracker „${tracker.name}“ und alle ${entries.length} Einträge endgültig löschen?`, { okLabel: 'Tracker löschen' })) {
      dispatch({ type: 'tracker/delete', id: tracker.id });
      navigate('/');
    }
  };

  return (
    <div className="page" style={{ '--accent': tracker.color } as React.CSSProperties}>
      <section className="hero-band tinted no-print">
        <div className="hero-inner">
          <button className="back linkish" onClick={() => navigate('/')}>‹ Übersicht</button>
          <div className="detail-head">
            <span className="detail-icon">{tracker.icon}</span>
            <div>
              <h1>{tracker.name}</h1>
              <p className="hero-lead">
                {tracker.description && <>{tracker.description}<br /></>}
                {describeSchedule(tracker.schedule)} · {entries.length} Einträge
              </p>
            </div>
          </div>
          <button className="btn white" onClick={() => navigate(`/t/${tracker.id}/entry`)}>＋ Eintrag erfassen</button>
        </div>
      </section>

      <nav className="tabs no-print" role="tablist">
        {views.map((v) => (
          <button key={v} role="tab" aria-selected={v === active} className={v === active ? 'active' : ''} onClick={() => navigate(`/t/${tracker.id}/${v}`)}>
            {VIEW_INFO[v].label}
          </button>
        ))}
      </nav>

      <View tracker={tracker} />

      <div className="actions tracker-actions no-print">
        <button className="btn ghost" onClick={() => navigate(`/t/${tracker.id}/edit`)}>Tracker bearbeiten</button>
        <button className="btn ghost" onClick={() => void saveFile(`${tracker.name}.csv`, exportCsv(tracker, entries), 'text/csv;charset=utf-8')}>
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
