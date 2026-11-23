import { aggregate, dailyValues, entriesOf, numericFields, pairMetrics, pearson } from './analytics';
import { addDays, dayKey, startOfDay } from './dates';
import { fieldSpec, metricLabel, polarityOf } from './fieldTypes';
import type { Entry, FieldDef, Tracker } from './types';

/**
 * Automatische Erkenntnisse – generisch für alle Tracker:
 *  - Trends: Hat sich eine bewertete Messgröße in den letzten 2 Wochen verändert?
 *  - Zusammenhänge: Welche Messgrößen hängen zusammen (auch trackerübergreifend, mit Zeitversatz)?
 *  - Einflussfaktoren: Bei welchen Kategorien (Mahlzeit, Medikament, Lokalisation …) ist ein Wert auffällig anders?
 *
 * Alle Aussagen sind Beobachtungen, keine Kausalität – die UI sagt das auch.
 */

export type InsightTone = 'good' | 'bad' | 'neutral';

export interface Insight {
  id: string;
  kind: 'trend' | 'correlation' | 'factor';
  trackerId: string;
  title: string;
  detail: string;
  /** Kurze Kennzahl für die Karte, z. B. "−32 %" oder "r = 0,62". */
  metric: string;
  tone: InsightTone;
  /** 0..1, zum Sortieren. */
  strength: number;
}

