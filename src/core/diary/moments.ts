import { entriesOf } from '../analysis/analytics';
import { dayKey } from '../model/dates';
import { isEmptyValue, itemName, listItems, polarityOf } from '../fields/fieldTypes';
import { isFoodField } from '../analysis/foodGroups';
import type { Entry, FieldDef, FieldValue, Tracker } from '../model/types';

/**
 * Momente des Körper-Tagebuchs: Statt eines großen Formulars fragt jeder Moment nur, was
 * dazu gehört. Felder werden über ihre Bezeichnung gefunden (fehlende einfach ausgelassen) –
 * so funktioniert es mit jeder Version von „Mein Befinden“ und mit eigenen Anpassungen.
 */

export type MomentKey = 'morning' | 'meal' | 'symptom' | 'med' | 'evening' | 'all';

export interface MomentField {
  label: string;
  /** Andere Frage im Formular, z. B. „Vor dem Schlafen noch was getrunken?“ */
  ask?: string;
}

export interface Moment {
  key: MomentKey;
  icon: string;
  label: string;
  hint: string;
  fields: MomentField[];
  /** Beschwerden-Check: Hauptbeschwerden, alle, nur auf Wunsch oder keiner. */
  symptoms: 'main' | 'all' | 'optional' | 'none';
  /** Wird in „Was ist passiert?“ vermerkt. */
  event?: string;
  /** Aufwachzeit (aus Health oder selbst) anbieten. */
  wake?: boolean;
}

/** Die Beschwerden, die im Kurz-Check immer oben stehen. */
export const MAIN_SYMPTOMS = ['Bauchschmerz', 'Übelkeit', 'Kopfschmerz', 'Tinnitus', 'Müdigkeit', 'Erschöpfung', 'Kälteempfinden'];

/**
 * Wie ein Feld beim Eintragen gefragt wird: eine kurze, natürliche Frage statt der
 * Feldbezeichnung, darunter höchstens ein kurzes Beispiel. Gilt für alle Eingaben.
 */
export const QUESTIONS: Record<string, { ask: string; hint?: string }> = {
  'Was ist passiert?': { ask: 'Was ist passiert?' },
  'Was gegessen?': { ask: 'Was hast du gegessen?', hint: 'Mit Komma trennen, z. B. 2 Brote, Käse, Apfel' },
  'Was getrunken?': { ask: 'Was hast du getrunken?', hint: 'z. B. Kaffee, 0,5 l Wasser' },
  Medikamente: { ask: 'Welches Medikament?', hint: 'Name und Dosis, z. B. Buscopan 10 mg' },
  Maßnahmen: { ask: 'Was hast du sonst dagegen gemacht?', hint: 'z. B. Wärmflasche, hingelegt, Spaziergang' },
  'Gleich aufgestanden?': { ask: 'Bist du gleich aufgestanden?' },
  'Wecker gestellt auf': { ask: 'Worauf war der Wecker gestellt?' },
  Schlafqualität: { ask: 'Wie hast du geschlafen?' },
  'Handy weggelegt um': { ask: 'Wann hast du das Handy weggelegt?' },
  'Art der Bauchschmerzen': { ask: 'Wie fühlt sich der Bauch an?' },
  Lokalisation: { ask: 'Wo genau?' },
  'Uhrzeit von–bis': { ask: 'Seit wann – bis wann?' },
  'Bezug zu Mahlzeiten': { ask: 'Hat es mit dem Essen zu tun?' },
  Stuhlgang: { ask: 'Stuhlgang', hint: '0 kein · 1 hart · 2 geformt · 3 weich · 4 flüssig' },
  'Kopf – wo?': { ask: 'Wo am Kopf?' },
  'Art der Kopfschmerzen': { ask: 'Wie fühlt sich der Kopfschmerz an?' },
  'Kopfschmerz von–bis': { ask: 'Seit wann – bis wann?' },
  'Tinnitus – Ohr': { ask: 'Welches Ohr?' },
  'Tinnitus – Klang': { ask: 'Wie klingt es?' },
  'Tinnitus – Verlauf': { ask: 'Wie verläuft es?' },
  'Art der Erschöpfung': { ask: 'Wie zeigt sich die Erschöpfung?' },
  'Wo kalt?': { ask: 'Wo ist dir kalt?' },
  Raumtemperatur: { ask: 'Wie warm ist es im Raum?' },
  Notiz: { ask: 'Sonst noch etwas?', hint: 'Alles, was dir wichtig ist' },
};

/** Frage und Beispiel zu einem Feld – eigene Felder behalten ihre Bezeichnung. */
export function questionFor(label: string, description?: string): { ask: string; hint?: string } {
  const q = QUESTIONS[label.trim()];
  return q ? { ask: q.ask, hint: q.hint } : { ask: label, hint: description };
}

