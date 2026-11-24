import { useEffect, useMemo, useRef, useState } from 'react';
import { dayKey, formatClock } from '../../core/model/dates';
import { formatValue, isEmptyValue, scaleLevels } from '../../core/fields/fieldTypes';
import { fieldByLabel } from '../../core/diary/moments';
import { uid } from '../../core/model/id';
import { parseSpeech } from '../../core/diary/speech';
import type { Entry, FieldDef, FieldValue, Tracker } from '../../core/model/types';
import { useStore } from '../../state/store';
import { CompactScale } from './EntryPage';
import { useDictation } from '../../platform/useDictation';

/** Die Punkte, die man beim Erzählen durchgeht – mit einem Beispiel, was man sagen kann. */
const POINTS: { key: string; icon: string; title: string; say: string; fields: string[]; wake?: boolean }[] = [
  { key: 'morning', icon: '☀️', title: 'Aufstehen & Schlaf', say: '„Um halb acht aufgewacht, gleich aufgestanden, Wecker war auf 7, gut geschlafen.“', fields: ['Gleich aufgestanden?', 'Wecker gestellt auf', 'Schlafqualität'], wake: true },
  { key: 'belly', icon: '🫃', title: 'Bauch', say: '„Leichtes Bauchweh, krampfartig, Unterbauch links, nach dem Essen.“ – oder „Bauch ist gut.“', fields: ['Bauchschmerz', 'Art der Bauchschmerzen', 'Lokalisation', 'Bezug zu Mahlzeiten', 'Übelkeit', 'Würgen / Brechreiz', 'Sodbrennen', 'Erbrechen'] },
  { key: 'head', icon: '🤕', title: 'Kopf', say: '„Kopfweh mittel, drückend an der Stirn.“ – oder „kein Kopfweh.“', fields: ['Kopfschmerz', 'Kopf – wo?', 'Art der Kopfschmerzen'] },
  { key: 'ear', icon: '👂', title: 'Tinnitus', say: '„Tinnitus leicht, links, Pfeifen, kommt und geht.“', fields: ['Tinnitus', 'Tinnitus – Ohr', 'Tinnitus – Klang', 'Tinnitus – Verlauf'] },
  { key: 'energy', icon: '🔋', title: 'Müdigkeit & Erschöpfung', say: '„Ziemlich müde, ein bisschen erschöpft, eher im Kopf.“', fields: ['Müdigkeit', 'Erschöpfung', 'Art der Erschöpfung'] },
  { key: 'cold', icon: '🥶', title: 'Kälte', say: '„Mir ist kalt an den Füßen.“ – oder „keine Kälte.“', fields: ['Kälteempfinden', 'Wo kalt?'] },
  { key: 'food', icon: '🍽', title: 'Essen & Trinken', say: '„Zum Frühstück zwei Brote mit Käse gegessen und einen Kaffee getrunken.“', fields: ['Was gegessen?', 'Was getrunken?'] },
  { key: 'med', icon: '💊', title: 'Medikamente & Maßnahmen', say: '„Eine Buscopan genommen, Wärmflasche.“', fields: ['Medikamente', 'Maßnahmen'] },
  { key: 'evening', icon: '🌙', title: 'Abends', say: '„Handy um 11 weggelegt.“', fields: ['Handy weggelegt um'] },
];

/** Nur Werte übernehmen, die das Feld auch kennt (z. B. vorhandene Auswahl-Optionen). */
function fits(f: FieldDef, v: FieldValue): boolean {
  if (f.type === 'scale') return typeof v === 'number' && scaleLevels(f.config).some((l) => l.value === v);
  if (f.type === 'select') return typeof v === 'string' && (f.config.options ?? []).includes(v);
  if (f.type === 'multiselect') return Array.isArray(v) && v.every((x) => (f.config.options ?? []).includes(x));
  if (f.type === 'time') return typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
  if (f.type === 'text' || f.type === 'bodymap') return !isEmptyValue(v);
  return false;
}

/**
 * Erzählen: sprechen (oder diktieren/tippen) – während du redest, wertet die App den Text
 * direkt hier aus und hakt die Punkte ab. Zahlen lassen sich antippen und korrigieren.
 */
