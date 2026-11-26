import { addDays, dayKey, startOfDay, entryDay } from '../model/dates';
import { polarityOf } from '../fields/fieldTypes';
import type { DayNote, Entry, HealthDay, Tracker } from '../model/types';

/**
 * Wochenrückblick: diese Woche (Montag bis heute) im Vergleich zu denselben Tagen der Vorwoche –
 * wie viele Tage mit Beschwerden, wie stark, Stimmung und Schlaf.
 */

export interface WeekSymptom {
  label: string;
  /** Tage mit der Beschwerde (Tageshöchstwert ≥ 1) */
  days: number;
  prevDays: number;
  /** Durchschnitt der Tageshöchstwerte an Tagen mit Angabe */
  avg: number | null;
  prevAvg: number | null;
  direction: 'better' | 'worse' | 'same';
}

export interface WeekReview {
  from: string;
  to: string;
  /** Anzahl Tage dieser Woche bis heute */
  span: number;
  logged: number;
  mood: number | null;
  prevMood: number | null;
  sleep: number | null;
  prevSleep: number | null;
  symptoms: WeekSymptom[];
  /** bester und schwerster Tag (nach Stimmung, sonst nach Beschwerden) */
  best?: string;
  worst?: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function mondayOf(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

export function weekReview(
  trackers: Tracker[],
  entries: Entry[],
  now: Date,
  days?: Record<string, DayNote>,
  health?: Record<string, HealthDay>,
): WeekReview {
  const mon = mondayOf(now);
  const span = Math.round((startOfDay(now).getTime() - mon.getTime()) / 86400000) + 1;
  const keys = Array.from({ length: span }, (_, i) => dayKey(addDays(mon, i)));
  const prevKeys = Array.from({ length: span }, (_, i) => dayKey(addDays(mon, i - 7)));
  const ids = new Set(trackers.filter((t) => !t.archived).map((t) => t.id));
  const scales = trackers.flatMap((t) => t.fields.filter((f) => f.type === 'scale' && polarityOf(f) === 'higher-worse' && !f.hidden));
  const labels = [...new Set(scales.map((f) => f.label))];

  // Tageshöchstwert je Beschwerde
  const max: Record<string, Record<string, number>> = {};
  const loggedDays = new Set<string>();
  for (const e of entries) {
    if (!ids.has(e.trackerId)) continue;
    const k = entryDay(e.timestamp);
    loggedDays.add(k);
    for (const f of scales) {
      const v = e.values[f.id];
      if (typeof v !== 'number') continue;
      max[f.label] ??= {};
      max[f.label][k] = Math.max(max[f.label][k] ?? 0, v);
    }
  }
  const stat = (label: string, ks: string[]) => {
    const vals = ks.map((k) => max[label]?.[k]).filter((x): x is number => x !== undefined);
    return { days: vals.filter((v) => v >= 1).length, avg: avg(vals) };
  };
  const symptoms: WeekSymptom[] = labels
    .map((label) => {
      const a = stat(label, keys);
      const b = stat(label, prevKeys);
      const diff = a.days - b.days;
      const da = a.avg !== null && b.avg !== null ? a.avg - b.avg : 0;
      const direction: WeekSymptom['direction'] = diff <= -1 || (diff === 0 && da <= -0.5) ? 'better' : diff >= 1 || (diff === 0 && da >= 0.5) ? 'worse' : 'same';
      return { label, days: a.days, prevDays: b.days, avg: a.avg, prevAvg: b.avg, direction };
    })
    .filter((s) => s.days > 0 || s.prevDays > 0)
    .sort((x, y) => y.days - x.days || y.prevDays - x.prevDays);

  const moods = (ks: string[]) => avg(ks.map((k) => days?.[k]?.mood).filter((m): m is number => typeof m === 'number'));
  const sleeps = (ks: string[]) => avg(ks.map((k) => health?.[k]?.sleepHours).filter((m): m is number => typeof m === 'number'));
  const burden = (k: string) => labels.reduce((sum, l) => sum + (max[l]?.[k] ?? 0), 0);
  const rank = (k: string) => (typeof days?.[k]?.mood === 'number' ? days![k].mood! * 10 : 30) - burden(k);
  const withData = keys.filter((k) => loggedDays.has(k) || days?.[k]?.mood);
  const sorted = [...withData].sort((a, b) => rank(b) - rank(a));

  return {
    from: keys[0],
    to: keys[keys.length - 1],
    span,
    logged: keys.filter((k) => loggedDays.has(k)).length,
    mood: moods(keys),
    prevMood: moods(prevKeys),
    sleep: sleeps(keys),
    prevSleep: sleeps(prevKeys),
    symptoms,
    best: sorted.length > 1 ? sorted[0] : undefined,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : undefined,
  };
}