export const MOMENTS: Moment[] = [
  {
    key: 'morning',
    icon: '☀️',
    label: 'Aufgestanden',
    hint: 'Wie hast du geschlafen, wie geht’s dir?',
    fields: [{ label: 'Gleich aufgestanden?' }, { label: 'Wecker gestellt auf' }, { label: 'Schlafqualität' }],
    symptoms: 'main',
    event: 'aufgestanden',
    wake: true,
  },
  {
    key: 'meal',
    icon: '🍽',
    label: 'Essen & Trinken',
    hint: 'Was und wann',
    fields: [{ label: 'Was gegessen?' }, { label: 'Was getrunken?' }],
    symptoms: 'optional',
    event: 'gegessen',
  },
  {
    key: 'symptom',
    icon: '🤕',
    label: 'Beschwerde',
    hint: 'Bauch, Kopf, Tinnitus, …',
    fields: [],
    symptoms: 'all',
  },
  {
    key: 'med',
    icon: '💊',
    label: 'Medikament & Maßnahme',
    hint: 'Tablette, Wärmflasche, hinlegen …',
    fields: [{ label: 'Medikamente' }, { label: 'Maßnahmen' }],
    symptoms: 'optional',
    event: 'Medikament genommen',
  },
  {
    key: 'evening',
    icon: '🌙',
    label: 'Schlafen gehen',
    hint: 'Handy, Wecker, wie geht’s dir?',
    fields: [
      { label: 'Handy weggelegt um' },
      { label: 'Was getrunken?', ask: 'Vor dem Schlafen noch etwas getrunken?' },
      { label: 'Wecker gestellt auf', ask: 'Worauf stellst du den Wecker?' },
    ],
    symptoms: 'main',
    event: 'schlafen gegangen',
  },
  {
    key: 'all',
    icon: '✏️',
    label: 'Alles',
    hint: 'alle Felder, auch Stuhlgang & Notiz',
    fields: [],
    symptoms: 'none',
  },
];

export const momentByKey = (k: string | undefined) => MOMENTS.find((m) => m.key === k);

const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
export const fieldByLabel = (t: Tracker, label: string) => t.fields.find((f) => !f.hidden && norm(f.label) === norm(label));

/** Beschwerden (Skalen, höher = schlechter) eines Trackers – Hauptbeschwerden zuerst. */
export function symptomFields(t: Tracker): { main: FieldDef[]; more: FieldDef[] } {
  const all = t.fields.filter((f) => !f.hidden && f.type === 'scale' && polarityOf(f) === 'higher-worse');
  const main = MAIN_SYMPTOMS.map((l) => all.find((f) => norm(f.label) === norm(l))).filter((f): f is FieldDef => !!f);
  return { main: main.length ? main : all, more: main.length ? all.filter((f) => !main.includes(f)) : [] };
}

/** Details, die zu einer Beschwerde gehören (Bedingung zeigt auf sie) – aus ihrem Abschnitt zuerst. */
export const detailsOf = (t: Tracker, symptom: FieldDef) => {
  const list = t.fields.filter((f) => !f.hidden && f.showIf?.fieldId === symptom.id);
  return [...list.filter((f) => f.group === symptom.group), ...list.filter((f) => f.group !== symptom.group)];
};

/** Ereignis passend zum Moment eintragen (z. B. „gegessen“ – oder „getrunken“, wenn nur getrunken wurde). */
export function withEvent(t: Tracker, m: Moment, values: Record<string, FieldValue>): Record<string, FieldValue> {
  const evField = t.fields.find((f) => f.type === 'multiselect' && norm(f.label) === norm('Was ist passiert?'));
  if (!evField || !m.event) return values;
  let ev = m.event;
  if (m.key === 'meal') {
    const ate = fieldByLabel(t, 'Was gegessen?');
    const drank = fieldByLabel(t, 'Was getrunken?');
    if (ate && isEmptyValue(values[ate.id]) && drank && !isEmptyValue(values[drank.id])) ev = 'getrunken';
  }
  if (m.key === 'med') {
    const meds = fieldByLabel(t, 'Medikamente');
    if (!meds || isEmptyValue(values[meds.id])) return values;
  }
  const opt = (evField.config.options ?? []).find((o) => norm(o) === norm(ev));
  if (!opt) return values;
  const cur = Array.isArray(values[evField.id]) ? (values[evField.id] as string[]) : [];
  return cur.includes(opt) ? values : { ...values, [evField.id]: [...cur, opt] };
}

/** Vorschlag je nach Tageszeit: morgens „Aufgestanden“, abends „Schlafen gehen“. */
export function suggestedMoment(t: Tracker, entries: Entry[], now: Date): MomentKey | null {
  const h = now.getHours();
  const today = entriesOf(t, entries).filter((e) => dayKey(new Date(e.timestamp)) === dayKey(now));
  const has = (ev: string) => today.some((e) => Object.values(e.values).some((v) => Array.isArray(v) && v.includes(ev)));
  if (h >= 4 && h < 12 && !has('aufgestanden')) return 'morning';
  if ((h >= 21 || h < 3) && !has('schlafen gegangen')) return 'evening';
  return null;
}

// ---------------------------------------------------------------------------
// Nachfragen nach dem Essen

export interface FollowUp {
  meal: Entry;
  minutesAgo: number;
  /** Was gegessen/getrunken wurde, kurz. */
  what: string;
}

/**
 * Nach einer Mahlzeit (vor 30 Minuten bis 4 Stunden) ohne spätere Angabe zu Beschwerden:
 * nachfragen, wie es einem jetzt geht – genau diese Angaben braucht die Auswertung.
 */
export function pendingFollowUp(t: Tracker, entries: Entry[], now: Date, dismissed: string[] = []): FollowUp | null {
  const es = entriesOf(t, entries);
  const food = t.fields.filter((f) => isFoodField(f));
  const scales = t.fields.filter((f) => f.type === 'scale' && polarityOf(f) === 'higher-worse');
  for (let i = es.length - 1; i >= 0; i--) {
    const e = es[i];
    const ago = (now.getTime() - new Date(e.timestamp).getTime()) / 60000;
    if (ago > 240) break;
    if (ago < 30) continue;
    const items = food.flatMap((f) => (typeof e.values[f.id] === 'string' ? listItems(e.values[f.id] as string) : []));
    if (!items.length || dismissed.includes(e.id)) continue;
    const later = es.slice(i + 1).some((x) => scales.some((f) => typeof x.values[f.id] === 'number'));
    if (later) return null;
    return { meal: e, minutesAgo: Math.round(ago), what: items.map(itemName).join(', ') };
  }
  return null;
}
