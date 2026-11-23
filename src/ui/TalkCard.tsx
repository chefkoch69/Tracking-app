import { useEffect, useRef, useState } from 'react';
import { dayKey, toLocalInput } from '../core/dates';
import { uid } from '../core/id';
import { interpretNarrative, narrativePrompt, proposalText, type ParsedNarrative } from '../core/narrative';
import type { Entry, FieldValue, Tracker } from '../core/types';
import { useStore } from '../state/store';
import { claudeUse } from './claudeRuntime';
import { useDictation } from './useDictation';

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const ERRORS: Record<string, string> = {
  not_granted: 'Claude ist für diese Seite nicht erlaubt. Du kannst den Text trotzdem als Notiz speichern.',
  sampling_disabled: 'Claude ist für dein Konto hier nicht verfügbar. Du kannst den Text als Notiz speichern.',
  rate_limited: 'Gerade zu viele Anfragen oder dein Nutzungslimit ist erreicht. Bitte später nochmal – oder als Notiz speichern.',
  invalid_json: 'Die Antwort war nicht im erwarteten Format. Bitte nochmal auswerten.',
  refused: 'Claude konnte diesen Text nicht auswerten. Speichere ihn als Notiz.',
  session_expired: 'Bitte in claude.ai neu anmelden.',
};

/**
 * „Erzählen“: frei sprechen oder tippen → Claude schlägt Einträge vor →
 * prüfen, Zeiten anpassen, übernehmen. Ohne Claude: als Notiz speichern.
 */
