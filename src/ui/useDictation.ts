import { useEffect, useRef, useState } from 'react';
import { claudeUse, hasClaudeRuntime } from './claudeRuntime';

/**
 * Sprache → Text.
 *  - In claude.ai: der Baustein "dictation" (Chrome/Desktop; nicht in Safari
 *    und nicht in den Claude-Handy-Apps).
 *  - Außerhalb (installierte App im Browser): die Spracherkennung des Browsers.
 *  - Sonst: null – dann hilft das Mikrofon der Handy-Tastatur.
 */
type Mode = 'platform' | 'browser' | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function useDictation(onFinal: (text: string) => void) {
  const [mode, setMode] = useState<Mode>(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const platform = useRef<Any>(null);
  const browser = useRef<Any>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  useEffect(() => {
    let off: (() => void)[] = [];
    let cancelled = false;
    if (hasClaudeRuntime()) {
      claudeUse('dictation').then((d) => {
        if (cancelled || !d) return;
        platform.current = d;
        setMode('platform');
        off = [
          d.onFinal(({ text }: { text: string }) => cb.current(text)),
          d.onPartial(({ text }: { text: string }) => setPartial(text)),
          d.onState(({ state, reason }: { state: string; reason?: string }) => {
            setListening(state !== 'idle');
            if (state === 'idle') {
              setPartial('');
              if (reason === 'unavailable') setMode(null);
              if (reason === 'not_granted') setError('Mikrofon für diese Seite nicht erlaubt.');
              if (reason === 'rate_limited' || reason === 'upstream_error') setError('Diktieren hat gerade nicht geklappt – bitte gleich nochmal.');
            }
          }),
        ];
      });
    } else {
      const SR = (window as Any).SpeechRecognition ?? (window as Any).webkitSpeechRecognition;
      if (SR) setMode('browser');
    }
    return () => {
      cancelled = true;
      off.forEach((u) => u());
      try {
        browser.current?.stop();
      } catch {
        /* schon beendet */
      }
    };
  }, []);

  /** Muss direkt aus einem Klick aufgerufen werden (nichts davor abwarten). */
  const start = () => {
    setError(null);
    if (mode === 'platform' && platform.current) {
      platform.current.start({ language: 'de' }).catch((e: { code?: string }) => {
        if (e?.code === 'not_granted') setError('Mikrofon für diese Seite nicht erlaubt.');
        else if (e?.code === 'unavailable') setMode(null);
        else if (e?.code !== 'stopped' && e?.code !== 'dismissed') setError('Diktieren hat gerade nicht geklappt – bitte gleich nochmal.');
      });
      return;
    }
    if (mode === 'browser') {
      const SR = (window as Any).SpeechRecognition ?? (window as Any).webkitSpeechRecognition;
      const r = new SR();
      r.lang = 'de-DE';
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (ev: Any) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          if (res.isFinal) cb.current(' ' + res[0].transcript.trim());
          else interim += res[0].transcript;
        }
        setPartial(interim);
      };
      r.onerror = (ev: Any) => setError(ev?.error === 'not-allowed' ? 'Mikrofon nicht erlaubt.' : 'Diktieren hat gerade nicht geklappt.');
      r.onend = () => {
        setListening(false);
        setPartial('');
      };
      browser.current = r;
      try {
        r.start();
        setListening(true);
      } catch {
        setError('Diktieren konnte nicht starten.');
      }
    }
  };

  const stop = () => {
    if (mode === 'platform') void platform.current?.stop();
    if (mode === 'browser') browser.current?.stop();
  };

  return { available: mode !== null, listening, partial, error, start, stop };
}
