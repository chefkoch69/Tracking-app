import { useEffect, useState } from 'react';
import { IS_WORKER } from '../../app/env';
import { enablePush, loadPush, pushSupported, savePushSettings, testPush, type PushState } from '../../platform/pushReminders';

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Erinnerungen einschalten und Uhrzeiten wählen. */
export function RemindersPanel() {
  const [st, setSt] = useState<PushState | null>(null);
  const [times, setTimes] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  useEffect(() => {
    void loadPush().then((s) => {
      setSt(s);
      if (s) setTimes(s.times);
    });
  }, []);

  if (!IS_WORKER) return <p className="muted">Erinnerungen gibt es in der Online-Version der App.</p>;
  if (!pushSupported() || !isStandalone())
    return (
      <section className="card">
        <h2>Erinnerungen</h2>
        <p>Erinnerungen funktionieren nur in der App vom Home-Bildschirm (iPhone ab iOS 16.4).</p>
        <p className="muted small">Safari → Teilen-Symbol → „Zum Home-Bildschirm“ → die App von dort öffnen und hier einschalten.</p>
      </section>
    );

  const on = granted && (st?.devices ?? 0) > 0 && st?.enabled !== false;
  const turnOn = async () => {
    if (!st?.publicKey) return setMsg({ ok: false, text: 'Der Server ist für Erinnerungen noch nicht bereit.' });
    setBusy(true);
    const r = await enablePush(st.publicKey, times);
    setBusy(false);
    if (r === 'ok') {
      setSt({ ...st, devices: Math.max(1, st.devices), enabled: true });
      setMsg({ ok: true, text: 'Eingeschaltet ✓ Du bekommst eine Erinnerung, wenn du eine Weile nichts eingetragen hast.' });
    } else
      setMsg({
        ok: false,
        text: r === 'denied' ? 'Mitteilungen sind nicht erlaubt. iPhone-Einstellungen → Mitteilungen → „Befinden“ → Erlauben.' : 'Das hat nicht geklappt. Bitte nochmal versuchen.',
      });
  };
  const setTime = (i: number, v: string) => {
    const next = times.map((t, j) => (j === i ? v : t)).filter(Boolean).sort();
    setTimes(next);
    void savePushSettings({ times: next });
  };

  return (
    <section className="card reminders-panel">
      <h2>Erinnerungen</h2>
      <p className="muted">
        Dein iPhone erinnert dich zu diesen Zeiten – aber nur, wenn du in den letzten 1½ Stunden nichts eingetragen hast. Solange
        heute noch nichts drin ist, zeigt das App-Symbol eine kleine <b>1</b>.
      </p>
      <div className="rm-times">
        {times.map((t, i) => (
          <label key={i} className="rm-time">
            <span>{i === 0 ? 'Morgens' : i === times.length - 1 ? 'Abends' : 'Tagsüber'}</span>
            <input type="time" value={t} onChange={(e) => setTime(i, e.target.value)} />
            {times.length > 1 && (
              <button type="button" className="btn ghost small icon-btn" aria-label="Zeit entfernen" onClick={() => setTime(i, '')}>
                ✕
              </button>
            )}
          </label>
        ))}
        {times.length < 6 && (
          <button type="button" className="linkish" onClick={() => setTime(times.length, '12:00')}>
            ＋ weitere Zeit
          </button>
        )}
      </div>
      {on ? (
        <div className="actions start">
          <button
            className="btn"
            onClick={async () => {
              const n = await testPush();
              setMsg(n ? { ok: true, text: 'Test geschickt – kommt in ein paar Sekunden.' } : { ok: false, text: 'Test hat nicht geklappt.' });
            }}
          >
            Test-Erinnerung senden
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              await savePushSettings({ enabled: false });
              setSt(st ? { ...st, enabled: false } : st);
            }}
          >
            Ausschalten
          </button>
        </div>
      ) : (
        <button className="btn primary big" disabled={busy} onClick={turnOn}>
          🔔 Erinnerungen einschalten
        </button>
      )}
      {msg && <p className={msg.ok ? 'info' : 'error'}>{msg.text}</p>}
    </section>
  );
}
