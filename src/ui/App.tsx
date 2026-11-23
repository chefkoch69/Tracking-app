import { useStore } from '../state/store';
import { ConfirmHost } from './confirm';
import { Dashboard } from './Dashboard';
import { EntryForm } from './EntryForm';
import { useReminderEngine } from './reminders';
import { navigate, useRoute } from './router';
import { Settings } from './Settings';
import { DataTable } from './DataTable';
import { TrackerBuilder } from './TrackerBuilder';
import { TrackerDetail } from './TrackerDetail';

export function App() {
  useReminderEngine();
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
        <nav>
          <a href="#/" className={route.name === 'dashboard' ? 'active' : ''}>Übersicht</a>
          <a href="#/data" className={route.name === 'data' ? 'active' : ''}>Daten</a>
          <a href="#/new" className={route.name === 'new' ? 'active' : ''}>Neu</a>
          <a href="#/settings" className={route.name === 'settings' ? 'active' : ''} aria-label="Einstellungen">⚙</a>
        </nav>
      </header>
      <main>{page}</main>
      <ConfirmHost />
    </>
  );
}
