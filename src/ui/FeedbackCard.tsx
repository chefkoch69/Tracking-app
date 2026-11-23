import { useEffect, useRef, useState } from 'react';
import { claudeUse } from './claudeRuntime';
import { copyText } from './save';
import { notify } from './confirm';
import { useDictation } from './useDictation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

type Phase = 'idle' | 'sending' | 'sent' | 'saved' | 'copied' | 'error';

const ERRORS: Record<string, string> = {
  consent_required: 'Nicht gesendet: Die Seite darf noch nicht in deinem Namen kommentieren. Erlaube es im Hinweis von claude.ai und versuch es nochmal.',
  forbidden: 'Nicht gesendet: Von hier aus kannst du keine Kommentare schreiben.',
  rate_limited: 'Gerade zu viele Nachrichten – bitte in ein paar Minuten nochmal.',
  invalid: 'Der Text ist zu lang (höchstens etwa 4000 Zeichen).',
};

/**
 * Feedback an Claude, direkt aus der App: In claude.ai landet es als Kommentar an dieser
 * Seite – wenn möglich mit Benachrichtigung an Claude, sonst als Notiz, die Claude beim
 * nächsten Mal liest. Außerhalb von claude.ai: Text kopieren und in den Chat einfügen.
 */
export function FeedbackCard({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'claude' | 'comment' | 'copy' | null>(null);
  const comments = useRef<Any>(null);
  const card = useRef<HTMLElement>(null);
  const dict = useDictation((piece) => setText((t) => (t ? `${t.trimEnd()} ${piece.trim()}` : piece.trim())));

  useEffect(() => {
    let off = false;
    claudeUse('comments').then(async (c) => {
      if (off) return;
      comments.current = c;
      if (!c) return setMode('copy');
      try {
        setMode((await c.canSendToClaude()) === 'available' ? 'claude' : 'comment');
      } catch {
        setMode('comment');
      }
    });
    return () => {
      off = true;
    };
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    dict.stop();
    setError(null);
    const message = `Feedback zur App: ${body}`;
    const c = comments.current;
    if (!c || !card.current) {
      if (await copyText(message)) setPhase('copied');
      else await notify('Die Zwischenablage ist hier gesperrt. Markiere den Text und kopiere ihn selbst:', message);
      return;
    }
    setPhase('sending');
    try {
      const anchor = await c.anchorFor(card.current);
      // Kurz vorher nochmal prüfen – eine Claude-Sitzung kann inzwischen beendet sein.
      const can = await c.canSendToClaude().catch(() => 'off');
      if (can === 'available') {
        try {
          await c.sendToClaude({ anchor, text: message });
          setPhase('sent');
          setText('');
          return;
        } catch (e) {
          if ((e as { code?: string })?.code !== 'claude_unavailable') throw e;
        }
      }
      await c.create({ anchor, text: message });
      setPhase('saved');
      setText('');
    } catch (e) {
      const code = (e as { code?: string })?.code ?? 'upstream_error';
      setPhase('error');
      setError(ERRORS[code] ?? 'Das hat gerade nicht geklappt. Dein Text ist noch da – versuch es gleich nochmal.');
    }
  };

  const done =
    phase === 'sent'
      ? 'Gesendet ✓ Claude bekommt Bescheid und antwortet im Kommentar an dieser Seite.'
      : phase === 'saved'
        ? 'Gespeichert ✓ Dein Feedback hängt als Kommentar an dieser Seite – Claude liest es, wenn ihr das nächste Mal schreibt.'
        : phase === 'copied'
          ? 'Kopiert ✓ Füge den Text im Chat mit Claude ein.'
          : null;

  return (
    <section className={`card feedback-card ${compact ? 'compact' : ''}`} ref={card}>
      <h2>💬 Feedback an Claude</h2>
      <p className="muted small">
        Was fehlt, was nervt, was könnte einfacher sein? Schreib oder sprich es einfach – Claude baut es ein.
      </p>
      <textarea
        rows={compact ? 2 : 3}
        value={text}
        maxLength={3900}
        placeholder="z. B. Ich möchte Kaffee mit einem Tipp eintragen können."
        onChange={(e) => {
          setText(e.target.value);
          if (phase !== 'sending') setPhase('idle');
        }}
        aria-label="Dein Feedback"
      />
      {dict.listening && dict.partial && <p className="muted small">… {dict.partial}</p>}
      <div className="actions">
        {dict.available && (
          <button type="button" className={`btn small mic ${dict.listening ? 'on' : ''}`} onClick={() => (dict.listening ? dict.stop() : dict.start())}>
            {dict.listening ? '■ Stopp' : '🎙 Sprechen'}
          </button>
        )}
        <button type="button" className="btn primary" disabled={!text.trim() || phase === 'sending'} onClick={send}>
          {phase === 'sending' ? 'Wird gesendet …' : mode === 'copy' ? 'Text kopieren' : mode === 'comment' ? 'Als Kommentar speichern' : 'An Claude senden'}
        </button>
      </div>
      {done && <p className="info" role="status">{done}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
