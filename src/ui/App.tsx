import { useStore } from '../state/store';
import { Dashboard } from './Dashboard';
import { EntryForm } from './EntryForm';
import { useReminderEngine } from './reminders';
import { navigate, useRoute } from './router';
import { Settings } from './Settings';
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
        page = <EntryForm key={route.entryId ?? 'new'} tracker={tracker!} entry={entry} />;
        break;
      }
      case 'settings':
        page = <Settings />;
        break;
    }
  }

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="logo">◧</span> Build Your Own Tracker
        </a>
        <nav>
          <a href="#/" className={route.name === 'dashboard' ? 'active' : ''}>Übersicht</a>
          <a href="#/new" className={route.name === 'new' ? 'active' : ''}>Neu</a>
          <a href="#/settings" className={route.name === 'settings' ? 'active' : ''} aria-label="Einstellungen">⚙</a>
        </nav>
      </header>
      <main>{page}</main>
    </>
  );
}
