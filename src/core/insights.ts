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

/**
 * Passendes Vergleichswort je Art des Werts, damit Sätze natürlich klingen:
 * Beschwerden werden stärker/schwächer, Dauern länger/kürzer, Anzahlen mehr/weniger.
 */
export function changeWord(f: FieldDef, up: boolean): string {
  const unit = (f.config.unit ?? '').toLowerCase();
  if (f.type === 'timerange' || ['h', 'min', 'std', 'stunden', 'minuten'].includes(unit)) return up ? 'länger' : 'kürzer';
  if (f.type === 'scale') {
    const pol = polarityOf(f);
    if (pol === 'higher-worse') return up ? 'stärker' : 'schwächer';
    if (pol === 'higher-better') return up ? 'besser' : 'schlechter';
    return up ? 'höher' : 'niedriger';
  }
  if (f.type === 'number' && !unit) return up ? 'mehr' : 'weniger';
  if (f.type === 'checkbox') return up ? 'häufiger' : 'seltener';
  return up ? 'höher' : 'niedriger';
}

/** Wie ein Auslöser im Satz eingeleitet wird: „Nach „Milchkaffee““, „Mit „Buscopan““, „Nach der Mahlzeit“. */
export function factorPhrase(factor: FieldDef, cat: string): string {
  if (factor.type === 'checkbox') return `Wenn „${factor.label}“`;
  const c = cat.trim();
  // Werte, die selbst schon eine Zeitangabe sind („nach der Mahlzeit“, „vor dem Essen“ …)
  if (/^(nach|vor|während|bei|mit|ohne|unabhängig)\b/i.test(c)) return c.charAt(0).toUpperCase() + c.slice(1);
  const l = factor.label.toLowerCase();
  if (/gegessen|essen|lebensmittel|mahlzeit|getrunken|trinken/.test(l)) return `Nach „${c}“`;
  if (/medikament|tablette|mittel/.test(l)) return `Mit „${c}“`;
  return `Bei „${c}“`;
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

function dailyMax(f: FieldDef, es: Entry[]): Map<string, number> {
  const spec = fieldSpec(f);
  const m = new Map<string, number>();
  for (const e of es) {
    const v = spec.toNumber(f, e.values[f.id] ?? null);
    if (v === null) continue;
    const k = dayKey(new Date(e.timestamp));
    m.set(k, Math.max(m.get(k) ?? -Infinity, v));
  }
  return m;
}

export function trendInsights(tracker: Tracker, entries: Entry[], now: Date): Insight[] {
  const out: Insight[] = [];
  const es = entriesOf(tracker, entries);
  const today = startOfDay(now);
  const k = (o: number) => dayKey(addDays(today, o));
  for (const f of numericFields(tracker)) {
    if (polarityOf(f) === 'neutral' || f.type === 'checkbox') continue;
    // Bewertungen: schlimmster Moment des Tages (wie im Verlaufsdiagramm und im Arztbericht),
    // sonst die Tages-Zusammenfassung des Feldes.
    const days = f.type === 'scale' ? dailyMax(f, es) : dailyValues(f, es);
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
    out.push({
      id: `trend-${f.id}`,
      kind: 'trend',
      trackerId: tracker.id,
      title: `${metricLabel(f)}: ${changeWord(f, change > 0)} als in den 2 Wochen davor`,
      detail: `im Schnitt ${num(a)}${unitOf(f)} statt ${num(b)}${unitOf(f)} · ${f.type === 'scale' ? 'Tageshöchstwerte, ' : ''}letzte 14 Tage`,
      metric: changeMetric(f, change, b),
      tone,
      strength: Math.min(1, norm * 1.5),
    });
  }
  return out;
}

export function correlationInsights(trackers: Tracker[], entries: Entry[], minPairs = 10, minR = 0.45): Insight[] {
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
        // Viele Vergleiche erzeugen Zufallstreffer: über Tracker hinweg und mit Zeitversatz strenger sein.
        const needPairs = same ? minPairs : minPairs + 4;
        const needR = same ? minR : lag ? minR + 0.1 : minR + 0.05;
        if (p.pairs.length < needPairs) continue;
        const r = pearson(p.pairs.map((x) => x.x), p.pairs.map((x) => x.y));
        if (r === null || Math.abs(r) < needR) continue;
        // Messwerte (Raumtemperatur, Schlaf, Schritte …) als mögliche Ursache vorne nennen.
        const swap = same && B.f.type === 'measurement' && A.f.type !== 'measurement';
        const [X, Y] = swap ? [B, A] : [A, B];
        const nameA = same ? metricLabel(X.f) : `${metricLabel(X.f)} (${X.t.name.replace(/\s*\(Demo\)$/, '')})`;
        const nameB = same ? metricLabel(Y.f) : `${metricLabel(Y.f)} (${Y.t.name.replace(/\s*\(Demo\)$/, '')})`;
        const strong = Math.abs(r) >= 0.6;
        out.push({
          id: `corr-${A.f.id}-${B.f.id}-${lag}`,
          kind: 'correlation',
          trackerId: A.t.id,
          title: `${nameA} ${changeWord(X.f, true)} → ${nameB} ${lag ? 'am Folgetag ' : ''}meist ${changeWord(Y.f, r > 0)}`,
          detail: `beobachtet an ${p.pairs.length} ${p.basis === 'entry' ? 'Einträgen' : 'Tagen'} · ${strong ? 'deutlicher' : 'erkennbarer'} Zusammenhang (r = ${num(r, 2)})`,
          metric: strong ? 'deutlich' : 'erkennbar',
          tone: 'neutral',
          strength: Math.abs(r),
        });
      }
    }
  }
  return out.sort((a, b) => b.strength - a.strength);
}

