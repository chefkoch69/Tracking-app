import { useEffect, useState } from 'react';
import { dayKey, formatDay, parseDayKey } from '../../core/model/dates';
import { parseHealthText } from '../../core/diary/health';
import type { HealthDay } from '../../core/model/types';
import { useStore } from '../../state/store';
import { askConfirm, notify } from '../../components/confirm';
import { copyText } from '../../platform/save';
import { IS_ARTIFACT, IS_WORKER } from '../../app/env';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Kompakter Tagesstatus im Kopfbereich: Aufstehzeit, wach seit, Schlaf, Schritte. */
export function WakeChip({ now, buttons = true }: { now: Date; buttons?: boolean }) {
  const { data, dispatch } = useStore();
  const key = dayKey(now);
  const today = data.health?.[key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(today?.wake ?? hhmm(now));
  const save = (wake: string) => {
    dispatch({ type: 'health/upsert', days: [{ date: key, wake, source: today?.source === 'health' ? 'health' : 'manual' }] });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="wake-chip">
        <label htmlFor="wake-edit">Aufgestanden um</label>
        <input id="wake-edit" type="time" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn small white" onClick={() => draft && save(draft)}>Speichern</button>
        <button className="btn small outline-white" onClick={() => setEditing(false)}>Abbrechen</button>
      </div>
    );
  }
  if (!today?.wake) {
    if (!buttons) return null;
    return (
      <div className="wake-chip">
        <button className="btn small white" onClick={() => save(hhmm(new Date()))}>☀ Ich bin aufgestanden</button>
        <button className="btn small outline-white" onClick={() => { setDraft('07:00'); setEditing(true); }}>Andere Uhrzeit</button>
      </div>
    );
  }
  return (
    <div className="wake-chip">
      <button className="wake-pill" onClick={() => { setDraft(today.wake!); setEditing(true); }} title="Aufstehzeit ändern">
        ☀ Aufgestanden {today.wake}
      </button>
      {today.sleepHours !== undefined && <span className="wake-pill static">☾ {today.sleepHours.toLocaleString('de-DE')} h Schlaf</span>}
      {today.steps !== undefined && <span className="wake-pill static">👣 {today.steps.toLocaleString('de-DE')} Schritte</span>}
      {today.exerciseMin !== undefined && <span className="wake-pill static">🏃 {today.exerciseMin} min Training</span>}
      {today.weight !== undefined && <span className="wake-pill static">⚖ {today.weight.toLocaleString('de-DE')} kg</span>}
    </div>
  );
}

const EXAMPLE = 'BYOT-HEALTH {"date":"2026-11-23","wake":"06:42","schlaf":450,"steps":4512,"kcal":380,"training":25,"gewicht":71.8,"fett":0.22}';

