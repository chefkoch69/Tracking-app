import { useState } from 'react';
import { MOODS } from '../../core/diary/feedback';
import { entryFeedback } from '../../core/diary/feedback';
import { detailsOf, symptomFields } from '../../core/diary/moments';
import { questionFor } from '../../core/diary/moments';
import { dayKey } from '../../core/model/dates';
import { uid } from '../../core/model/id';
import type { Entry, FieldDef, FieldValue, Tracker } from '../../core/model/types';
import { useStore } from '../../state/store';
import { FieldInput, severityColor } from '../../components/fieldInputs';
import type { SavedNote } from './MomentCard';

/** Kurze Namen für die Kacheln. */
const TILE: Record<string, { icon: string; name: string }> = {
  Bauchschmerz: { icon: '🫃', name: 'Bauch' },
  Übelkeit: { icon: '🤢', name: 'Übel' },
  Kopfschmerz: { icon: '🤕', name: 'Kopf' },
  Tinnitus: { icon: '👂', name: 'Tinnitus' },
  Müdigkeit: { icon: '🥱', name: 'Müde' },
  Erschöpfung: { icon: '🪫', name: 'Erschöpft' },
  Kälteempfinden: { icon: '🥶', name: 'Kalt' },
};
const STEP_NAME: Record<number, string> = { 1: 'leicht', 2: 'mittel', 3: 'stark' };
const next = (v: number | undefined) => (v === undefined ? 1 : v >= 3 ? undefined : v + 1);

/**
 * Der Kern von „Heute“ – gebaut für Tage mit wenig Energie:
 * 1. Wie geht’s dir? Ein Tipp auf ein Gesicht ist schon gespeichert.
 * 2. Was ist los? Große Kacheln; jeder weitere Tipp macht es stärker.
 * 3. Speichern – oder „Alles gut“. Details nur, wenn man will.
 */
export function QuickCheck({ tracker, onSaved }: { tracker: Tracker; onSaved: (s: SavedNote) => void }) {
  const { data, dispatch } = useStore();
  const today = dayKey(new Date());
  const mood = data.days?.[today]?.mood;
  const { main } = symptomFields(tracker);
  const tiles = main.filter((f) => TILE[f.label]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [details, setDetails] = useState<Record<string, FieldValue>>({});
  const [showDetails, setShowDetails] = useState(false);
  const [open, setOpen] = useState(false);
  const chosen = tiles.filter((f) => levels[f.id] !== undefined);

  const save = (vals: Record<string, FieldValue>) => {
    const entry: Entry = { id: uid(), trackerId: tracker.id, timestamp: new Date().toISOString(), values: vals };
    dispatch({ type: 'entry/save', entry });
    onSaved({ entry, changes: entryFeedback(tracker, [...data.entries, entry], entry), hint: null });
    setLevels({});
    setDetails({});
    setShowDetails(false);
    setOpen(false);
    setDone(true);
  };
  const saveChosen = () => {
    const vals: Record<string, FieldValue> = Object.fromEntries(chosen.map((f) => [f.id, levels[f.id]]));
    for (const f of chosen) for (const d of detailsOf(tracker, f)) if (details[d.id] !== undefined && details[d.id] !== null) vals[d.id] = details[d.id];
    save(vals);
  };
  const allGood = () => save(Object.fromEntries(tiles.map((f) => [f.id, 0])));
  const [done, setDone] = useState(false);
  const pickMood = (v: number) => {
    if (mood !== v) dispatch({ type: 'day/update', date: today, patch: { mood: v } });
    setOpen(true);
    setDone(false);
  };

  const detailFields: FieldDef[] = chosen.flatMap((f) => detailsOf(tracker, f).filter((d) => d.type !== 'timerange'));

  return (
    <section className="card quick-check">
      <h2 className="qc-question">Wie geht’s dir gerade?</h2>
      <div className="qc-moods" role="radiogroup" aria-label="Wie geht’s dir?">
        {MOODS.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={mood === m.value} className={`qc-mood ${mood === m.value ? 'on' : ''}`} onClick={() => pickMood(m.value)}>
            <span aria-hidden>{m.icon}</span>
            <small>{m.label}</small>
          </button>
        ))}
      </div>

      {done && !open && <p className="qc-thanks">Danke 💚 Wenn sich etwas ändert, tipp einfach nochmal.</p>}
      {!done && !open && mood !== undefined && (
        <button type="button" className="linkish qc-more" onClick={() => setOpen(true)}>
          Beschwerden eintragen
        </button>
      )}

      {open && (
        <>
          <h3 className="qc-sub">Was ist los? <small className="muted">Tippen = stärker</small></h3>
          <div className="qc-tiles">
            {tiles.map((f) => {
              const v = levels[f.id];
              const t = TILE[f.label];
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`qc-tile ${v ? 'on' : ''}`}
                  style={v ? ({ '--sev': severityColor(v / 3) } as React.CSSProperties) : undefined}
                  aria-label={`${f.label}${v ? `: ${STEP_NAME[v]}` : ''}`}
                  onClick={() => setLevels((s) => {
                    const n = next(s[f.id]);
                    const copy = { ...s };
                    if (n === undefined) delete copy[f.id];
                    else copy[f.id] = n;
                    return copy;
                  })}
                >
                  <span className="qc-ticon" aria-hidden>{t.icon}</span>
                  <span className="qc-tname">{t.name}</span>
                  <span className="qc-level">{v ? STEP_NAME[v] : ' '}</span>
                  {v ? <span className="qc-dots" aria-hidden>{'●'.repeat(v)}{'○'.repeat(3 - v)}</span> : null}
                </button>
              );
            })}
          </div>

          {chosen.length > 0 && detailFields.length > 0 && (
            showDetails ? (
              <div className="qc-details">
                {detailFields.map((d) => (
                  <div key={d.id} className="field quick-field">
                    <label htmlFor={`qc-${d.id}`}>{questionFor(d.label, d.description).ask}</label>
                    <FieldInput id={`qc-${d.id}`} field={d} value={details[d.id] ?? null} onChange={(v) => setDetails((s) => ({ ...s, [d.id]: v }))} />
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" className="linkish qc-more" onClick={() => setShowDetails(true)}>
                ＋ genauer beschreiben (optional)
              </button>
            )
          )}

          <div className="qc-actions">
            {chosen.length > 0 ? (
              <button type="button" className="btn primary big" onClick={saveChosen}>
                Speichern
              </button>
            ) : (
              <button type="button" className="btn big qc-good" onClick={allGood}>
                ✓ Keine Beschwerden
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