const num = (v: number, digits = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: digits });
const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} %`;
/** Kennzahl einer Veränderung: auf Skalen als Differenz (Prozente wären bei kleinen Werten irreführend). */
function changeMetric(f: FieldDef, diff: number, base: number): string {
  const sign = diff > 0 ? '+' : '−';
  if (f.type === 'scale' || base === 0 || Math.abs(base) < 1) return `${sign}${num(Math.abs(diff))}${f.type === 'scale' ? '' : unitOf(f)}`;
  return pct(diff / Math.abs(base));
}

/** Gehören zwei Felder zum selben Thema (gleicher Abschnitt)? Dann sind Zusammenhänge oft selbstverständlich. */
const sameTopic = (a: FieldDef, b: FieldDef) => !!a.group && a.group === b.group;

const unitOf = (f: FieldDef) => (f.config.unit ? ` ${f.config.unit}` : '');
const range = (f: FieldDef) =>
  f.config.min !== undefined && f.config.max !== undefined && f.config.max > f.config.min ? f.config.max - f.config.min : null;

function toneFor(field: FieldDef, change: number): InsightTone {
  const pol = polarityOf(field);
  if (pol === 'neutral' || change === 0) return 'neutral';
  const better = pol === 'higher-better' ? change > 0 : change < 0;
  return better ? 'good' : 'bad';
}

export function trendInsights(tracker: Tracker, entries: Entry[], now: Date): Insight[] {
  const out: Insight[] = [];
  const es = entriesOf(tracker, entries);
  const today = startOfDay(now);
  const k = (o: number) => dayKey(addDays(today, o));
  for (const f of numericFields(tracker)) {
    if (polarityOf(f) === 'neutral' || f.type === 'checkbox') continue;
    const days = dailyValues(f, es);
    const pick = (from: number, to: number) => [...days].filter(([d]) => d >= k(from) && d <= k(to)).map(([, v]) => v);
    const recent = pick(-13, 0);
    const prev = pick(-27, -14);
    if (recent.length < 4 || prev.length < 4) continue;
    const a = aggregate(recent, 'avg');
    const b = aggregate(prev, 'avg');
    const change = a - b;
    const r = range(f);
    const norm = r ? Math.abs(change) / r : b !== 0 ? Math.abs(change / b) : 0;
    if (norm < 0.1) continue;
    const tone = toneFor(f, change);
    const word = tone === 'good' ? 'besser' : tone === 'bad' ? 'schlechter' : change > 0 ? 'höher' : 'niedriger';
    out.push({
      id: `trend-${f.id}`,
      kind: 'trend',
      trackerId: tracker.id,
      title: `${metricLabel(f)}: ${word} als in den 2 Wochen davor`,
      detail: `Ø ${num(b)}${unitOf(f)} → ${num(a)}${unitOf(f)} (letzte 14 Tage)`,
      metric: changeMetric(f, change, b),
      tone,
      strength: Math.min(1, norm * 1.5),
    });
  }
  return out;
}

export function correlationInsights(trackers: Tracker[], entries: Entry[], minPairs = 8, minR = 0.4): Insight[] {
  const metrics = trackers
    .filter((t) => !t.archived)
    .flatMap((t) => numericFields(t).map((f) => ({ t, f })));
  const out: Insight[] = [];
  for (let i = 0; i < metrics.length; i++) {
    for (let j = 0; j < metrics.length; j++) {
      if (i === j) continue;
      const A = metrics[i];
      const B = metrics[j];
      const same = A.t.id === B.t.id;
      // z. B. Müdigkeit ↔ Erschöpfung oder Bauchschmerz ↔ Dauer: selbstverständlich, nicht zeigen.
      // Messwerte (z. B. Raumtemperatur) als mögliche Einflüsse bleiben erlaubt.
      if (same && sameTopic(A.f, B.f) && A.f.type !== 'measurement' && B.f.type !== 'measurement') continue;
      // Gleicher Tracker: symmetrisch, nur einmal; trackerübergreifend: auch Folgetag.
      const lags = same ? (i < j ? [0] : []) : [0, 1];
      for (const lag of lags) {
        if (!same && lag === 0 && i > j) continue;
        const p = pairMetrics(trackers, entries, { trackerId: A.t.id, fieldId: A.f.id }, { trackerId: B.t.id, fieldId: B.f.id }, lag);
        if (p.pairs.length < minPairs) continue;
        const r = pearson(p.pairs.map((x) => x.x), p.pairs.map((x) => x.y));
        if (r === null || Math.abs(r) < minR) continue;
        const nameA = same ? metricLabel(A.f) : `${metricLabel(A.f)} (${A.t.name})`;
        const nameB = same ? metricLabel(B.f) : `${metricLabel(B.f)} (${B.t.name})`;
        out.push({
          id: `corr-${A.f.id}-${B.f.id}-${lag}`,
          kind: 'correlation',
          trackerId: A.t.id,
          title: `Je höher ${nameA}, desto ${r > 0 ? 'höher' : 'niedriger'} ${nameB}${lag ? ' am Folgetag' : ''}`,
          detail: `${p.pairs.length} ${p.basis === 'entry' ? 'Einträge' : 'Tage'} · ${Math.abs(r) >= 0.6 ? 'starker' : 'mittlerer'} Zusammenhang`,
          metric: `r = ${num(r, 2)}`,
          tone: 'neutral',
          strength: Math.abs(r),
        });
      }
    }
  }
  return out.sort((a, b) => b.strength - a.strength);
}

export function factorInsights(tracker: Tracker, entries: Entry[], minGroup = 4): Insight[] {
  const es = entriesOf(tracker, entries);
  const targets = numericFields(tracker).filter((f) => polarityOf(f) !== 'neutral' && f.type !== 'checkbox');
  const factors = tracker.fields.filter((f) => fieldSpec(f).categorical);
  const out: Insight[] = [];
  for (const target of targets) {
    const tSpec = fieldSpec(target);
    const rows = es.flatMap((e) => {
      const y = tSpec.toNumber(target, e.values[target.id] ?? null);
      return y === null ? [] : [{ e, y }];
    });
    if (rows.length < minGroup * 2) continue;
    const allY = rows.map((r) => r.y);
    const mean = aggregate(allY, 'avg');
    const sd = Math.sqrt(aggregate(allY.map((y) => (y - mean) ** 2), 'avg')) || 1;
    const r = range(target);
    for (const factor of factors) {
      // „Füße kalt → Kälteempfinden höher“ ist keine Erkenntnis: gleicher Abschnitt überspringen.
      if (sameTopic(factor, target)) continue;
      if (factor.id === target.id) continue;
      const fSpec = fieldSpec(factor);
      const cats = new Map<string, number[]>();
      const perRow = rows.map(({ e, y }) => {
        const cs = new Set(fSpec.categories(factor, e.values[factor.id] ?? null).map((c) => c.trim()).filter(Boolean));
        for (const c of cs) cats.set(c, [...(cats.get(c) ?? []), y]);
        return cs;
      });
      for (const [cat, withY] of cats) {
        if (factor.type === 'checkbox' && cat === 'Nein') continue;
        const withoutY = rows.filter((_, i) => !perRow[i].has(cat)).map((x) => x.y);
        if (withY.length < minGroup || withoutY.length < minGroup) continue;
        const a = aggregate(withY, 'avg');
        const b = aggregate(withoutY, 'avg');
        const diff = a - b;
        const effect = r ? Math.abs(diff) / r : Math.abs(diff) / sd / 2;
        if (effect < 0.2) continue;
        const label = factor.type === 'checkbox' ? factor.label : `„${cat}“`;
        out.push({
          id: `factor-${target.id}-${factor.id}-${cat}`,
          kind: 'factor',
          trackerId: tracker.id,
          title: `${label} → ${metricLabel(target)} ${toneFor(target, diff) === 'good' ? 'besser' : 'schlechter'}`,
          detail: `${factor.type === 'checkbox' ? '' : `${factor.label}: `}Ø ${num(a)}${unitOf(target)} statt ${num(b)}${unitOf(target)} (${withY.length} vs. ${withoutY.length} Einträge)`,
          metric: changeMetric(target, diff, b),
          tone: toneFor(target, diff),
          strength: Math.min(1, effect * 1.6),
        });
      }
    }
  }
  return out.sort((a, b) => b.strength - a.strength);
}

export function computeInsights(trackers: Tracker[], entries: Entry[], now = new Date(), limit = 6): Insight[] {
  const active = trackers.filter((t) => !t.archived);
  const all = [
    ...active.flatMap((t) => trendInsights(t, entries, now)),
    ...active.flatMap((t) => factorInsights(t, entries).slice(0, 3)),
    ...correlationInsights(active, entries).slice(0, 4),
  ];
  return all.sort((a, b) => b.strength - a.strength).slice(0, limit);
}
