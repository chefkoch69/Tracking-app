import { useStore } from '../state/store';
import { SyncBadge } from './cloudSync';
import { QuickPage } from './QuickPage';
import { DoctorReport } from './DoctorReport';
import { HealthImportPage } from './HealthPanel';
import { ConfirmHost } from './confirm';
import { Dashboard } from './Dashboard';
import { EntryForm } from './EntryForm';
import { useReminderEngine } from './reminders';
import { navigate, useRoute } from './router';
import { TabBar, TopNav, useTypingClass } from './Nav';
import { Settings } from './Settings';
import { DataTable } from './DataTable';
import { TrackerBuilder } from './TrackerBuilder';
import { TrackerDetail } from './TrackerDetail';

export function App() {
  useReminderEngine();
  useTypingClass();
  const route = useRoute();
  const { data } = useStore();
  const tracker = 'id' in route ? data.trackers.find((t) => t.id === route.id) : undefined;

  let page: React.ReactNode;
  if ('id' in route && !tracker) {
    page = (
      <div className="page empty">
        <p>Dieser Tracker existiert nicht (mehr).</p>
        <button className="btn" onClick={() => navigate('/')}>Zur Übersicht</button>
      </div>
    );
  } else {
    switch (route.name) {
      case 'dashboard':
        page = <Dashboard />;
        break;
      case 'new':
        page = <TrackerBuilder key="new" />;
        break;
      case 'edit':
        page = <TrackerBuilder key={tracker!.id} existing={tracker} />;
        break;
      case 'tracker':
        page = <TrackerDetail tracker={tracker!} view={route.view} />;
        break;
      case 'entry': {
        const entry = route.entryId ? data.entries.find((e) => e.id === route.entryId) : undefined;
        page = <EntryForm key={route.entryId ?? `new-${route.date ?? ''}`} tracker={tracker!} entry={entry} date={route.date} />;
        break;
      }
      case 'now':
        page = <QuickPage talk={route.talk} />;
        break;
      case 'doctor':
        page = <DoctorReport />;
        break;
      case 'data':
        page = (
          <div className="page">
            <section className="hero-band compact">
              <div className="hero-inner">
                <h1>Meine Daten</h1>
                <p className="hero-lead">Alle Einträge auf einen Blick – durchsuchen, sortieren, exportieren. Zeile antippen zum Bearbeiten.</p>
              </div>
            </section>
            <DataTable />
          </div>
        );
        break;
      case 'health':
        page = <HealthImportPage payload={route.payload} />;
        break;
      case 'settings':
        page = <Settings />;
        break;
    }
  }

  return (
    <>
      <header className="topbar no-print">
        <a href="#/" className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" rx="7" fill="currentColor" /><rect x="5.5" y="12" width="3" height="6" rx="1.2" fill="#fff" /><rect x="10.5" y="8.5" width="3" height="9.5" rx="1.2" fill="#fff" /><rect x="15.5" y="5.5" width="3" height="12.5" rx="1.2" fill="#fff" /></svg>
          </span>
          <span className="brand-text">Build Your Own Tracker</span>
        </a>
        <TopNav route={route} />
        <SyncBadge />
      </header>
      <main>{page}</main>
      <TabBar route={route} />
      <ConfirmHost />
    </>
  );
}
