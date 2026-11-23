import { addDays, dayKey, monthKey, startOfDay, weekKey } from './dates';
import { aggregationOf, fieldSpec } from './fieldTypes';
import { daySlotStatus } from './schedule';
import type { Aggregation, Entry, FieldDef, Tracker } from './types';

/**
 * Generische Auswertungen. Funktionieren für jedes Feld eines jeden Trackers,
 * ausschließlich auf Basis der Feldtyp-Eigenschaften (numeric / categorical).
 */

export interface Point {
  t: number;
  v: number;
  entryId: string;
}

export interface Bucket {
  key: string;
  v: number;
  n: number;
}

export type Grouping = 'entry' | 'day' | 'week' | 'month';

export function numericFields(tracker: Tracker): FieldDef[] {
  return tracker.fields.filter((f) => fieldSpec(f).numeric);
}

export function categoricalFields(tracker: Tracker): FieldDef[] {
  return tracker.fields.filter((f) => fieldSpec(f).categorical);
}

export function entriesOf(tracker: Tracker, entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.trackerId === tracker.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function series(field: FieldDef, entries: Entry[]): Point[] {
  const spec = fieldSpec(field);
  const out: Point[] = [];
  for (const e of entries) {
    const v = spec.toNumber(field, e.values[field.id] ?? null);
    if (v !== null) out.push({ t: new Date(e.timestamp).getTime(), v, entryId: e.id });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function aggregate(values: number[], agg: Aggregation): number {
  if (!values.length) return 0;
  switch (agg) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    case 'last':
      return values[values.length - 1];
    case 'count':
      return values.length;
  }
}

const keyFn: Record<Exclude<Grouping, 'entry'>, (d: Date) => string> = {
  day: dayKey,
  week: weekKey,
  month: monthKey,
};

export function bucketize(points: Point[], grouping: Exclude<Grouping, 'entry'>, agg: Aggregation): Bucket[] {
  const groups = new Map<string, number[]>();
  for (const p of points) {
    const k = keyFn[grouping](new Date(p.t));
    const arr = groups.get(k);
    if (arr) arr.push(p.v);
    else groups.set(k, [p.v]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vs]) => ({ key, v: aggregate(vs, agg), n: vs.length }));
}

export function dailyValues(field: FieldDef, entries: Entry[]): Map<string, number> {
  return new Map(bucketize(series(field, entries), 'day', aggregationOf(field)).map((b) => [b.key, b.v]));
}

export interface FieldStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  last: number | null;
  /** Bester Tageswert (gemäß Aggregation des Feldes) und dessen Datum. */
  bestDay: { key: string; v: number } | null;
  /** Bester Einzelwert und Zeitpunkt. */
  bestEntry: { t: number; v: number } | null;
  /** Mittelwert der Tageswerte: letzte 7 Tage vs. 7 Tage davor. */
  trend: { recent: number | null; previous: number | null };
}

export function fieldStats(field: FieldDef, entries: Entry[], now = new Date()): FieldStats {
  const pts = series(field, entries);
  const vals = pts.map((p) => p.v);
  const days = bucketize(pts, 'day', aggregationOf(field));
  const bestDay = days.reduce<Bucket | null>((b, d) => (!b || d.v > b.v ? d : b), null);
  const bestEntry = pts.reduce<Point | null>((b, p) => (!b || p.v > b.v ? p : b), null);

  const today = startOfDay(now);
  const window = (fromOffset: number, toOffset: number) => {
    const from = dayKey(addDays(today, fromOffset));
    const to = dayKey(addDays(today, toOffset));
    const inRange = days.filter((d) => d.key >= from && d.key <= to).map((d) => d.v);
    return inRange.length ? aggregate(inRange, 'avg') : null;
  };

  return {
    count: vals.length,
    sum: aggregate(vals, 'sum'),
    avg: aggregate(vals, 'avg'),
    min: vals.length ? Math.min(...vals) : 0,
    max: vals.length ? Math.max(...vals) : 0,
    last: vals.length ? vals[vals.length - 1] : null,
    bestDay: bestDay ? { key: bestDay.key, v: bestDay.v } : null,
    bestEntry: bestEntry ? { t: bestEntry.t, v: bestEntry.v } : null,
    trend: { recent: window(-6, 0), previous: window(-13, -7) },
  };
}

