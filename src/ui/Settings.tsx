import { useRef, useState } from 'react';
import { generateDemo } from '../core/demo';
import { download, emptyData, exportJson, normalize } from '../core/storage';
import { useStore } from '../state/store';
import { notificationsSupported, requestNotificationPermission } from './reminders';
import { navigate } from './router';

export function Settings() {
  const { data, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'unsupported');

  const onImport = async (file: File) => {
    try {
      const imported = normalize(JSON.parse(await file.text()));
      if (!confirm(`${imported.trackers.length} Tracker und ${imported.entries.length} Einträge importieren? Deine aktuellen Daten werden ersetzt.`)) return;
      dispatch({ type: 'data/replace', data: imported });
      setMsg('Import erfolgreich.');
    } catch (e) {
      setMsg(`Import fehlgeschlagen: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <h1>Einstellungen & Daten</h1>

      <section className="card">
        <h2>Erinnerungen</h2>
        <p className="muted">
          Erinnerungen werden als Systembenachrichtigung angezeigt, solange die App geöffnet ist (auch in einem Hintergrund-Tab).
          Tipp: Installiere die App über „Zum Startbildschirm hinzufügen“.
        </p>
        <p>
          Status:{' '}
          <b>
            {perm === 'granted' ? 'erlaubt ✓' : perm === 'denied' ? 'blockiert (in den Browser-Einstellungen freigeben)' : perm === 'unsupported' ? 'nicht unterstützt' : 'noch nicht erlaubt'}
          </b>
        </p>
        {perm === 'default' && (
          <button className="btn primary" onClick={async () => setPerm(await requestNotificationPermission())}>
            Benachrichtigungen erlauben
          </button>
        )}
      </section>

      <section className="card">
        <h2>Für Berichte</h2>
        <p className="muted">Erscheint im Kopf des druckbaren Berichts (z. B. für die Ärztin/den Arzt). Bleibt lokal auf diesem Gerät.</p>
        <div className="cfg-grid">
          <label className="cfg-row">
            <span>Name</span>
            <input value={data.profile?.name ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { name: e.target.value } })} />
          </label>
          <label className="cfg-row">
            <span>Geburtsdatum</span>
            <input type="date" value={data.profile?.birthdate ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { birthdate: e.target.value } })} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Daten</h2>
        <p className="muted">
          Alle Daten bleiben lokal auf diesem Gerät ({data.trackers.length} Tracker, {data.entries.length} Einträge). Sichere sie regelmäßig als Datei.
        </p>
        <div className="actions">
          <button className="btn" onClick={() => download(`tracker-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJson(data), 'application/json')}>
            Backup exportieren (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Backup importieren</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        </div>
        {msg && <p className="info">{msg}</p>}
      </section>

      <section className="card">
        <h2>Ausprobieren</h2>
        <p className="muted">Fügt drei Demo-Tracker (Bauchschmerztagebuch, Morgen-Check-in, Liegestütze) mit 60 Tagen Beispieldaten hinzu, um die Auswertungen zu erkunden.</p>
        <button
          className="btn"
          onClick={() => {
            const demo = generateDemo();
            dispatch({ type: 'data/merge', ...demo });
            navigate('/');
          }}
        >
          Demo-Daten hinzufügen
        </button>
      </section>

      <section className="card danger-zone">
        <h2>Alles löschen</h2>
        <button
          className="btn danger"
          onClick={() => confirm('Wirklich ALLE Tracker und Einträge löschen? Das kann nicht rückgängig gemacht werden.') && dispatch({ type: 'data/replace', data: emptyData() })}
        >
          Alle Daten löschen
        </button>
      </section>
    </div>
  );
}