/** Zeitfenster für „danach“ bzw. „vorher“ bei Ereignissen. */
export const EFFECT_WINDOW_H = 4;

/** Natürliche Satzanfänge für häufige Ereignisse aus der Vorlage; sonst allgemein. */
const EVENT_PHRASES: Record<string, string> = {
  gegessen: 'Nach dem Essen',
  getrunken: 'Nach dem Trinken',
  geschlafen: 'Nach dem Schlafen',
  aufgestanden: 'Nach dem Aufstehen',
  'medikament genommen': 'Nach der Medikamenteneinnahme',
  bewegung: 'Nach Bewegung',
  'pause / hingelegt': 'Nach einer Pause',
  toilette: 'Nach dem Toilettengang',
  stress: 'Bei Stress',
};

function causePhrase(factor: FieldDef, cat: string): string {
  if (factor.type === 'multiselect') {
    const p = EVENT_PHRASES[cat.trim().toLocaleLowerCase('de-DE')];
    if (p) return p;
  }
  return factorPhrase(factor, cat);
}

/** Womit verglichen wird, in Worten. */
function otherPhrase(factor: FieldDef): string {
  const l = factor.label.toLowerCase();
  if (/gegessen|essen|lebensmittel|mahlzeit/.test(l)) return 'nach anderem Essen';
  if (/medikament|tablette/.test(l)) return 'nach anderen Medikamenten';
  return `bei anderen Angaben zu „${factor.label}“`;
}

/**
 * Einflussfaktoren – zeitlich gedacht, wie man es selbst tun würde:
 *  - Ereignisse (Essen, Medikamente, Tätigkeiten): Wie war eine Beschwerde zum Zeitpunkt
 *    des Ereignisses und wie in den Stunden danach? (vorher → danach) Fehlt „vorher“, wird
 *    „danach“ mit den Stunden nach ANDEREN Angaben desselben Felds verglichen.
 *  - Eintrags-Merkmale (z. B. „nach der Mahlzeit“): Vergleich nur mit den anderen Angaben
 *    desselben Felds – nicht mit allen übrigen Einträgen (die oft ganz andere Situationen sind).
 * Essen und Beschwerden dürfen in getrennten Einträgen stehen.
 */