/** Einstellungen: Health-Daten einfügen, Anleitung für den Kurzbefehl, letzte Tage. */
export function HealthSettings() {
  const { data, dispatch } = useStore();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const days = Object.values(data.health ?? {}).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  const importText = (t: string) => {
    const parsed = parseHealthText(t);
    if (!parsed.length) {
      setMsg({ ok: false, text: 'Keine Gesundheitsdaten erkannt. Erwartet wird z. B. der Text, den der Kurzbefehl kopiert.' });
      return;
    }
    dispatch({ type: 'health/upsert', days: parsed });
    setText('');
    setMsg({ ok: true, text: `Übernommen: ${parsed.map((d) => describe(d)).join(' · ')}` });
  };

  const tryClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      importText(t);
    } catch {
      setMsg({ ok: false, text: 'Die Zwischenablage kann hier nicht gelesen werden. Bitte ins Feld einfügen (lange tippen → Einsetzen).' });
    }
  };

  return (
    <section className="card" id="health-settings">
      <h2>Schlaf & Bewegung vom Armband</h2>
      <p className="muted">
        Deine Aufstehzeit kommt automatisch, sobald du den Wecker ausschaltest. Schlaf und Schritte vom Armband kannst du
        zusätzlich per Kurzbefehl holen (Amazfit: in der Zepp-App unter Profil → „Apple Health“ verbinden).
      </p>

      {IS_WORKER && <AutoHealth />}

      {IS_WORKER ? (
        <details className="howto">
          <summary>Notlösung: Werte von Hand einfügen</summary>
      <label className="field" htmlFor="health-paste">
        <span>{IS_WORKER ? 'Oder von Hand: Text vom Kurzbefehl einfügen' : 'Daten vom Kurzbefehl einfügen'}</span>
        <textarea
          id="health-paste"
          rows={3}
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (t) {
              e.preventDefault();
              importText(t);
            }
          }}
        />
      </label>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!text.trim()} onClick={() => importText(text)}>Übernehmen</button>
        {!IS_ARTIFACT && <button className="btn" onClick={tryClipboard}>Aus Zwischenablage</button>}
      </div>
      {msg && <p className={msg.ok ? 'info' : 'error'}>{msg.text}</p>}
        </details>
      ) : (
        <>
      <label className="field" htmlFor="health-paste">
        <span>{IS_WORKER ? 'Oder von Hand: Text vom Kurzbefehl einfügen' : 'Daten vom Kurzbefehl einfügen'}</span>
        <textarea
          id="health-paste"
          rows={3}
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (t) {
              e.preventDefault();
              importText(t);
            }
          }}
        />
      </label>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!text.trim()} onClick={() => importText(text)}>Übernehmen</button>
        {!IS_ARTIFACT && <button className="btn" onClick={tryClipboard}>Aus Zwischenablage</button>}
      </div>
      {msg && <p className={msg.ok ? 'info' : 'error'}>{msg.text}</p>}
        </>
      )}

      {IS_WORKER && (
        <section className="shortcut-guide">
          <h3>Optional: Schlaf und Schritte per Kurzbefehl (ca. 5 Minuten)</h3>
          <p className="muted small">Erst oben den Verbindungs-Schlüssel erstellen. Dann in der App <b>Kurzbefehle</b>:</p>
          <ol className="sg-steps">
            <li>
              <b>+</b> tippen → Name <b>„Befinden Health“</b>.
            </li>
            <li>
              Aktion <b>„Health-Samples suchen“</b> hinzufügen: Typ <b>Schlafanalyse</b>, „Startdatum ist in den letzten <b>1 Tagen</b>“,
              sortieren nach <b>Enddatum</b>, <b>Neueste zuerst</b>, Limit <b>1</b>.
            </li>
            <li>
              Aktion <b>„Health-Samples suchen“</b> noch einmal: Typ <b>Schritte</b>, Startdatum <b>heute</b> → darunter Aktion{' '}
              <b>„Statistik berechnen“</b> → <b>Summe</b>.
            </li>
            <li>
              Aktion <b>„Inhalte von URL abrufen“</b>:
              <ul>
                <li>
                  URL: die <b>Adresse</b> von oben (Kopieren-Knopf)
                </li>
                <li>
                  „Mehr anzeigen“ → Methode <b>POST</b>
                </li>
                <li>
                  Header: Schlüssel <code>Authorization</code>, Wert: <code>Bearer …</code> (Knopf „„Bearer …“ kopieren“ oben)
                </li>
                <li>
                  Anfragetext: <b>JSON</b> → zwei Felder hinzufügen:
                  <br />
                  <code>wake</code> = Variable <b>Health-Samples</b> → antippen → <b>Enddatum</b>
                  <br />
                  <code>steps</code> = Variable <b>Statistik</b>
                </li>
              </ul>
            </li>
            <li>
              Einmal auf <b>▶︎</b> tippen. Erscheint <b>„Gespeichert ✓“</b>, klappt es. Beim ersten Mal fragt das iPhone, ob der
              Kurzbefehl Health lesen darf → <b>Erlauben</b>.
            </li>
            <li>
              <b>Automatisch jeden Morgen:</b> unten <b>Automation</b> → <b>+</b> → <b>Wecker</b> → „Wenn <b>gestoppt</b>“ → <b>Sofort
              ausführen</b> → „Befinden Health“ wählen.
            </li>
          </ol>
          <p className="muted small">
            Optional zusätzlich <code>schlaf</code> (Schlafdauer in Minuten, Summe der Schlafanalyse „Schlafend“) – wenn du es
            weglässt, kommt nur die Aufwachzeit und die Schritte. Die Namen der Aktionen können je nach iOS-Version leicht abweichen.
          </p>
        </section>
      )}

      {!IS_WORKER && (
      <details className="howto">
        <summary>So richtest du den Kurzbefehl ein (einmalig, ca. 10 Minuten)</summary>
        <ol>
          <li>Öffne die App <b>Kurzbefehle</b> → <b>+</b> → neuer Kurzbefehl, Name z. B. „Tracker Health“.</li>
          <li>
            Aktion <b>Health-Samples suchen</b>: Typ <i>Schlafanalyse</i>, Startdatum „in den letzten 1 Tagen“, sortiert nach Enddatum (neueste zuerst), Limit 1.
            Das <b>Enddatum</b> davon ist deine Aufwachzeit.
          </li>
          <li>
            Optional <b>Schlafdauer</b>: Health-Samples suchen, Typ <i>Schlafanalyse</i>, Wert „Schlafend“ (bzw. Kern/Tief/REM), Startdatum
            „in den letzten 1 Tagen“ → <b>Statistik berechnen</b> (Summe der Dauer, in Minuten).
          </li>
          <li>
            Optional <b>Bewegung</b>, jeweils Startdatum „heute“ → <b>Statistik berechnen</b> (Summe): Typ <i>Schritte</i>, Typ
            <i> Aktive Energie</i>, Typ <i>Trainingsminuten</i>.
          </li>
          <li>
            Optional <b>Körperanalyse</b> (z. B. von deiner Waage), jeweils Limit 1, neueste zuerst: Typ <i>Gewicht</i>, Typ
            <i> Körperfettanteil</i>. Optional auch <i>Ruheherzfrequenz</i>.
          </li>
          <li>
            Aktion <b>Text</b> mit genau diesem Aufbau (die Werte in eckigen Klammern sind die Variablen aus den Schritten oben,
            Datum als „yyyy-MM-dd“, Zeit als „HH:mm“; was du nicht abfragst, einfach weglassen):
            <code className="code-block">{'BYOT-HEALTH {"date":"[Aktuelles Datum]","wake":"[Enddatum]","schlaf":[Schlafminuten],"steps":[Schritte],"kcal":[Aktive Energie],"training":[Trainingsminuten],"gewicht":[Gewicht],"fett":[Körperfettanteil],"ruhepuls":[Ruheherzfrequenz]}'}</code>
          </li>
          {IS_WORKER ? (
            <>
              <li>
                Aktion <b>Inhalte von URL abrufen</b>: die <b>Adresse</b> von oben einsetzen, auf „Mehr anzeigen“ tippen →
                Methode <b>POST</b> → Header hinzufügen: Schlüssel <code>Authorization</code>, Wert <code>Bearer </code> + dein
                Verbindungs-Schlüssel → Anfragetext <b>Datei</b> → den <b>Text</b> aus dem Schritt davor wählen.
              </li>
              <li>Einmal antippen zum Testen – es sollte „Gespeichert ✓“ erscheinen.</li>
              <li>
                Automatisch jeden Morgen: Kurzbefehle → <b>Automation</b> → <b>+</b> → <b>Wecker</b> → „Wenn gestoppt“ (oder
                <b> Tageszeit</b> 9:00) → <b>Sofort ausführen</b> → deinen Kurzbefehl wählen.
              </li>
            </>
          ) : (
            <>
              <li>Aktion <b>In Zwischenablage kopieren</b>.</li>
              <li>Morgens: Kurzbefehl antippen (oder per Automation „Wecker gestoppt“ automatisch starten), dann hier ins Feld einfügen.</li>
            </>
          )}
        </ol>
        <p className="muted small">
          Die Bezeichnungen der Aktionen können je nach iOS-Version leicht abweichen. Die App versteht auch Schlaf in Minuten,
          Zahlen mit Tausenderpunkt und ganze Zeitstempel. Fehlende Werte einfach weglassen.
          {!IS_ARTIFACT && ' In der installierten App kann der Kurzbefehl statt „Kopieren“ auch direkt die Adresse …/#/health?data=[Text] öffnen.'}
        </p>
      </details>
      )}

      {days.length > 0 && (
        <>
          <h3>Letzte Tage</h3>
          <div className="table-scroll small-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th className="num">Aufgestanden</th>
                  <th className="num">Schlaf</th>
                  <th className="num">Schritte</th>
                  <th className="num">Ruhepuls</th>
                  <th className="num">Aktiv</th>
                  <th className="num">Training</th>
                  <th className="num">Gewicht</th>
                  <th className="num">Fett</th>
                  <th>Quelle</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDay(parseDayKey(d.date))}</td>
                    <td className="num">{d.wake ?? '–'}</td>
                    <td className="num">{d.sleepHours !== undefined ? `${d.sleepHours.toLocaleString('de-DE')} h` : '–'}</td>
                    <td className="num">{d.steps?.toLocaleString('de-DE') ?? '–'}</td>
                    <td className="num">{d.restingHr ?? '–'}</td>
                    <td className="num">{d.activeKcal !== undefined ? `${d.activeKcal} kcal` : '–'}</td>
                    <td className="num">{d.exerciseMin !== undefined ? `${d.exerciseMin} min` : '–'}</td>
                    <td className="num">{d.weight !== undefined ? `${d.weight.toLocaleString('de-DE')} kg` : '–'}</td>
                    <td className="num">{d.bodyFat !== undefined ? `${d.bodyFat.toLocaleString('de-DE')} %` : '–'}</td>
                    <td className="muted small">{d.source === 'health' ? 'Health' : d.source === 'demo' ? 'Beispiel' : 'manuell'}</td>
                    <td>
                      <button
                        className="btn ghost small danger"
                        aria-label={`Gesundheitsdaten vom ${d.date} löschen`}
                        onClick={async () => (await askConfirm(`Gesundheitsdaten vom ${formatDay(parseDayKey(d.date))} löschen?`, { okLabel: 'Löschen' })) && dispatch({ type: 'health/delete', date: d.date })}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function describe(d: HealthDay): string {
  const parts = [formatDay(parseDayKey(d.date))];
  if (d.wake) parts.push(`aufgestanden ${d.wake}`);
  if (d.sleepHours !== undefined) parts.push(`${d.sleepHours.toLocaleString('de-DE')} h Schlaf`);
  if (d.steps !== undefined) parts.push(`${d.steps.toLocaleString('de-DE')} Schritte`);
  if (d.restingHr !== undefined) parts.push(`Ruhepuls ${d.restingHr}`);
  if (d.activeKcal !== undefined) parts.push(`${d.activeKcal} kcal aktiv`);
  if (d.exerciseMin !== undefined) parts.push(`${d.exerciseMin} min Training`);
  if (d.weight !== undefined) parts.push(`${d.weight.toLocaleString('de-DE')} kg`);
  if (d.bodyFat !== undefined) parts.push(`${d.bodyFat.toLocaleString('de-DE')} % Körperfett`);
  return parts.join(', ');
}

/** Ziel für einen Kurzbefehl-Link: #/health?data=… (nur in der installierten App). */
export function HealthImportPage({ payload }: { payload?: string }) {
  const { dispatch } = useStore();
  const [result] = useState(() => (payload ? parseHealthText(payload) : []));
  useEffect(() => {
    if (result.length) dispatch({ type: 'health/upsert', days: result });
  }, [result, dispatch]);
  return (
    <div className="page">
      <section className="card">
        <h2>Apple Health</h2>
        {result.length ? <p className="info">Übernommen: {result.map(describe).join(' · ')}</p> : <p className="error">Keine Gesundheitsdaten im Link gefunden.</p>}
        <a className="btn primary" href="#/">Zur Übersicht</a>
      </section>
    </div>
  );
}

/** Eigene Cloudflare-Version: Kurzbefehl schickt die Werte direkt an den Server. */
function AutoHealth() {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = `${window.location.origin}/api/health`;
  const create = async () => {
    if (key === null && !(await askConfirm('Neue Adresse erstellen? Eine früher eingerichtete Automation funktioniert danach erst wieder mit der neuen Adresse.', { okLabel: 'Erstellen', danger: false }))) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/health-key', { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) throw new Error();
      setKey(((await res.json()) as { key: string }).key);
    } catch {
      setErr('Das hat gerade nicht geklappt. Bitte nochmal versuchen.');
    } finally {
      setBusy(false);
    }
  };
  const copy = async (t: string) => {
    if (!(await copyText(t))) await notify('Bitte selbst markieren und kopieren:', t);
  };
  const wakeUrl = key ? `${window.location.origin}/api/wake?key=${key}` : '';
  return (
    <div className="auto-health">
      <section className="shortcut-guide wake-guide">
        <h3>☀ Aufstehzeit automatisch – 1 Minute, kostenlos</h3>
        <p className="muted small">Wenn du morgens den Wecker ausschaltest, trägt dein iPhone die Uhrzeit hier ein. Kein Kurzbefehl zum Bauen.</p>
        <ol className="sg-steps">
          <li>
            {key ? (
              <>
                Deine Wecker-Adresse (nur jetzt sichtbar):
                <code className="ah-url">{wakeUrl}</code>
                <button className="btn primary small" onClick={() => copy(wakeUrl)}>Adresse kopieren</button>
              </>
            ) : (
              <button className="btn primary" disabled={busy} onClick={create}>Meine Wecker-Adresse erstellen</button>
            )}
          </li>
          <li>
            App <b>Kurzbefehle</b> öffnen → unten <b>Automation</b> → <b>+</b> (bzw. „Neue Automation“) → <b>Wecker</b> → <b>„Wird gestoppt“</b> →
            <b> Sofort ausführen</b> → <b>Weiter</b>.
          </li>
          <li>
            <b>„Neue leere Automation“</b> → Aktion suchen: <b>„Inhalte von URL abrufen“</b> → auf „URL“ tippen → <b>Adresse einfügen</b> → <b>Fertig</b>.
          </li>
          <li>Fertig. Ab morgen steht deine Aufstehzeit automatisch auf „Heute“.</li>
        </ol>
      </section>
      {err && <p className="error small">{err}</p>}
      <details className="howto">
        <summary>Mehr vom Armband: Schlaf und Schritte (optional, Kurzbefehl)</summary>
        <div className="ah-row">
          <span className="muted small">Adresse</span>
          <code>{url}</code>
          <button className="btn small" onClick={() => copy(url)}>Kopieren</button>
        </div>
        {key && (
          <div className="ah-row">
            <span className="muted small">Verbindungs-Schlüssel</span>
            <code>{key}</code>
            <button className="btn small" onClick={() => copy(`Bearer ${key}`)}>„Bearer …“ kopieren</button>
          </div>
        )}
        <p className="muted small">Erst oben die Wecker-Adresse erstellen – derselbe Schlüssel gilt auch hier. Anleitung unten.</p>
      </details>
    </div>
  );
}
