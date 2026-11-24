import { useRef, useState } from 'react';
import { SyncInfo, useSyncStatus } from './cloudSync';
import { HealthSettings } from './HealthPanel';
import { copyText, saveFile } from './save';
import { askConfirm, notify } from './confirm';
import { IS_ARTIFACT, IS_WORKER } from './env';
import { generateDemo } from '../core/demo';
import { emptyData, exportJson, normalize } from '../core/storage';
import { useStore } from '../state/store';
import { notificationsSupported, requestNotificationPermission } from './reminders';
import { navigate } from './router';

/** „Mehr“: Feedback, eigene Tracker, Gesundheitsdaten, Erinnerungen, Speicher und Sicherung. */
export function Settings() {
  const { data, dispatch } = useStore();
  const sync = useSyncStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'unsupported');
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

  return (
    <div className="page">
      <section className="hero-band compact">
        <div className="hero-inner">
          <h1>Mehr</h1>
          <p className="hero-lead">Arzttermin, Armband-Daten, Felder anpassen und wo deine Daten liegen.</p>
        </div>
      </section>

      <section className="more-links">
        <button className="card more-link" onClick={() => navigate('/arzt')}>
          <span className="ml-icon" aria-hidden>🩺</span>
          <span>
            <strong>Arzttermin & Bericht</strong>
            <small className="muted">Termin, Fragen, Zusammenfassung und Bericht mit allen Einträgen</small>
          </span>
          <span aria-hidden>›</span>
        </button>
        <a className="card more-link" href="#health-settings">
          <span className="ml-icon" aria-hidden>❤️</span>
          <span>
            <strong>Schlaf & Bewegung vom Armband</strong>
            <small className="muted">Apple Health / Amazfit: Aufwachzeit, Schlaf, Schritte übernehmen</small>
          </span>
          <span aria-hidden>›</span>
        </a>
      </section>


      <section className="card">
        <div className="section-head">
          <h2>Felder & Tracker anpassen</h2>
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

      <HealthSettings />

      <section className="card">
        <h2>Erinnerungen</h2>
        {IS_ARTIFACT ? (
          <p className="muted">
            In claude.ai darf die Seite keine Mitteilungen aufs Handy schicken. Fällige Einträge siehst du oben in der
            Übersicht, sobald du die App öffnest. Für feste Zeiten hilft ein Wecker oder eine Erinnerung in der
            Erinnerungen-App deines iPhones.
          </p>
        ) : (
          <>
            <p className="muted">
              Mitteilungen der App kommen nur, solange sie geöffnet ist. Zuverlässig erinnert dich dein Kalender – z. B. um 9, 14
              und 20 Uhr: „Befinden eintragen“.
            </p>
            <p>
              Mitteilungen:{' '}
              <b>{perm === 'granted' ? 'erlaubt ✓' : perm === 'denied' ? 'blockiert – in den Browser-Einstellungen freigeben' : perm === 'unsupported' ? 'hier nicht möglich' : 'noch nicht erlaubt'}</b>
            </p>
            {perm === 'default' && (
              <button className="btn primary" onClick={async () => setPerm(await requestNotificationPermission())}>
                Mitteilungen erlauben
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Wo deine Daten liegen</h2>
        <SyncInfo />
        {IS_WORKER ? (
          <>
            <p className="muted">
              Deine Einträge liegen in deinem eigenen, kostenlosen Cloudflare-Konto – nur mit deinem Passwort erreichbar und auf
              all deinen Geräten gleich. Zusätzlich bleibt eine Kopie auf diesem Gerät, damit die App auch ohne Netz startet.
            </p>
            <div className="actions start">
              <a className="btn" href="/logout">Abmelden</a>
            </div>
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

      <section className="card">
        <h2>Sichern & übertragen</h2>
        <p className="muted">
          {data.trackers.length} Tracker, {data.entries.length} Einträge. Eine Sicherung als Datei kannst du später hier wieder einlesen.
        </p>
        <div className="actions start">
          <button className="btn" onClick={() => void saveFile(`tracker-sicherung-${new Date().toISOString().slice(0, 10)}.json`, exportJson(data), 'application/json')}>
            Als Datei sichern
          </button>
          <button
            className="btn"
            onClick={async () => {
              const json = exportJson(data);
              if (await copyText(json)) await notify('Alle Daten kopiert. Du kannst sie z. B. in den Chat mit Claude einfügen.');
              else await notify('Die Zwischenablage ist hier gesperrt. Markiere den Text und kopiere ihn selbst:', json);
            }}
          >
            Alles kopieren
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Sicherung einlesen</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
        {msg && <p className="info">{msg}</p>}
      </section>

      <section className="card">
        <h2>Beispieldaten ansehen</h2>
        <p className="muted">
          Fügt Beispiel-Tracker („Mein Befinden (Demo)“ und „Liegestütze (Demo)“) mit 60 Tagen erfundener Einträge hinzu – so
          siehst du, wie Verlauf und Auswertungen aussehen. Mit einem Tipp in der Übersicht wieder entfernt.
        </p>
        <button
          className="btn"
          onClick={() => {
            dispatch({ type: 'data/merge', ...generateDemo() });
            navigate('/');
          }}
        >
          Beispieldaten hinzufügen
        </button>
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
}
