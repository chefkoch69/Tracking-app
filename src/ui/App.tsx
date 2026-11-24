import { useStore } from '../state/store';
import { SyncBadge } from './cloudSync';
import { QuickPage } from './QuickPage';
import { DoctorReport } from './DoctorReport';
import { HealthImportPage } from './HealthPanel';
import { ConfirmHost } from './confirm';
import { Dashboard } from './Dashboard';
import { EntryForm } from './EntryForm';
import { useReminderEngine } from './reminders';
import { goBack, navigate, useRoute, type Route } from './router';
import { TabBar, TopNav, useTypingClass } from './Nav';
import { Settings, SETTINGS_TITLES } from './Settings';
import { DiaryPage } from './DiaryPage';
import { ExperimentsPage } from './ExperimentsPage';
import { useAutoUpgrade } from './autoUpgrade';
import { useHealthInbox } from './healthInbox';
import { TrackerBuilder } from './TrackerBuilder';
import { TrackerDetail } from './TrackerDetail';

export function App() {
  useReminderEngine();
  useTypingClass();
  useAutoUpgrade();
  useHealthInbox();
  const route = useRoute();
  const { data } = useStore();
  const tracker = 'id' in route ? data.trackers.find((t) => t.id === route.id) : undefined;

  const sub = subPage(route, tracker?.name);
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
        page = <QuickPage key={route.at ?? 'now'} talk={route.talk} moment={route.moment} at={route.at} />;
        break;
      case 'try':
        page = <ExperimentsPage />;
        break;
      case 'doctor':
        page = <DoctorReport />;
        break;
      case 'data':
        page = <DiaryPage key={route.day ?? 'all'} day={route.day} />;
        break;
      case 'health':
        page = <HealthImportPage payload={route.payload} />;
        break;
      case 'settings':
        page = <Settings key={route.sub ?? 'main'} sub={route.sub} />;
        break;
    }
  }

  return (
    <>
      <header className="topbar no-print">
        <a href="#/" className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 512 512" width="24" height="24"><rect width="512" height="512" rx="120" fill="currentColor" /><path d="M256 404 L130 282 C92 245 90 183 130 149 C170 115 224 124 256 166 C288 124 342 115 382 149 C422 183 420 245 382 282 Z" fill="#fff" /><path d="M154 262 H212 L234 218 L264 306 L290 238 L304 262 H358" fill="none" stroke="currentColor" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="brand-text">Mein Befinden</span>
        </a>
        <TopNav route={route} />
        <SyncBadge />
      </header>
      {sub && (
        <div className="backbar no-print">
          <button className="back-btn" onClick={() => goBack(sub.fallback)} aria-label="Zurück">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
            <span>{sub.backLabel}</span>
          </button>
          <span className="backbar-title">{sub.title}</span>
        </div>
      )}
      <main className={sub ? 'has-back' : ''}>{page}</main>
      <TabBar route={route} />
      <ConfirmHost />
    </>
  );
}

/** Unterseiten bekommen oben eine Leiste mit „Zurück“ – Hauptseiten (Tabs) nicht. */
function subPage(route: Route, trackerName?: string): { title: string; backLabel: string; fallback: string } | null {
  switch (route.name) {
    case 'now':
      return { title: route.talk ? 'Erzählen' : 'Eintragen', backLabel: 'Zurück', fallback: '/' };
    case 'entry':
      return { title: route.entryId ? 'Eintrag bearbeiten' : 'Neuer Eintrag', backLabel: 'Zurück', fallback: '/' };
    case 'data':
      return route.day ? { title: 'Tag', backLabel: 'Zurück', fallback: '/data' } : null;
    case 'tracker':
      return { title: trackerName ?? 'Tracker', backLabel: 'Zurück', fallback: '/settings/tracker' };
    case 'edit':
      return { title: 'Felder anpassen', backLabel: 'Zurück', fallback: '/settings/tracker' };
    case 'new':
      return { title: 'Neuer Tracker', backLabel: 'Zurück', fallback: '/settings/tracker' };
    case 'doctor':
      return { title: 'Arzttermin & Bericht', backLabel: 'Zurück', fallback: '/settings' };
    case 'health':
      return { title: 'Apple Health', backLabel: 'Zurück', fallback: '/' };
    case 'settings':
      return route.sub ? { title: SETTINGS_TITLES[route.sub] ?? 'Einstellungen', backLabel: 'Zurück', fallback: '/settings' } : null;
    default:
      return null;
  }
}
