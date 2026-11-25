import { entriesOf } from '../analysis/analytics';
import { addDays, dayKey, parseDayKey, startOfDay } from '../model/dates';
import { fieldSpec, fmtLevel, isEmptyValue, listItems, itemName, polarityOf, scaleLevels, severity } from '../fields/fieldTypes';
import type { Entry, FieldDef, Tracker } from '../model/types';

/**
 * Rückmeldungen rund ums Eintragen: Was hat sich seit dem letzten Mal verändert,
 * wie sieht der Tag bisher aus, wie weit ist es bis zu ersten Mustern und zum Arzttermin.
 */

export type Direction = 'better' | 'worse' | 'same';

export interface ValueChange {
  field: FieldDef;
  value: number;
  prev: number;
  prevAt: Date;
  direction: Direction;
}

const numeric = (f: FieldDef) => f.type === 'scale' || f.type === 'number' || f.type === 'measurement';

/** Vergleich jeder bewerteten Angabe mit dem letzten Wert davor (innerhalb von `windowH` Stunden). */
export function entryFeedback(tracker: Tracker, entries: Entry[], entry: Entry, windowH = 24): ValueChange[] {
  const t0 = new Date(entry.timestamp).getTime();
  const before = entriesOf(tracker, entries).filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return e.id !== entry.id && t <= t0 && t >= t0 - windowH * 3600e3;
  });
  const out: ValueChange[] = [];
  for (const f of tracker.fields) {
    if (!numeric(f) || polarityOf(f) === 'neutral') continue;
    const spec = fieldSpec(f);
    const v = spec.toNumber(f, entry.values[f.id] ?? null);
    if (v === null) continue;
    for (let i = before.length - 1; i >= 0; i--) {
      const p = spec.toNumber(f, before[i].values[f.id] ?? null);
      if (p === null) continue;
      const lower = v < p;
      const direction: Direction = v === p ? 'same' : lower === (polarityOf(f) === 'higher-worse') ? 'better' : 'worse';
      out.push({ field: f, value: v, prev: p, prevAt: new Date(before[i].timestamp), direction });
      break;
    }
  }
  return out;
}

/** Wert mit Stufenname, z. B. „2 · mittel“. */
export function levelText(f: FieldDef, v: number): string {
  if (f.type !== 'scale') return `${fmtLevel(v)}${f.config.unit ? ` ${f.config.unit}` : ''}`;
  const l = scaleLevels(f.config).find((x) => x.value === v)?.label;
  return l ? `${fmtLevel(v)} · ${l}` : fmtLevel(v);
}

// ---------------------------------------------------------------------------
// Tagesrhythmus: Beschwerden und Ereignisse eines Tages auf einer Zeitachse

export type EventKind = 'meal' | 'drink' | 'med' | 'rest' | 'wake' | 'move' | 'other';

export interface RhythmPoint {
  entryId: string;
  minutes: number;
  value: number;
  /** 0 (keine) … 1 (stärkste Stufe) */
  level: number;
  text: string;
}
export interface RhythmRow {
  field: FieldDef;
  points: RhythmPoint[];
}
export interface RhythmEvent {
  entryId: string;
  minutes: number;
  kind: EventKind;
  label: string;
}
export interface DayRhythm {
  rows: RhythmRow[];
  events: RhythmEvent[];
  /** Sichtbarer Ausschnitt in Minuten seit Mitternacht. */
  from: number;
  to: number;
}

function eventKind(text: string, field: FieldDef): EventKind {
  const s = `${text} ${field.label}`.toLocaleLowerCase('de-DE');
  if (/medikament|tablette|mg\b/.test(s)) return 'med';
  if (/gegessen|essen|mahlzeit|frühstück|mittag|abendessen/.test(s)) return 'meal';
  if (/getrunken|trinken|kaffee|tee\b/.test(s)) return 'drink';
  if (/aufgestanden|aufstehen/.test(s)) return 'wake';
  if (/geschlafen|schlaf|pause|hingelegt|nap/.test(s)) return 'rest';
  if (/bewegung|sport|spazier|training|gelaufen/.test(s)) return 'move';
  return 'other';
}

/**
 * Symptome (bewertete Skalen mit Werten an diesem Tag) und Ereignisse (Mehrfachauswahl,
 * Listen wie „Was gegessen?“) eines Tages – für die kompakte Tagesansicht.
 */
