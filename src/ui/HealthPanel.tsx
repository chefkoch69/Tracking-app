import { useEffect, useState } from 'react';
import { dayKey, formatDay, parseDayKey } from '../core/dates';
import { formatDuration } from '../core/fieldTypes';
import { minutesSinceWake, parseHealthText } from '../core/health';
import type { HealthDay } from '../core/types';
import { useStore } from '../state/store';
import { askConfirm } from './confirm';
import { IS_ARTIFACT } from './env';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Kompakter Tagesstatus im Kopfbereich: Aufstehzeit, wach seit, Schlaf, Schritte. */
export function WakeChip({ now }: { now: Date }) {
  const { data, dispatch } = useStore();
  const key = dayKey(now);
  const today = data.health?.[key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(today?.wake ?? hhmm(now));
  const since = minutesSinceWake(data.health, now);
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
        {since !== null && <span> · seit {formatDuration(since)} wach</span>}
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
    <section className="card">
      <h2>Apple Health</h2>
      <p className="muted">
        Schlaf (Aufstehzeit, Dauer), Bewegung (Schritte, aktive Energie, Trainingsminuten), Ruhepuls und Körperanalyse (Gewicht,
        Körperfett) fließen in „seit dem Aufstehen“, den Vergleich, „Was hilft wirklich?“ und den Arztbericht ein.
        Eine Web-App darf Health nicht direkt lesen – ein iPhone-Kurzbefehl holt die Werte und übergibt sie hierher.
      </p>

      <label className="field" htmlFor="health-paste">
        <span>Daten vom Kurzbefehl einfügen</span>
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

      <details className="howto">
        <summary>So richtest du den Kurzbefehl ein (einmalig, ca. 5 Minuten)</summary>
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
          <li>Aktion <b>In Zwischenablage kopieren</b>.</li>
          <li>Morgens: Kurzbefehl antippen (oder per Automation „Wecker gestoppt“ automatisch starten), dann hier ins Feld einfügen.</li>
        </ol>
        <p className="muted small">
          Die Bezeichnungen der Aktionen können je nach iOS-Version leicht abweichen. Die App versteht auch Schlaf in Minuten,
          Zahlen mit Tausenderpunkt und ganze Zeitstempel. Fehlende Werte einfach weglassen.
          {!IS_ARTIFACT && ' In der installierten App kann der Kurzbefehl statt „Kopieren“ auch direkt die Adresse …/#/health?data=[Text] öffnen.'}
        </p>
      </details>

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
