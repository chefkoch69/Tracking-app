import { useEffect, useRef, useState } from 'react';
import { SyncInfo, useSyncStatus } from '../../platform/cloudSync';
import { HealthSettings } from './HealthPanel';
import { dayKey, parseDayKey } from '../../core/model/dates';
import { saveFile } from '../../platform/save';
import { askConfirm } from '../../components/confirm';
import { IS_WORKER } from '../../app/env';
import { emptyData, exportJson, normalize } from '../../core/model/storage';
import { useStore } from '../../state/store';
import { navigate } from '../../app/router';

export const SETTINGS_TITLES: Record<string, string> = {
  tracker: 'Felder & Tracker',
  health: 'Apple Health & Armband',
  data: 'Daten & Sicherung',
};

/**
 * Einstellungen: eine kurze, gegliederte Liste. Alles mit Erklärungen liegt eine Ebene tiefer,
 * damit die Hauptseite übersichtlich bleibt.
 */
export function SettingsPage({ sub }: { sub?: string }) {
  const { data, dispatch } = useStore();
  const sync = useSyncStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const online = sync.status !== 'local';
  const own = data.trackers.filter((t) => !t.demo);

  const onImport = async (file: File) => {
    try {
      const imported = normalize(JSON.parse(await file.text()));
      if (!(await askConfirm(`${imported.trackers.length} Tracker und ${imported.entries.length} Einträge aus der Datei übernehmen? Deine jetzigen Daten werden dabei ersetzt.`, { okLabel: 'Übernehmen' }))) return;
      dispatch({ type: 'data/replace', data: imported });
      setMsg('Sicherung übernommen.');
    } catch (e) {
      setMsg(`Die Datei ließ sich nicht lesen: ${(e as Error).message}`);
    }
  };

  if (sub === 'health')
    return (
      <div className="page">
        <HealthSettings />
      </div>
    );

  if (sub === 'tracker')
    return (
      <div className="page">
      <section className="card">
        <div className="section-head">
          <h2>Deine Tracker</h2>
          <button className="btn small" onClick={() => navigate('/new')}>＋ Neuen bauen</button>
        </div>
        {data.trackers.length ? (
          <ul className="tracker-list">
            {data.trackers.map((t) => (
              <li key={t.id}>
                <button className="linkish tl-name" onClick={() => navigate(`/t/${t.id}`)}>
                  <span aria-hidden>{t.icon}</span> {t.name}
                  {t.archived && <small className="muted"> · archiviert</small>}
                </button>
                <button className="btn ghost small" onClick={() => navigate(`/t/${t.id}/edit`)}>Felder ändern</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Noch keine Tracker.</p>
        )}
        <p className="muted small">Im Baukasten kannst du Felder hinzufügen, umbenennen, verschieben oder ausblenden – deine Einträge bleiben dabei erhalten.</p>
      </section>
      </div>
    );

  if (sub === 'data')
    return (
      <div className="page">
      <section className="card">
        <h2>Wo deine Daten liegen</h2>
        <SyncInfo />
        {IS_WORKER ? (
          <>
            <DbStatus />
            <p className="muted">
              Deine Einträge liegen in einer eigenen Datenbank in deinem kostenlosen Cloudflare-Konto (Rechenzentrum in Westeuropa) –
              nur mit deinem Passwort erreichbar und auf all deinen Geräten gleich. Bei jeder Änderung wird die vorige Fassung
              aufgehoben, und Cloudflare kann die ganze Datenbank bis zu 30 Tage zurück wiederherstellen. Eine Kopie bleibt auf diesem
              Gerät, damit die App auch ohne Netz startet.
            </p>
          </>
        ) : online ? (
          <p className="muted">
            Deine Einträge liegen in einem privaten Speicher dieser Seite: Nur du kannst sie lesen und ändern, sie sind auf
            all deinen Geräten gleich und bleiben, auch wenn der Browser-Speicher geleert wird. Wer die Seite geteilt
            bekommt, sieht deine Daten nicht. Wenn du Claude im Chat darum bittest, kann Claude sie auslesen – z. B. für
            einen Arztzettel.
          </p>
        ) : (
          <p className="muted">
            Deine Einträge liegen nur hier auf diesem Gerät – nichts geht an einen Server. Sichere sie ab und zu als Datei
            (unten bei „Sichern &amp; übertragen“), z. B. in iCloud Drive. Löschst du die App vom Home-Bildschirm, sind die Daten weg.
          </p>
        )}
      </section>
      <section className="card">
        <h2>Sichern & übertragen</h2>
        <p className="muted">
          {data.trackers.length} Tracker, {data.entries.length} Einträge. Eine Sicherung als Datei kannst du später hier wieder einlesen.
        </p>
        <div className="actions start">
          <button className="btn" onClick={() => void saveFile(`tracker-sicherung-${new Date().toISOString().slice(0, 10)}.json`, exportJson(data), 'application/json')}>
            Als Datei sichern
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Sicherung einlesen</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
        {msg && <p className="info">{msg}</p>}
      </section>
      <section className="card">
        <h2>Für den Arztbericht</h2>
        <p className="muted">Steht oben im Bericht. Wird mit deinen Einträgen gespeichert.</p>
        <div className="cfg-grid">
          <label className="cfg-row">
            <span>Name</span>
            <input value={data.profile?.name ?? ''} autoComplete="name" onChange={(e) => dispatch({ type: 'profile/update', patch: { name: e.target.value } })} />
          </label>
          <label className="cfg-row">
            <span>Geburtsdatum</span>
            <input type="date" value={data.profile?.birthdate ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { birthdate: e.target.value } })} />
          </label>
        </div>
      </section>
      <section className="card danger-zone">
        <h2>Alles löschen</h2>
        <p className="muted small">{own.length ? 'Löscht alle Tracker und Einträge, auch deine eigenen.' : 'Löscht alle Tracker und Einträge.'}</p>
        <button
          className="btn danger"
          onClick={async () => (await askConfirm('Wirklich ALLE Tracker und Einträge löschen? Das lässt sich nicht rückgängig machen.', { okLabel: 'Alles löschen' })) && dispatch({ type: 'data/replace', data: emptyData() })}
        >
          Alle Daten löschen
        </button>
      </section>
      </div>
    );

  const main = data.trackers.find((t) => t.quick && !t.demo && !t.archived);
  const lastHealth = Object.values(data.health ?? {})
    .filter((h) => h.source === 'health')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const healthStatus = lastHealth
    ? `Verbunden · zuletzt ${lastHealth.date === dayKey(new Date()) ? 'heute' : parseDayKey(lastHealth.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`
    : 'Noch nicht verbunden';
  const appt = data.profile?.appointment;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Einstellungen</h1>
      </header>

      <SettingsGroup title="Tagebuch">
        {main && <Row icon="✏️" title="Felder anpassen" text={`Was „${main.name}“ abfragt`} href={`/t/${main.id}/edit`} />}
      </SettingsGroup>

      <SettingsGroup title="Verbindungen">
        <Row icon="❤️" title="Apple Health & Armband" text={healthStatus} href="/settings/health" />
      </SettingsGroup>

      <SettingsGroup title="Arzt">
        <Row icon="🩺" title="Arzttermin & Bericht" text={appt ? `Termin am ${parseDayKey(appt).toLocaleDateString('de-DE')}` : 'Bericht mit allen Einträgen'} href="/arzt" />
      </SettingsGroup>

      <SettingsGroup title="Daten">
        <Row icon="☁️" title="Daten & Sicherung" text={online ? `${data.entries.length} Einträge · online gespeichert` : `${data.entries.length} Einträge · auf diesem Gerät`} href="/settings/data" />
        {IS_WORKER && <Row icon="↩︎" title="Abmelden" text="Auf diesem Gerät abmelden" link="/logout" />}
      </SettingsGroup>
    </div>
  );
}