export function TalkCard({ quick, autoFocus }: { quick: Tracker; autoFocus?: boolean }) {
  const { data, dispatch } = useStore();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'review'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedNarrative | null>(null);
  const [times, setTimes] = useState<Record<string, string>>({});
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [keepRaw, setKeepRaw] = useState(true);
  const [takeWake, setTakeWake] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const [canAsk, setCanAsk] = useState<boolean | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const dict = useDictation((piece) => setText((t) => (t ? t + piece : piece.trimStart())));

  useEffect(() => {
    claudeUse('sample').then((s) => setCanAsk(!!s));
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);

  const trackers = (() => {
    const active = data.trackers.filter((t) => !t.archived);
    const own = active.filter((t) => !t.demo);
    return own.length ? own : active;
  })();
  const note = (t: Tracker) => t.fields.find((f) => f.type === 'text' && f.config.multiline && !f.hidden);

  const analyse = async () => {
    if (!text.trim()) return;
    dict.stop();
    setError(null);
    setPhase('thinking');
    const sample = await claudeUse('sample');
    if (!sample) {
      setCanAsk(false);
      setPhase('idle');
      setError('Die Auswertung mit Claude gibt es nur in claude.ai. Speichere den Text als Notiz.');
      return;
    }
    const now = new Date();
    ctl.current = new AbortController();
    try {
      const raw = await sample.json(narrativePrompt(text, trackers, now, data.health), { signal: ctl.current.signal, cache: false });
      const r = interpretNarrative(raw, trackers, now);
      if (!r.proposals.length) {
        setPhase('idle');
        setError('Ich konnte daraus keine Einträge ableiten. Ergänze den Text oder speichere ihn als Notiz.');
        return;
      }
      setResult(r);
      setTimes(Object.fromEntries(r.proposals.map((p) => [p.key, toLocalInput(p.time)])));
      setInclude(Object.fromEntries(r.proposals.map((p) => [p.key, true])));
      setTakeWake(!!r.wake && !data.health?.[dayKey(now)]?.wake);
      setPhase('review');
    } catch (e) {
      const code = (e as { code?: string })?.code ?? 'upstream_error';
      setPhase('idle');
      if (code !== 'cancelled') setError(ERRORS[code] ?? 'Die Auswertung hat gerade nicht geklappt. Bitte nochmal versuchen.');
      if (code === 'not_granted' || code === 'sampling_disabled') setCanAsk(false);
    }
  };

  const saveAll = () => {
    if (!result) return;
    const chosen = result.proposals.filter((p) => include[p.key]);
    // Originaltext beim spätesten Eintrag des Schnell-Check-ins (oder dem letzten überhaupt) ablegen.
    const rawTarget = [...chosen].reverse().find((p) => p.trackerId === quick.id && note(quick)) ?? [...chosen].reverse().find((p) => {
      const t = data.trackers.find((x) => x.id === p.trackerId);
      return t && note(t);
    });
    for (const p of chosen) {
      const t = data.trackers.find((x) => x.id === p.trackerId)!;
      const values: Record<string, FieldValue> = { ...p.values };
      const n = note(t);
      if (n) {
        const parts = [typeof values[n.id] === 'string' ? (values[n.id] as string) : ''];
        if (p.dropped.length) parts.push(`(nicht zugeordnet: ${p.dropped.join('; ')})`);
        if (keepRaw && p === rawTarget) parts.push(`Erzählt: „${text.trim()}“`);
        const joined = parts.filter(Boolean).join('\n');
        if (joined) values[n.id] = joined;
      }
      const time = new Date(times[p.key] ?? p.time);
      const entry: Entry = { id: uid(), trackerId: t.id, timestamp: (Number.isNaN(time.getTime()) ? p.time : time).toISOString(), values };
      dispatch({ type: 'entry/save', entry });
    }
    if (result.wake && takeWake) dispatch({ type: 'health/upsert', days: [{ date: dayKey(new Date()), wake: result.wake, source: 'manual' }] });
    setDone(`${chosen.length} ${chosen.length === 1 ? 'Eintrag' : 'Einträge'} gespeichert.`);
    reset();
  };

  const saveAsNote = () => {
    const n = note(quick);
    if (!n || !text.trim()) return;
    dispatch({ type: 'entry/save', entry: { id: uid(), trackerId: quick.id, timestamp: new Date().toISOString(), values: { [n.id]: text.trim() } } });
    setDone('Als Notiz gespeichert.');
    reset();
  };

  const reset = () => {
    setText('');
    setResult(null);
    setPhase('idle');
    setError(null);
  };

  return (
    <section className="card talk-card">
      <div className="section-head">
        <h2>🎙 Erzählen</h2>
        {dict.available && (
          <button type="button" className={`btn small mic ${dict.listening ? 'on' : ''}`} onClick={() => (dict.listening ? dict.stop() : dict.start())} aria-pressed={dict.listening}>
            {dict.listening ? '■ Stopp' : '🎙 Sprechen'}
          </button>
        )}
      </div>
      {phase !== 'review' && (
        <>
          <p className="muted small">
            Erzähl einfach, was war und wie es dir geht – mit Uhrzeiten, wenn du sie weißt.
            {!dict.available && (isIOS() ? ' Tipp: Tippe auf das 🎤 unten auf deiner Tastatur und sprich.' : ' Tipp: Nutze die Diktierfunktion deiner Tastatur.')}
          </p>
          <textarea
            ref={area}
            id="talk-text"
            className="talk-text"
            rows={5}
            value={text + (dict.partial ? (text ? ' ' : '') + dict.partial : '')}
            placeholder="z. B. Nach einem Termin habe ich gefrühstückt: 3 Eier und 3 Scheiben Toast mit Käse und Hummus. Danach war ich sehr fertig und habe 2 Stunden geschlafen. Jetzt ist mir mittelschlecht übel, ich musste öfter würgen."
            onChange={(e) => setText(e.target.value)}
            disabled={phase === 'thinking'}
            aria-label="Erzählen"
          />
          {dict.error && <p className="error small">{dict.error}</p>}
          {error && <p className="error small">{error}</p>}
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            {phase === 'thinking' ? (
              <>
                <span className="thinking">Claude ordnet zu …</span>
                <button className="btn ghost small" onClick={() => ctl.current?.abort()}>Abbrechen</button>
              </>
            ) : (
              <>
                {canAsk !== false && (
                  <button className="btn primary" disabled={!text.trim()} onClick={analyse}>✦ In Einträge umwandeln</button>
                )}
                <button className="btn" disabled={!text.trim() || !note(quick)} onClick={saveAsNote}>Als Notiz speichern</button>
              </>
            )}
          </div>
          {done && <p className="saved-toast small" role="status">✓ {done}</p>}
        </>
      )}

      {phase === 'review' && result && (
        <div className="proposals">
          <p className="muted small">Vorschlag von Claude – prüfe Uhrzeiten und Werte, dann übernehmen. Unsichere Zeiten sind markiert.</p>
          {result.proposals.map((p) => {
            const t = data.trackers.find((x) => x.id === p.trackerId)!;
            return (
              <div key={p.key} className={`proposal ${include[p.key] ? '' : 'off'}`} style={{ '--accent': t.color } as React.CSSProperties}>
                <label className="proposal-head">
                  <input type="checkbox" checked={!!include[p.key]} onChange={(e) => setInclude((s) => ({ ...s, [p.key]: e.target.checked }))} />
                  <span className="proposal-title">
                    <b>{p.summary || t.name}</b>
                    <small className="muted">{t.icon} {t.name}</small>
                  </span>
                </label>
                <div className="proposal-time">
                  <input type="datetime-local" aria-label="Zeitpunkt" value={times[p.key] ?? ''} onChange={(e) => setTimes((s) => ({ ...s, [p.key]: e.target.value }))} />
                  {p.timeUncertain && <span className="pill warn-pill">Zeit geschätzt</span>}
                </div>
                <p className="proposal-values">{proposalText(p, t)}</p>
                {p.dropped.length > 0 && <p className="muted small">Nicht zugeordnet (kommt in die Notiz): {p.dropped.join('; ')}</p>}
              </div>
            );
          })}
          {result.unmapped.length > 0 && <p className="muted small">Ohne Zuordnung: {result.unmapped.join('; ')}</p>}
          {result.wake && (
            <label className="switch small">
              <input type="checkbox" checked={takeWake} onChange={(e) => setTakeWake(e.target.checked)} />
              <span>Aufstehzeit {result.wake} für heute übernehmen</span>
            </label>
          )}
          <label className="switch small">
            <input type="checkbox" checked={keepRaw} onChange={(e) => setKeepRaw(e.target.checked)} />
            <span>Meinen Originaltext zusätzlich als Notiz speichern</span>
          </label>
          <div className="actions">
            <button className="btn ghost" onClick={() => setPhase('idle')}>Text ändern</button>
            <button className="btn primary" disabled={!Object.values(include).some(Boolean)} onClick={saveAll}>
              Übernehmen ({Object.values(include).filter(Boolean).length})
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