/** Häufigkeiten von Kategorien (Auswahl, Mehrfachauswahl, Text, Checkbox). */
export function frequencies(field: FieldDef, entries: Entry[]): { label: string; count: number }[] {
  const spec = fieldSpec(field);
  const counts = new Map<string, { label: string; count: number }>();
  for (const e of entries) {
    for (const c of spec.categories(field, e.values[field.id] ?? null)) {
      const k = c.toLocaleLowerCase('de-DE');
      const cur = counts.get(k);
      if (cur) cur.count++;
      else counts.set(k, { label: c, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Tage in Folge (bis heute bzw. gestern) mit mindestens einem Eintrag. */
export function currentStreak(entries: Entry[], now = new Date()): number {
  const days = new Set(entries.map((e) => dayKey(new Date(e.timestamp))));
  let d = startOfDay(now);
  if (!days.has(dayKey(d))) d = addDays(d, -1); // heute noch offen → ab gestern zählen
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestStreak(entries: Entry[]): number {
  const keys = [...new Set(entries.map((e) => dayKey(new Date(e.timestamp))))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of keys) {
    run = prev && dayKey(addDays(new Date(`${prev}T12:00:00`), 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/** Pearson-Korrelationskoeffizient; null bei < 3 Paaren oder ohne Varianz. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = aggregate(xs.slice(0, n), 'avg');
  const my = aggregate(ys.slice(0, n), 'avg');
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function describeCorrelation(r: number | null): string {
  if (r === null) return 'Zu wenige Daten für eine Aussage.';
  const a = Math.abs(r);
  const strength = a < 0.1 ? 'kein' : a < 0.3 ? 'ein schwacher' : a < 0.5 ? 'ein mittlerer' : 'ein starker';
  if (a < 0.1) return 'Kein erkennbarer Zusammenhang.';
  const dir = r > 0 ? 'positiver' : 'negativer';
  const meaning = r > 0 ? 'steigt der eine Wert, steigt tendenziell auch der andere' : 'steigt der eine Wert, sinkt tendenziell der andere';
  return `Es besteht ${strength} ${dir} Zusammenhang (${meaning}). Korrelation ist keine Kausalität.`;
}

export interface MetricRef {
  trackerId: string;
  fieldId: string;
}

export interface PairedData {
  pairs: { x: number; y: number; label: string }[];
  /** 'entry' = gleiche Einträge (gleicher Tracker), 'day' = Tageswerte. */
  basis: 'entry' | 'day';
}

/**
 * Paart zwei Messgrößen für einen Vergleich. Innerhalb eines Trackers werden
 * Werte desselben Eintrags gepaart, trackerübergreifend die Tageswerte.
 * `lagDays` verschiebt B (z. B. Ernährung heute → Beschwerden morgen).
 */
export function pairMetrics(
  trackers: Tracker[],
  entries: Entry[],
  a: MetricRef,
  b: MetricRef,
  lagDays = 0,
): PairedData {
  const ta = trackers.find((t) => t.id === a.trackerId);
  const tb = trackers.find((t) => t.id === b.trackerId);
  const fa = ta?.fields.find((f) => f.id === a.fieldId);
  const fb = tb?.fields.find((f) => f.id === b.fieldId);
  if (!ta || !tb || !fa || !fb) return { pairs: [], basis: 'day' };

  if (ta.id === tb.id && lagDays === 0) {
    const sa = fieldSpec(fa);
    const sb = fieldSpec(fb);
    const pairs = entriesOf(ta, entries).flatMap((e) => {
      const x = sa.toNumber(fa, e.values[fa.id] ?? null);
      const y = sb.toNumber(fb, e.values[fb.id] ?? null);
      return x !== null && y !== null ? [{ x, y, label: e.timestamp }] : [];
    });
    return { pairs, basis: 'entry' };
  }

  const da = dailyValues(fa, entriesOf(ta, entries));
  const db = dailyValues(fb, entriesOf(tb, entries));
  const pairs: PairedData['pairs'] = [];
  for (const [k, x] of da) {
    const shifted = dayKey(addDays(new Date(`${k}T12:00:00`), lagDays));
    const y = db.get(shifted);
    if (y !== undefined) pairs.push({ x, y, label: k });
  }
  return { pairs, basis: 'day' };
}

export function entriesPerDay(entries: Entry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    const k = dayKey(new Date(e.timestamp));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Regelmäßigkeit (Idee aus Habit-Trackern wie Loop / mhabit, eigene Umsetzung)
// ---------------------------------------------------------------------------

/** Halbwertszeit in Tagen: so schnell "vergisst" der Score alte Tage. */
export const CONSISTENCY_HALF_LIFE = 14;

/**
 * Erfüllung eines Tages 0..1 – null, wenn der Tag nicht zählt
 * (Zukunft, oder Wochentag ohne geplante Erinnerung).
 */
export function dayCompletion(tracker: Tracker, entries: Entry[], day: Date, now: Date): number | null {
  const d = startOfDay(day);
  if (d > now) return null;
  if (tracker.schedule.mode === 'manual') {
    const k = dayKey(d);
    return entries.some((e) => e.trackerId === tracker.id && dayKey(new Date(e.timestamp)) === k) ? 1 : 0;
  }
  if (!tracker.schedule.weekdays.includes(d.getDay())) return null;
  const slots = daySlotStatus(tracker, entries, d);
  if (!slots.length) return null;
  // Heute zählen nur bereits fällige Slots.
  const relevant = dayKey(d) === dayKey(now) ? slots.filter((s) => s.slot <= now || s.done) : slots;
  if (!relevant.length) return null;
  return relevant.filter((s) => s.done).length / relevant.length;
}

/**
 * Regelmäßigkeits-Score 0..1 als exponentiell geglätteter Mittelwert der
 * Tageserfüllung. Ein verpasster Tag senkt den Score nur leicht, eine lange
 * Serie baut ihn stetig auf.
 */
export function consistencySeries(tracker: Tracker, entries: Entry[], now = new Date()): Bucket[] {
  const own = entries.filter((e) => e.trackerId === tracker.id);
  if (!own.length) return [];
  const first = startOfDay(new Date(Math.min(...own.map((e) => new Date(e.timestamp).getTime()))));
  const alpha = 1 - 0.5 ** (1 / CONSISTENCY_HALF_LIFE);
  let score = 0;
  const out: Bucket[] = [];
  for (let d = first; d <= now; d = addDays(d, 1)) {
    const c = dayCompletion(tracker, own, d, now);
    if (c === null) continue;
    score += alpha * (c - score);
    out.push({ key: dayKey(d), v: score, n: 1 });
  }
  return out;
}

export function consistencyScore(tracker: Tracker, entries: Entry[], now = new Date()): number | null {
  const s = consistencySeries(tracker, entries, now);
  return s.length ? s[s.length - 1].v : null;
}

// ---------------------------------------------------------------------------
// Zeitliche Verteilung (Idee aus Track & Graph: Zeit-Histogramm)
// ---------------------------------------------------------------------------

export interface TimeDistribution {
  byHour: number[];
  /** Index 0 = Montag … 6 = Sonntag. */
  byWeekday: number[];
  weighted: boolean;
}

/**
 * Wann treten Einträge auf? Optional gewichtet mit einem Zahlenfeld
 * (z. B. Schmerzstärke statt nur Anzahl). Bei Zeitraum-Feldern zählt der Beginn.
 */
export function timeDistribution(entries: Entry[], weightField?: FieldDef): TimeDistribution {
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const spec = weightField ? fieldSpec(weightField) : null;
  for (const e of entries) {
    let w = 1;
    if (weightField && spec) {
      const v = spec.toNumber(weightField, e.values[weightField.id] ?? null);
      if (v === null) continue;
      w = v;
    }
    const t = new Date(e.timestamp);
    byHour[t.getHours()] += w;
    byWeekday[(t.getDay() + 6) % 7] += w;
  }
  return { byHour, byWeekday, weighted: !!weightField };
}

/** Durchschnittlicher Abstand zwischen aufeinanderfolgenden Einträgen in Minuten. */
export function averageGapMinutes(entries: Entry[]): number | null {
  const ts = entries.map((e) => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
  if (ts.length < 2) return null;
  return (ts[ts.length - 1] - ts[0]) / (ts.length - 1) / 60000;
}