export function factorInsights(tracker: Tracker, entries: Entry[], minGroup = 3): Insight[] {
  const es = entriesOf(tracker, entries);
  const times = es.map((e) => new Date(e.timestamp).getTime());
  const W = EFFECT_WINDOW_H * 3600 * 1000;
  const targets = numericFields(tracker).filter((f) => polarityOf(f) !== 'neutral' && f.type !== 'checkbox' && !f.hidden);
  // Mehrfachauswahl in einem Beschwerde-Abschnitt (z. B. „Wo kalt?“ bei „Kälte“) beschreibt die
  // Beschwerde selbst – sie ist weder Ereignis noch Einflussfaktor.
  const symptomGroups = new Set(tracker.fields.filter((f) => f.type === 'scale' && f.group).map((f) => f.group));
  const isDescriptor = (f: FieldDef) => (f.type === 'multiselect' || f.type === 'checkbox') && !!f.group && symptomGroups.has(f.group);
  const isEvent = (f: FieldDef) =>
    !isDescriptor(f) && ((f.type === 'text' && !!f.config.splitList) || f.type === 'multiselect' || f.type === 'checkbox');
  const isAttribute = (f: FieldDef) => f.type === 'select';
  const dayCount = new Set(es.map((e) => dayKey(new Date(e.timestamp)))).size;

  /** family: worüber höchstens eine Aussage gemacht wird; moments: welche Einträge sie beschreibt. */
  type Found = { family: string; moments: string; prefer: number; insight: Insight };
  const found: Found[] = [];
  const avg = (xs: number[]) => aggregate(xs, 'avg');

  for (const target of targets) {
    const tSpec = fieldSpec(target);
    const val = (e: Entry) => tSpec.toNumber(target, e.values[target.id] ?? null);
    const all = es.map(val).filter((v): v is number => v !== null);
    if (all.length < minGroup * 2) continue;
    const mean = avg(all);
    const sd = Math.sqrt(avg(all.map((y) => (y - mean) ** 2))) || 1;
    const r = range(target);
    const effectOf = (d: number) => (r ? Math.abs(d) / r : Math.abs(d) / sd / 2);
    // Auf Skalen reicht ein halber Punkt (0–3), offene Werte (Minuten …) streuen stärker.
    const notable = (effect: number) => (r ? effect >= 0.15 : effect >= 0.3);
    const fmt = (v: number) => (target.type === 'scale' ? num(v) : `${num(v, Math.abs(v) >= 10 ? 0 : 1)}${unitOf(target)}`);
    // „Schon Beschwerden“: mindestens ein Viertel der Skala über dem Minimum.
    const elevated = (v: number) => (r ? v - (target.config.min ?? 0) >= r * 0.25 : v > mean);
    const weight = (n: number) => Math.min(1, 0.5 + n / 10);

    for (const factor of tracker.fields) {
      if (factor.id === target.id || sameTopic(factor, target)) continue;
      const fSpec = fieldSpec(factor);
      const catsOf = (e: Entry) =>
        [...new Set(fSpec.categories(factor, e.values[factor.id] ?? null).map((c) => c.trim()).filter(Boolean))].filter(
          (c) => !(factor.type === 'checkbox' && c === 'Nein'),
        );

      if (isAttribute(factor)) {
        // Merkmal eines Eintrags (z. B. „nach der Mahlzeit“): nur mit den anderen Angaben
        // DESSELBEN Felds vergleichen – nicht mit allen übrigen Einträgen.
        const groups = new Map<string, { ys: number[]; ids: string[] }>();
        for (const e of es) {
          const y = val(e);
          if (y === null) continue;
          for (const c of catsOf(e)) {
            const g = groups.get(c) ?? { ys: [], ids: [] };
            g.ys.push(y);
            g.ids.push(e.id);
            groups.set(c, g);
          }
        }
        for (const [cat, g] of groups) {
          const others = [...groups].filter(([k]) => k !== cat).flatMap(([, v]) => v.ys);
          if (g.ys.length < minGroup || others.length < minGroup) continue;
          const a = avg(g.ys);
          const b = avg(others);
          const effect = effectOf(a - b);
          if (!notable(effect)) continue;
          found.push({
            family: `attr|${factor.id}`,
            moments: g.ids.join(','),
            prefer: 1,
            insight: {
              id: `factor-${target.id}-${factor.id}-${cat}`,
              kind: 'factor',
              trackerId: tracker.id,
              title: `${causePhrase(factor, cat)}: ${metricLabel(target)} ${changeWord(target, a > b)}`,
              detail: `im Schnitt ${fmt(a)} statt ${fmt(b)} bei anderen Angaben zu „${factor.label}“ · ${g.ys.length}× vs. ${others.length}×`,
              metric: target.type === 'scale' ? `${num(a)} statt ${num(b)}` : changeMetric(target, a - b, b),
              tone: toneFor(target, a - b),
              strength: Math.min(1, effect * 1.6) * weight(g.ys.length),
            },
          });
        }
        continue;
      }

      if (!isEvent(factor)) continue;
      // Für jeden Eintrag: Wert zum Zeitpunkt (eigener oder letzter davor), späterer Wert
      // (letzter im Fenster danach) und schlimmster Wert im Fenster danach.
      type Moment = { cats: string[]; id: string; t: number; day: string; own: number | null; now: number | null; later: number | null; worst: number | null };
      const occ: Moment[] = [];
      const withValue: Moment[] = [];
      es.forEach((e, i) => {
        const cats = catsOf(e);
        const own = val(e);
        if (!cats.length && own === null) return;
        const t = times[i];
        let now = own;
        for (let j = i - 1; now === null && j >= 0 && times[j] >= t - W; j--) now = val(es[j]);
        let later: number | null = null;
        let worst: number | null = null;
        for (let j = i + 1; j < es.length && times[j] <= t + W; j++) {
          const v = val(es[j]);
          if (v === null) continue;
          later = v;
          worst = worst === null ? v : Math.max(worst, v);
        }
        const m = { cats, id: e.id, t, day: dayKey(new Date(e.timestamp)), own, now, later, worst };
        if (cats.length) occ.push(m);
        if (own !== null) withValue.push(m);
      });

      for (const cat of [...new Set(occ.flatMap((o) => o.cats))]) {
        const mine = occ.filter((o) => o.cats.includes(cat));
        // Routinen (fast jeden Tag, z. B. „aufgestanden“) unterscheiden nichts.
        if (dayCount >= 5 && new Set(mine.map((o) => o.day)).size / dayCount >= 0.8) continue;
        const moments = mine.map((o) => o.id).join(',');
        const prefer = factor.type === 'text' ? 2 : 1;
        const family = `${factor.id}|${cat}`;

        // 1) Wenn schon Beschwerden da waren (z. B. Medikament): wie ist es später – verglichen mit
        //    Beschwerde-Momenten OHNE dieses Ereignis (Beschwerden klingen oft auch von selbst ab).
        const relief = mine.filter((o) => o.now !== null && o.later !== null && elevated(o.now));
        if (relief.length >= minGroup) {
          const before = avg(relief.map((o) => o.now!));
          const after = avg(relief.map((o) => o.later!));
          const near = (t: number) => mine.some((o) => Math.abs(o.t - t) <= W);
          const base = withValue.filter((o) => o.later !== null && elevated(o.own!) && !o.cats.includes(cat) && !near(o.t));
          const hasBase = base.length >= minGroup;
          const bBefore = hasBase ? avg(base.map((o) => o.own!)) : 0;
          const bAfter = hasBase ? avg(base.map((o) => o.later!)) : 0;
          const change = after - before - (hasBase ? bAfter - bBefore : 0);
          const effect = effectOf(change);
          if (effect >= 0.15 && Math.sign(change) === Math.sign(after - before)) {
            found.push({
              family,
              moments,
              prefer,
              insight: {
                id: `effect-${target.id}-${factor.id}-${cat}`,
                kind: 'factor',
                trackerId: tracker.id,
                title: `${causePhrase(factor, cat)}: ${metricLabel(target)} danach ${changeWord(target, after > before)}`,
                detail:
                  `bei Beschwerden: vorher im Schnitt ${fmt(before)}, später ${fmt(after)} (bis ${EFFECT_WINDOW_H} Std.)` +
                  (hasBase ? ` · ohne: ${fmt(bBefore)} → ${fmt(bAfter)}` : '') +
                  ` · ${relief.length}× beobachtet`,
                metric: `${num(before)} → ${num(after)}`,
                tone: toneFor(target, after - before),
                strength: Math.min(1, effect * 1.6) * weight(relief.length) * (hasBase ? 1 : 0.8),
              },
            });
          }
        }

        // 2) Möglicher Auslöser: Ging es einem vorher gut – wie schlimm wurde es in den Stunden danach,
        //    verglichen mit Einträgen OHNE diese Angabe? Nur die ungünstige Richtung: „besser als der
        //    Durchschnitt“ heißt meist nur „kein Auslöser“ (der Durchschnitt enthält die Auslöser).
        const calm = (o: Moment) => o.now === null || !elevated(o.now);
        const withW = mine.filter(calm).map((o) => o.worst).filter((v): v is number => v !== null);
        const othersW = occ.filter((o) => !o.cats.includes(cat) && calm(o)).map((o) => o.worst).filter((v): v is number => v !== null);
        if (withW.length < minGroup || othersW.length < minGroup) continue;
        const a = avg(withW);
        const b = avg(othersW);
        const effect = effectOf(a - b);
        if (!notable(effect) || toneFor(target, a - b) !== 'bad') continue;
        found.push({
          family,
          moments,
          prefer,
          insight: {
            id: `after-${target.id}-${factor.id}-${cat}`,
            kind: 'factor',
            trackerId: tracker.id,
            title: `${causePhrase(factor, cat)}: ${metricLabel(target)} danach ${changeWord(target, a > b)}`,
            detail: `in den ${EFFECT_WINDOW_H} Std. danach im Schnitt ${fmt(a)} statt ${fmt(b)} ${otherPhrase(factor)} · ${withW.length}× vs. ${othersW.length}×`,
            metric: target.type === 'scale' ? `${num(a)} statt ${num(b)}` : changeMetric(target, a - b, b),
            tone: 'bad',
            strength: Math.min(1, effect * 1.6) * weight(withW.length),
          },
        });
      }
    }
  }

  // Pro Auslöser (bzw. Merkmal-Feld) nur die stärkste Aussage; dieselben Momente (z. B. „Medikament
  // genommen“ und „Buscopan“ im selben Eintrag) nur einmal – die genauere Angabe gewinnt.
  const sorted = found.sort((x, y) => y.insight.strength - x.insight.strength || y.prefer - x.prefer);
  const byFamily = new Map<string, Found>();
  for (const f of sorted) if (!byFamily.has(f.family)) byFamily.set(f.family, f);
  const byMoments = new Map<string, Found>();
  for (const f of byFamily.values()) {
    const cur = byMoments.get(f.moments);
    if (!cur || f.prefer > cur.prefer) byMoments.set(f.moments, f);
  }
  return [...byMoments.values()].map((f) => f.insight).sort((x, y) => y.strength - x.strength);
}

export function computeInsights(trackers: Tracker[], entries: Entry[], now = new Date(), limit = 6): Insight[] {
  const active = trackers.filter((t) => !t.archived);
  const all = [
    ...active.flatMap((t) => trendInsights(t, entries, now)),
    ...active.flatMap((t) => factorInsights(t, entries).slice(0, 4)),
    ...correlationInsights(active, entries).slice(0, 4),
  ];
  return all.sort((a, b) => b.strength - a.strength).slice(0, limit);
}
