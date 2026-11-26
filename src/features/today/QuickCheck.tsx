import { useState } from 'react';
import { Doodle } from '../../components/Doodle';
import { MOODS, entryFeedback } from '../../core/diary/feedback';
import { detailsOf, questionFor, symptomFields } from '../../core/diary/moments';
import { dayKey } from '../../core/model/dates';
import { uid } from '../../core/model/id';
import type { Entry, FieldDef, FieldValue, Tracker } from '../../core/model/types';
import { useStore } from '../../state/store';
import { FieldInput, severityColor } from '../../components/fieldInputs';
import type { SavedNote } from './MomentCard';

/** Kurze Namen und feste Farben für die Kacheln. */
const TILE: Record<string, { icon: string; name: string; color: string }> = {
  Bauchschmerz: { icon: 'belly', name: 'Bauch', color: '#E8835F' },
  Übelkeit: { icon: 'nausea', name: 'Übel', color: '#8DBA5E' },
  'Nase zu': { icon: 'nose', name: 'Nase zu', color: '#7C93C9' },
  Kopfschmerz: { icon: 'head', name: 'Kopf', color: '#E06A78' },
  Tinnitus: { icon: 'ear', name: 'Tinnitus', color: '#5E9FD8' },
  Müdigkeit: { icon: 'tired', name: 'Müde', color: '#A584D6' },
  Erschöpfung: { icon: 'battery', name: 'Erschöpft', color: '#E3A93B' },
  Kälteempfinden: { icon: 'cold', name: 'Kalt', color: '#4FB3C4' },
};
export const MOOD_BLOB = ['', '#E06A78', '#EE9A6B', '#E9C35A', '#8DBA5E', '#4FAF92'];

/** Vier Stufen – jeder Tipp eine Stufe stärker, nach „stark“ wieder leer. */
const STEPS = [0.5, 1, 2, 3];
const STEP_NAME: Record<number, string> = { 0.5: 'sehr leicht', 1: 'leicht', 2: 'mittel', 3: 'stark' };
const next = (v: number | undefined) => {
  if (v === undefined) return STEPS[0];
  const i = STEPS.indexOf(v);
  return i < 0 || i === STEPS.length - 1 ? undefined : STEPS[i + 1];
};

/**
 * „Jetzt“: Stimmung (ein Tipp speichert sie für den Tag) und Beschwerde-Kacheln.
 * Jeder Tipp auf eine Kachel = eine Stufe stärker. Details (z. B. die Bauch-Karte)
 * erscheinen sofort unter den Kacheln, sobald eine Beschwerde gewählt ist.
 */
export function QuickCheck({ tracker, onSaved }: { tracker: Tracker; onSaved: (s: SavedNote) => void }) {
  const { data, dispatch } = useStore();
  const today = dayKey(new Date());
  const mood = data.days?.[today]?.mood;
  const tiles = symptomFields(tracker).main.filter((f) => TILE[f.label]);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [details, setDetails] = useState<Record<string, FieldValue>>({});
  const chosen = tiles.filter((f) => levels[f.id] !== undefined);

  const save = (vals: Record<string, FieldValue>) => {
    const entry: Entry = { id: uid(), trackerId: tracker.id, timestamp: new Date().toISOString(), values: vals };
    dispatch({ type: 'entry/save', entry });
    onSaved({ entry, changes: entryFeedback(tracker, [...data.entries, entry], entry), hint: null });
    setLevels({});
    setDetails({});
  };
  const saveChosen = () => {
    const vals: Record<string, FieldValue> = Object.fromEntries(chosen.map((f) => [f.id, levels[f.id]]));
    for (const f of chosen) for (const d of detailsOf(tracker, f)) if (details[d.id] !== undefined && details[d.id] !== null) vals[d.id] = details[d.id];
    save(vals);
  };
  const allGood = () => save(Object.fromEntries(tiles.map((f) => [f.id, 0])));
  const tap = (f: FieldDef) =>
    setLevels((s) => {
      const n = next(s[f.id]);
      const copy = { ...s };
      if (n === undefined) delete copy[f.id];
      else copy[f.id] = n;
      return copy;
    });

  return (
    <div className="qc" data-dirty={chosen.length > 0 ? 'true' : undefined}>
      <div className="qc-row-head">
        <span className="qc-label">Stimmung</span>
      </div>
      <div className="qc-moods" role="radiogroup" aria-label="Wie geht’s dir?">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mood === m.value}
            className={`qc-mood ${mood === m.value ? 'on' : ''}`}
            style={{ '--cat': MOOD_BLOB[m.value] } as React.CSSProperties}
            onClick={() => dispatch({ type: 'day/update', date: today, patch: { mood: mood === m.value ? undefined : m.value } })}
          >
            <Doodle name={`face${m.value}`} size={38} />
            <small>{m.label}</small>
          </button>
        ))}
      </div>

      <div className="qc-row-head">
        <span className="qc-label">Beschwerden</span>
        <small className="muted">1 Tipp = sehr leicht · 4 Tipps = stark</small>
      </div>
      <div className="qc-tiles">
        {tiles.map((f) => {
          const v = levels[f.id];
          const t = TILE[f.label];
          const step = v === undefined ? 0 : STEPS.indexOf(v) + 1;
          return (
            <button
              key={f.id}
              type="button"
              className={`qc-tile ${v !== undefined ? 'on' : ''}`}
              style={{ '--cat': t.color, ...(v !== undefined ? { '--sev': severityColor(v / 3) } : {}) } as React.CSSProperties}
              aria-label={`${f.label}${v !== undefined ? `: ${STEP_NAME[v]}` : ''}`}
              onClick={() => tap(f)}
            >
              <Doodle className="qc-ticon" name={t.icon} size={34} />
              <span className="qc-tname">{t.name}</span>
              <span className="qc-steps" aria-hidden>
                {STEPS.map((_, i) => (
                  <i key={i} className={i < step ? 'on' : ''} />
                ))}
              </span>
              <span className="qc-level">{v !== undefined ? STEP_NAME[v] : ' '}</span>
            </button>
          );
        })}
      </div>

      {chosen.map((f) => {
        const ds = detailsOf(tracker, f).filter((d) => d.type !== 'timerange');
        if (!ds.length) return null;
        return (
          <div key={f.id} className="qc-details" style={{ '--cat': TILE[f.label].color } as React.CSSProperties}>
            <span className="qc-details-title">{TILE[f.label].name} – genauer</span>
            {ds.map((d) => (
              <div key={d.id} className="field quick-field">
                <label htmlFor={`qc-${d.id}`}>{questionFor(d.label, d.description).ask}</label>
                <FieldInput id={`qc-${d.id}`} field={d} value={details[d.id] ?? null} onChange={(val) => setDetails((s) => ({ ...s, [d.id]: val }))} />
              </div>
            ))}
          </div>
        );
      })}

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
    </div>
  );
}
