import { formatValue, isEmptyValue, polarityOf, severity } from '../fields/fieldTypes';
import type { Entry, FieldDef, Tracker } from '../model/types';
import { levelText } from './feedback';

/**
 * Ein Eintrag als lesbare Zeile statt einer Liste von Feldwerten:
 * „🍽 Gegessen: Apfel, Joghurt“ · Beschwerden mit Stärke und Details · übrige Angaben kurz.
 */

export interface StorySymptom {
  label: string;
  value: number;
  /** 0 … 1 für die Farbe */
  level: number;
  text: string;
  details: string[];
}

export interface EntryStory {
  icon: string;
  title: string;
  symptoms: StorySymptom[];
  /** Beschwerden, die ausdrücklich mit 0 („keine“) angegeben wurden. */
  none: string[];
  /** Weitere Angaben, z. B. „Schlaf: 4 · gut“, „Wecker 07:00 Uhr“. */
  facts: string[];
  note?: string;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
const byLabel = (t: Tracker, l: string) => t.fields.find((f) => norm(f.label) === norm(l));

const EVENTS: [string, string, string, string?][] = [
  // Ereignis, Symbol, Titel, Feld mit den Details
  ['Medikament genommen', '💊', 'Medikament', 'Medikamente'],
  ['gegessen', '🍽', 'Gegessen', 'Was gegessen?'],
  ['getrunken', '🥤', 'Getrunken', 'Was getrunken?'],
  ['aufgestanden', '☀️', 'Aufgestanden'],
  ['schlafen gegangen', '🌙', 'Schlafen gegangen'],
  ['Bewegung', '🚶', 'Bewegung'],
  ['Pause / hingelegt', '🛋', 'Hingelegt'],
  ['geschlafen', '😴', 'Geschlafen'],
  ['Toilette', '🚻', 'Toilette'],
  ['Stress', '⚡', 'Stress'],
];

const SHORT: Record<string, string> = {
  Schlafqualität: 'Schlaf',
  'Wecker gestellt auf': 'Wecker',
  'Handy weggelegt um': 'Handy weg',
  'Gleich aufgestanden?': 'Aufgestanden',
  'Bezug zu Mahlzeiten': 'Bezug',
  'Was getrunken?': 'Getrunken',
  'Was gegessen?': 'Gegessen',
};

export function entryStory(tracker: Tracker, entry: Entry): EntryStory {
  const v = entry.values;
  const used = new Set<string>();
  const evField = byLabel(tracker, 'Was ist passiert?');
  const events = evField && Array.isArray(v[evField.id]) ? (v[evField.id] as string[]) : [];
  if (evField) used.add(evField.id);

  // Titel: das wichtigste Ereignis, mit seinen Details („Gegessen: Apfel, Joghurt“).
  let icon = '📝';
  let title = '';
  const titles: string[] = [];
  for (const [ev, ic, label, detail] of EVENTS) {
    const df = detail ? byLabel(tracker, detail) : undefined;
    const dv = df ? v[df.id] : undefined;
    const has = events.some((e) => norm(e) === norm(ev)) || (df && typeof dv === 'string' && dv.trim());
    if (!has) continue;
    if (!title) icon = ic;
    if (df && typeof dv === 'string' && dv.trim()) {
      titles.push(`${label}: ${dv.trim()}`);
      used.add(df.id);
    } else titles.push(label);
    if (!title) title = titles[0];
  }
  // Getränk zusätzlich zum Essen, auch ohne eigenes Ereignis.
  const drink = byLabel(tracker, 'Was getrunken?');
  if (drink && !used.has(drink.id) && typeof v[drink.id] === 'string' && (v[drink.id] as string).trim()) {
    titles.push(`Getrunken: ${(v[drink.id] as string).trim()}`);
    used.add(drink.id);
    if (!title) icon = '🥤';
  }
  for (const e of events) if (!EVENTS.some(([ev]) => norm(ev) === norm(e))) titles.push(e);

  // Beschwerden mit Details (Felder, die nur bei dieser Beschwerde erscheinen).
  const symptoms: StorySymptom[] = [];
  const none: string[] = [];
  for (const f of tracker.fields) {
    if (f.type !== 'scale' || polarityOf(f) !== 'higher-worse') continue;
    const x = v[f.id];
    if (typeof x !== 'number') continue;
    used.add(f.id);
    if (x === 0) {
      none.push(f.label);
      continue;
    }
    const details = tracker.fields
      .filter((d) => d.showIf?.fieldId === f.id && !isEmptyValue(v[d.id]))
      .map((d) => {
        used.add(d.id);
        return formatValue(d, v[d.id]);
      });
    symptoms.push({ label: f.label, value: x, level: severity(f, x) ?? 0, text: levelText(f, x), details });
  }
  symptoms.sort((a, b) => b.value - a.value);
  if (!titles.length) {
    icon = symptoms.length ? '🤕' : none.length ? '😊' : '📝';
    titles.push(symptoms.length ? 'Beschwerden' : none.length ? 'Keine Beschwerden' : 'Eintrag');
  }

  const note = tracker.fields.find((f) => f.type === 'text' && f.config.multiline);
  let noteText: string | undefined;
  if (note && typeof v[note.id] === 'string' && (v[note.id] as string).trim()) {
    noteText = (v[note.id] as string).trim();
    used.add(note.id);
  }

  const facts = tracker.fields
    .filter((f: FieldDef) => !used.has(f.id) && !isEmptyValue(v[f.id]) && v[f.id] !== false)
    .map((f) => `${SHORT[f.label] ?? f.label.replace(/\?$/, '')}: ${formatValue(f, v[f.id])}`);

  return { icon, title: titles.join(' · '), symptoms, none, facts, note: noteText };
}