export function dayRhythm(tracker: Tracker, entries: Entry[], day: Date): DayRhythm {
  const key = dayKey(day);
  const es = entriesOf(tracker, entries).filter((e) => dayKey(new Date(e.timestamp)) === key);
  const minutesOf = (e: Entry) => {
    const d = new Date(e.timestamp);
    return d.getHours() * 60 + d.getMinutes();
  };
  const symptomGroups = new Set(tracker.fields.filter((f) => f.type === 'scale' && f.group).map((f) => f.group));
  const rows: RhythmRow[] = [];
  for (const f of tracker.fields) {
    if (f.hidden || f.type !== 'scale' || polarityOf(f) === 'neutral') continue;
    const points: RhythmPoint[] = [];
    for (const e of es) {
      const v = e.values[f.id];
      if (typeof v !== 'number') continue;
      points.push({ entryId: e.id, minutes: minutesOf(e), value: v, level: severity(f, v) ?? 0, text: levelText(f, v) });
    }
    if (points.length) rows.push({ field: f, points });
  }
  // Ereignisse: Listen (Essen, Medikamente) und Mehrfachauswahl außerhalb von Beschwerde-Abschnitten.
  const eventFields = tracker.fields.filter(
    (f) => (f.type === 'text' && f.config.splitList) || (f.type === 'multiselect' && !(f.group && symptomGroups.has(f.group))),
  );
  const events: RhythmEvent[] = [];
  for (const e of es) {
    const found: RhythmEvent[] = [];
    for (const f of eventFields) {
      const v = e.values[f.id];
      if (isEmptyValue(v)) continue;
      if (f.type === 'text' && typeof v === 'string') {
        const items = listItems(v);
        if (!items.length) continue;
        const kind = eventKind(items.map(itemName).join(' '), f);
        // „gegessen“ aus der Auswahl wird durch die genauere Liste ersetzt.
        const i = found.findIndex((x) => x.kind === kind);
        const ev = { entryId: e.id, minutes: minutesOf(e), kind, label: items.join(', ') };
        if (i >= 0) found[i] = ev;
        else found.push(ev);
      } else if (Array.isArray(v)) {
        for (const item of v) {
          const kind = eventKind(item, { ...f, label: '' });
          if (found.some((x) => x.kind === kind && kind !== 'other')) continue;
          found.push({ entryId: e.id, minutes: minutesOf(e), kind, label: item });
        }
      }
    }
    events.push(...found);
  }
  const all = [...rows.flatMap((r) => r.points.map((p) => p.minutes)), ...events.map((e) => e.minutes)];
  const first = all.length ? Math.min(...all) : 8 * 60;
  const last = all.length ? Math.max(...all) : 20 * 60;
  const from = Math.max(0, Math.floor(Math.min(6 * 60, first - 30) / 60) * 60);
  const to = Math.min(24 * 60, Math.ceil(Math.max(22 * 60, last + 30) / 60) * 60);
  return { rows, events, from, to };
}

// ---------------------------------------------------------------------------
// Fortschritt bis zu ersten Mustern

export interface Readiness {
  /** Tage mit Einträgen in den letzten 4 Wochen. */
  days: number;
  need: number;
  ready: boolean;
}

/** Ab etwa einer Woche mit Einträgen lassen sich erste Muster erkennen. */
export function insightReadiness(trackers: Tracker[], entries: Entry[], now: Date, need = 7): Readiness {
  const ids = new Set(trackers.filter((t) => !t.archived && !t.demo).map((t) => t.id));
  const since = dayKey(addDays(startOfDay(now), -27));
  const days = new Set(
    entries.filter((e) => ids.has(e.trackerId)).map((e) => dayKey(new Date(e.timestamp))).filter((k) => k >= since),
  ).size;
  return { days, need, ready: days >= need };
}

// ---------------------------------------------------------------------------
// Arzttermin

/** Tage bis zum Termin (0 = heute, negativ = vorbei). */
export function daysUntil(dateKey: string, now: Date): number {
  return Math.round((parseDayKey(dateKey).getTime() - startOfDay(now).getTime()) / 86400000);
}

export function appointmentLabel(dateKey: string, now: Date): string {
  const n = daysUntil(dateKey, now);
  if (n === 0) return 'heute';
  if (n === 1) return 'morgen';
  if (n === 2) return 'übermorgen';
  if (n > 0) return `in ${n} Tagen`;
  if (n === -1) return 'war gestern';
  return `war vor ${-n} Tagen`;
}

/** Fragen für den Termin: eine pro Zeile, leere Zeilen und Aufzählungszeichen entfernt. */
export function questionList(text: string | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Tagesübersicht (Tagebuch)

export const MOODS = [
  { value: 1, icon: '😣', label: 'schlecht' },
  { value: 2, icon: '🙁', label: 'eher schlecht' },
  { value: 3, icon: '😐', label: 'okay' },
  { value: 4, icon: '🙂', label: 'gut' },
  { value: 5, icon: '😄', label: 'sehr gut' },
];

export interface DaySummary {
  date: string;
  entries: number;
  mood?: number;
  note?: string;
  wake?: string;
  sleepHours?: number;
  steps?: number;
  /** Stärkste Beschwerde des Tages. */
  worst?: { label: string; value: number; level: number; text: string };
  /** Alle Beschwerden des Tages (Tageshöchstwert ≥ 1), stärkste zuerst. */
  symptoms: { label: string; value: number; level: number }[];
}

/** Was einen Tag ausmacht – für Tagesliste, Monatskalender und Tagesseite. */
export function daySummary(
  trackers: Tracker[],
  entries: Entry[],
  date: string,
  health?: Record<string, { wake?: string; sleepHours?: number; steps?: number }>,
  days?: Record<string, { mood?: number; note?: string }>,
): DaySummary {
  const ids = new Set(trackers.map((t) => t.id));
  const es = entries.filter((e) => ids.has(e.trackerId) && dayKey(new Date(e.timestamp)) === date);
  let worst: DaySummary['worst'];
  const max: Record<string, { value: number; level: number }> = {};
  for (const e of es) {
    const t = trackers.find((x) => x.id === e.trackerId)!;
    for (const f of t.fields) {
      if (f.type !== 'scale' || polarityOf(f) !== 'higher-worse') continue;
      const v = e.values[f.id];
      if (typeof v !== 'number') continue;
      const lv = severity(f, v) ?? 0;
      if (v >= 1 && (!max[f.label] || v > max[f.label].value)) max[f.label] = { value: v, level: lv };
      if (lv > 0 && (!worst || lv > worst.level)) worst = { label: f.label, value: v, level: lv, text: levelText(f, v) };
    }
  }
  const h = health?.[date];
  const d = days?.[date];
  const symptoms = Object.entries(max)
    .map(([label, x]) => ({ label, ...x }))
    .sort((a, b) => b.value - a.value);
  return { date, entries: es.length, mood: d?.mood, note: d?.note, wake: h?.wake, sleepHours: h?.sleepHours, steps: h?.steps, worst, symptoms };
}