export function SpeakCard({ tracker, onDone }: { tracker: Tracker; onDone?: () => void }) {
  const { data, dispatch } = useStore();
  const [text, setText] = useState('');
  const [fix, setFix] = useState<Record<string, FieldValue>>({});
  const [saved, setSaved] = useState<Entry | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const dict = useDictation((piece) => setText((t) => (t ? `${t.trimEnd()} ${piece.trim()}` : piece.trim())));
  const live = `${text} ${dict.partial}`.trim();
  const parsed = useMemo(() => parseSpeech(live), [live]);

  useEffect(() => {
    if (!dict.available) area.current?.focus();
  }, [dict.available]);

  // Erkannte Werte je Feld, mit Korrekturen darüber.
  const values: Record<string, FieldValue> = {};
  const fieldOf: Record<string, FieldDef> = {};
  for (const p of POINTS)
    for (const label of p.fields) {
      const f = fieldByLabel(tracker, label);
      if (!f) continue;
      fieldOf[label] = f;
      const v = label in fix ? fix[label] : parsed.values[label];
      if (v !== undefined && v !== null && fits(f, v)) values[label] = v;
    }
  const wake = parsed.wake;
  const count = Object.keys(values).length + (wake ? 1 : 0);
  const pointDone = (p: (typeof POINTS)[number]) => p.fields.some((l) => l in values) || (p.wake && !!wake);
  const visiblePoints = POINTS.filter((p) => p.fields.some((l) => fieldOf[l]));
  const next = visiblePoints.find((p) => !pointDone(p));

  const save = () => {
    if (!count && !text.trim()) return;
    dict.stop();
    const out: Record<string, FieldValue> = {};
    for (const [label, v] of Object.entries(values)) out[fieldOf[label].id] = v;
    const ev = fieldByLabel(tracker, 'Was ist passiert?');
    if (ev && parsed.events.length) {
      const opts = ev.config.options ?? [];
      const list = parsed.events.filter((e) => opts.includes(e));
      if (list.length) out[ev.id] = list;
    }
    const note = tracker.fields.find((f) => f.type === 'text' && f.config.multiline && !f.hidden);
    if (note && text.trim()) out[note.id] = `🎙 ${text.trim()}`;
    const now = new Date();
    const entry: Entry = { id: uid(), trackerId: tracker.id, timestamp: now.toISOString(), values: out };
    dispatch({ type: 'entry/save', entry });
    if (wake) dispatch({ type: 'health/upsert', days: [{ date: dayKey(now), wake, source: data.health?.[dayKey(now)]?.source === 'health' ? 'health' : 'manual' }] });
    setSaved(entry);
    setText('');
    setFix({});
  };

  if (saved)
    return (
      <section className="saved-card" role="status">
        <div className="saved-head">
          <span className="saved-check" aria-hidden>✓</span>
          <strong>Gespeichert · {formatClock(new Date(saved.timestamp))}</strong>
        </div>
        <div className="saved-actions">
          <button className="btn ghost small" onClick={() => { dispatch({ type: 'entry/delete', id: saved.id }); setSaved(null); }}>Rückgängig</button>
          <button className="btn ghost small" onClick={() => setSaved(null)}>Noch mehr erzählen</button>
          {onDone && <button className="btn primary small" onClick={onDone}>Fertig</button>}
        </div>
      </section>
    );

  return (
    <>
      <section className="card speak-card">
        <div className="speak-top">
          {dict.available ? (
            <button type="button" className={`speak-mic ${dict.listening ? 'on' : ''}`} onClick={() => (dict.listening ? dict.stop() : dict.start())}>
              <span aria-hidden>{dict.listening ? '■' : '🎙'}</span>
              {dict.listening ? 'Stopp' : text ? 'Weiter erzählen' : 'Erzählen starten'}
            </button>
          ) : (
            <p className="speak-hint">
              Tippe ins Feld und drück auf der Tastatur das <b>🎤 Mikrofon</b> – dann einfach erzählen.
            </p>
          )}
          {dict.listening && <span className="speak-live">hört zu …</span>}
        </div>
        {next && (
          <p className="speak-next">
            <b>
              {next.icon} {next.title}:
            </b>{' '}
            {next.say}
          </p>
        )}
        <textarea
          ref={area}
          className="speak-text"
          rows={4}
          value={dict.partial ? `${text} ${dict.partial}`.trim() : text}
          placeholder="z. B. „Um halb acht aufgewacht, gut geschlafen. Leichtes Bauchweh, krampfartig. Kein Kopfweh. Tinnitus links, Pfeifen.“"
          onChange={(e) => setText(e.target.value)}
          aria-label="Was du erzählst"
        />
        {dict.error && <p className="error small">{dict.error} Tipp: ins Feld tippen und das 🎤 der Tastatur nutzen.</p>}
        {dict.available && !dict.error && <small className="muted">Klappt das Mikrofon oben nicht, tipp ins Feld und nutze das 🎤 der Tastatur.</small>}
      </section>

      <section className="card speak-points" aria-live="polite">
        <h2>Das habe ich verstanden</h2>
        <ul>
          {visiblePoints.map((p) => {
            const done = pointDone(p);
            return (
              <li key={p.key} className={`sp-point ${done ? 'done' : ''} ${next === p ? 'next' : ''}`}>
                <div className="sp-head">
                  <span className="sp-icon" aria-hidden>{done ? '✓' : p.icon}</span>
                  <strong>{p.title}</strong>
                </div>
                {done && (
                  <div className="sp-values">
                    {p.wake && wake && <span className="sp-chip">aufgewacht {wake}</span>}
                    {p.fields
                      .filter((l) => l in values)
                      .map((l) => {
                        const f = fieldOf[l];
                        if (f.type === 'scale' && f.config.polarity !== 'higher-better')
                          return (
                            <div key={l} className="sp-scale">
                              <CompactScale field={f} value={values[l]} prev={null} onChange={(v) => setFix((x) => ({ ...x, [l]: v }))} />
                            </div>
                          );
                        return (
                          <span key={l} className="sp-chip">
                            {f.type === 'scale' ? `${l}: ` : f.type === 'text' || f.type === 'time' ? `${l.replace('?', '')}: ` : ''}
                            {formatValue(f, values[l])}
                            <button type="button" aria-label={`${l} entfernen`} onClick={() => setFix((x) => ({ ...x, [l]: null }))}>✕</button>
                          </span>
                        );
                      })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted small">Was du sagst, wird zusätzlich als Notiz gespeichert. Stärken kannst du oben antippen und ändern.</p>
      </section>

      <div className="actions sticky quick-save">
        <span className="muted small quick-count">{count ? `${count} ${count === 1 ? 'Angabe' : 'Angaben'} erkannt` : 'Noch nichts erkannt'}</span>
        <button type="button" className="btn primary" disabled={!count && !text.trim()} onClick={save}>
          Speichern
        </button>
      </div>
    </>
  );
}
