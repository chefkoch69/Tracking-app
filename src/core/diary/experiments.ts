import { addDays, dayKey, parseDayKey, entryDay } from '../model/dates';
import { fieldSpec, polarityOf } from '../fields/fieldTypes';
import type { Entry, Experiment, FieldDef, Tracker } from '../model/types';

/**
 * „Ausprobieren“: eine Liste von Dingen, die man testen will, gerade testet oder schon
 * getestet hat – mit einem einfachen Vorher/Während-Vergleich der Beschwerden.
 */

export const EXPERIMENT_CATEGORIES = ['Essen & Trinken', 'Schlaf', 'Bewegung', 'Entspannung', 'Medizinisches', 'Alltag'];

/** Neutrale Ideen zum Antippen – Medizinisches bespricht man besser mit der Ärztin/dem Arzt. */
export const EXPERIMENT_IDEAS: { title: string; category: string }[] = [
  { title: 'Laktosefreie Milchprodukte', category: 'Essen & Trinken' },
  { title: 'Kein Kaffee nach 12 Uhr', category: 'Essen & Trinken' },
  { title: 'Abends früher und leichter essen', category: 'Essen & Trinken' },
  { title: 'Kurzer Spaziergang nach dem Essen', category: 'Bewegung' },
  { title: 'Handy 1 Stunde vor dem Schlafen weglegen', category: 'Schlaf' },
  { title: 'Jeden Tag zur gleichen Zeit aufstehen', category: 'Schlaf' },
  { title: 'Mehr Wasser trinken', category: 'Alltag' },
];

export const VERDICTS: Record<NonNullable<Experiment['verdict']>, string> = {
  helped: 'hat geholfen',
  partly: 'etwas geholfen',
  no: 'nicht geholfen',
  unclear: 'unklar',
};

export interface ExperimentEffect {
  field: FieldDef;
  before: number;
  during: number;
  daysBefore: number;
  daysDuring: number;
  direction: 'better' | 'worse' | 'same';
}

/** Tage seit dem Start (Starttag = Tag 1). */
export function experimentDay(exp: Experiment, now: Date): number | null {
  if (!exp.startedAt) return null;
  const end = exp.endedAt ? parseDayKey(exp.endedAt) : parseDayKey(dayKey(now));
  return Math.round((end.getTime() - parseDayKey(exp.startedAt).getTime()) / 86400000) + 1;
}

/**
 * Beschwerden vorher (bis 14 Tage vor dem Start) und während des Versuchs: Durchschnitt der
 * Tageshöchstwerte je Beschwerde. Nur mit mindestens `minDays` Tagen auf beiden Seiten.
 */
export function experimentEffect(exp: Experiment, tracker: Tracker, entries: Entry[], now: Date, minDays = 3): ExperimentEffect[] {
  if (!exp.startedAt) return [];
  const start = exp.startedAt;
  const end = exp.endedAt ?? dayKey(now);
  const beforeFrom = dayKey(addDays(parseDayKey(start), -14));
  const beforeTo = dayKey(addDays(parseDayKey(start), -1));
  const es = entries.filter((e) => e.trackerId === tracker.id);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const out: ExperimentEffect[] = [];
  for (const f of tracker.fields) {
    if (f.hidden || f.type !== 'scale' || polarityOf(f) === 'neutral') continue;
    const spec = fieldSpec(f);
    const daily = new Map<string, number>();
    for (const e of es) {
      const v = spec.toNumber(f, e.values[f.id] ?? null);
      if (v === null) continue;
      const k = entryDay(e.timestamp);
      daily.set(k, Math.max(daily.get(k) ?? -Infinity, v));
    }
    const pick = (a: string, b: string) => [...daily].filter(([k]) => k >= a && k <= b).map(([, v]) => v);
    const before = pick(beforeFrom, beforeTo);
    const during = pick(start, end);
    if (before.length < minDays || during.length < minDays) continue;
    const b = avg(before);
    const d = avg(during);
    const range = (f.config.max ?? 3) - (f.config.min ?? 0) || 1;
    const better = polarityOf(f) === 'higher-better' ? d > b : d < b;
    out.push({
      field: f,
      before: b,
      during: d,
      daysBefore: before.length,
      daysDuring: during.length,
      direction: Math.abs(d - b) / range < 0.08 ? 'same' : better ? 'better' : 'worse',
    });
  }
  return out.sort((x, y) => Math.abs(y.during - y.before) - Math.abs(x.during - x.before));
}