/** Was in der Datenbank liegt – direkt vom Server. */
function DbStatus() {
  const [st, setSt] = useState<{ storage: string; docs?: number; lastSaved?: string; versions?: number } | null>(null);
  useEffect(() => {
    fetch('/api/status', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSt)
      .catch(() => setSt(null));
  }, []);
  if (!st) return null;
  if (st.storage !== 'd1') return <p className="info small">Gespeichert im Cloudflare-Speicher.</p>;
  return (
    <ul className="db-status">
      <li>
        <span>Datenbank</span>
        <b>Cloudflare D1 · verbunden ✓</b>
      </li>
      <li>
        <span>Zuletzt gespeichert</span>
        <b>{st.lastSaved ? new Date(st.lastSaved).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}</b>
      </li>
      <li>
        <span>Gespeicherte Wochen</span>
        <b>{Math.max(0, (st.docs ?? 1) - 1)}</b>
      </li>
      <li>
        <span>Frühere Fassungen</span>
        <b>{st.versions ?? 0}</b>
      </li>
    </ul>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="set-group">
      <h2 className="set-group-title">{title}</h2>
      <div className="set-list">{children}</div>
    </section>
  );
}

function Row({ icon, title, text, href, link }: { icon: string; title: string; text?: string; href?: string; link?: string }) {
  const inner = (
    <>
      <span className="set-icon" aria-hidden>{icon}</span>
      <span className="set-text">
        <strong>{title}</strong>
        {text && <small className="muted">{text}</small>}
      </span>
      <span className="set-chev" aria-hidden>›</span>
    </>
  );
  if (link)
    return (
      <a className="set-row" href={link}>
        {inner}
      </a>
    );
  return (
    <button className="set-row" onClick={() => href && navigate(href)}>
      {inner}
    </button>
  );
}
