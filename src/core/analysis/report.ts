import { aggregate, entriesOf } from './analytics';
import { regionLabel } from '../fields/bodyMaps';
import { addDays, dayKey, formatClock, parseDayKey, entryDay } from '../model/dates';
import { aggregationOf, fieldSpec, fmtLevel, formatDuration, formatShort, formatValue, isEmptyValue, isTimeRange, metricLabel, polarityOf } from '../fields/fieldTypes';
import { questionList } from '../diary/feedback';
import type { Entry, FieldDef, HealthDay, Profile, Tracker } from '../model/types';

/**
 * Berichtslogik (ohne UI): Spalten für die Tabellen im Papier-Stil,
 * Tageszusammenfassungen, Symptom-Übersicht und eine Textfassung.
 */

export interface ReportColumn {
  key: string;
  head: string;
  sub?: string;
  /** Kurzwert je Feld-ID. */
  values: Record<string, string>;
  /** Freitexte (mehrzeilige Textfelder) je Feld-ID. */
  notes: Record<string, string[]>;
}

export function inRange(entries: Entry[], from: string, to: string): Entry[] {
  return entries.filter((e) => {
    const k = entryDay(e.timestamp);
    return k >= from && k <= to;
  });
}

const isNote = (f: FieldDef) => f.type === 'text' && !!f.config.multiline;

/** Eine Spalte je Eintrag. */
export function entryColumns(tracker: Tracker, entries: Entry[]): ReportColumn[] {
  return entries.map((e) => {
    const d = new Date(e.timestamp);
    const values: Record<string, string> = {};
    const notes: Record<string, string[]> = {};
    for (const f of tracker.fields) {
      if (isNote(f)) {
        if (!isEmptyValue(e.values[f.id])) notes[f.id] = [String(e.values[f.id])];
      } else values[f.id] = formatShort(f, e.values[f.id]);
    }
    return {
      key: e.id,
      head: d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      sub: formatClock(d),
      values,
      notes,
    };
  });
}

/** Tageswert eines Feldes aus mehreren Einträgen eines Tages. */
export function dayValue(f: FieldDef, es: Entry[]): string {
  const vals = es.map((e) => e.values[f.id]).filter((v) => !isEmptyValue(v) && v !== false);
  if (!vals.length) return '';
  const spec = fieldSpec(f);
  switch (f.type) {
    case 'scale': {
      const nums = vals.filter((v): v is number => typeof v === 'number');
      if (!nums.length) return '';
      const max = Math.max(...nums);
      // Mehrere Werte am Tag: Höchstwert, dahinter die Spanne
      const min = Math.min(...nums);
      return nums.length > 1 && min !== max ? `${fmtLevel(max)} (${fmtLevel(min)}–${fmtLevel(max)})` : fmtLevel(max);
    }
    case 'timerange': {
      const mins = vals.map((v) => (isTimeRange(v) ? spec.toNumber(f, v) : null)).filter((n): n is number => n !== null);
      const ranges = vals.filter(isTimeRange).map((r) => `${r.from}–${r.to}`);
      if (!mins.length) return '';
      return vals.length === 1 ? ranges[0] : `${ranges.join(', ')} (Σ ${formatDuration(aggregate(mins, 'sum'))})`;
    }
    case 'number':
    case 'measurement': {
      const nums = vals.filter((v): v is number => typeof v === 'number');
      const agg = aggregationOf(f);
      const v = aggregate(nums, agg === 'count' ? 'sum' : agg);
      return v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
    }
    case 'checkbox':
      return vals.some((v) => v === true) ? '✓' : '';
    case 'bodymap':
      return [...new Set(vals.flatMap((v) => (Array.isArray(v) ? v : [])))].sort().join(', ');
    case 'multiselect':
      return [...new Set(vals.flatMap((v) => (Array.isArray(v) ? v : [])))].join(', ');
    case 'select':
    case 'text':
      return [...new Set(vals.map((v) => String(v).trim()))].join('; ');
    case 'datetime':
      return formatValue(f, vals[0]);
    case 'time':
      return [...new Set(vals.map((v) => String(v)))].join(', ');
  }
}

/** Eine Spalte je Tag (mehrere Einträge zusammengefasst). */
export function dayColumns(tracker: Tracker, entries: Entry[]): ReportColumn[] {
  const byDay = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = entryDay(e.timestamp);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, es]) => {
      const values: Record<string, string> = {};
      const notes: Record<string, string[]> = {};
      for (const f of tracker.fields) {
        if (isNote(f)) {
          const ns = es.filter((e) => !isEmptyValue(e.values[f.id])).map((e) => `${formatClock(new Date(e.timestamp))} ${e.values[f.id]}`);
          if (ns.length) notes[f.id] = ns;
        } else values[f.id] = dayValue(f, es);
      }
      return {
        key: k,
        head: parseDayKey(k).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        sub: es.length > 1 ? `${es.length} Einträge` : formatClock(new Date(es[0].timestamp)),
        values,
        notes,
      };
    });
}

export interface SymptomRow {
  tracker: Tracker;
  field: FieldDef;
  label: string;
  /** Tage mit Wert > Minimum (bei Beschwerden: Tage mit Beschwerden). */
  daysWith: number;
  /** Tage, an denen das Feld erfasst wurde. */
  daysTracked: number;
  avg: number | null;
  max: number | null;
  prevAvg: number | null;
  trend: 'better' | 'worse' | 'same' | null;
  unit: string;
}

function dailyNumbers(f: FieldDef, entries: Entry[]): Map<string, number> {
  const spec = fieldSpec(f);
  const by = new Map<string, number[]>();
  for (const e of entries) {
    const v = spec.toNumber(f, e.values[f.id] ?? null);
    if (v === null) continue;
    const k = entryDay(e.timestamp);
    by.set(k, [...(by.get(k) ?? []), v]);
  }
  // Skalen: Tageshöchstwert (der schlimmste Moment), sonst die Feld-Aggregation.
  const agg = f.type === 'scale' ? 'max' : aggregationOf(f);
  return new Map([...by].map(([k, vs]) => [k, aggregate(vs, agg === 'count' ? 'sum' : agg)]));
}

/** Übersicht je bewerteter Messgröße im Zeitraum, mit Vergleich zum gleich langen Zeitraum davor. */
export function symptomSummary(trackers: Tracker[], allEntries: Entry[], from: string, to: string): SymptomRow[] {
  const days = Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86400000) + 1;
  const prevFrom = dayKey(addDays(parseDayKey(from), -days));
  const prevTo = dayKey(addDays(parseDayKey(from), -1));
  const rows: SymptomRow[] = [];
  for (const t of trackers) {
    const es = entriesOf(t, allEntries);
    for (const f of t.fields) {
      const pol = polarityOf(f);
      if (!fieldSpec(f).numeric || f.type === 'checkbox' || pol === 'neutral') continue;
      const cur = dailyNumbers(f, inRange(es, from, to));
      if (!cur.size) continue;
      const prev = dailyNumbers(f, inRange(es, prevFrom, prevTo));
      const vals = [...cur.values()];
      const base = f.config.min ?? 0;
      const avg = aggregate(vals, 'avg');
      const prevAvg = prev.size >= 3 ? aggregate([...prev.values()], 'avg') : null;
      let trend: SymptomRow['trend'] = null;
      if (prevAvg !== null) {
        const range = (f.config.max ?? 0) - (f.config.min ?? 0) || Math.abs(prevAvg) || 1;
        const rel = (avg - prevAvg) / range;
        trend = Math.abs(rel) < 0.08 ? 'same' : (rel < 0) === (pol === 'higher-worse') ? 'better' : 'worse';
      }
      rows.push({
        tracker: t,
        field: f,
        label: metricLabel(f),
        daysWith: vals.filter((v) => v > base).length,
        daysTracked: cur.size,
        avg,
        max: Math.max(...vals),
        prevAvg,
        trend,
        unit: f.type === 'timerange' ? 'min' : f.config.unit ?? '',
      });
    }
  }
  return rows;
}

/** Textfassung (zum Kopieren in Nachrichten oder in einen Chat mit Claude). */
export function reportText(
  trackers: Tracker[],
  allEntries: Entry[],
  health: Record<string, HealthDay> | undefined,
  from: string,
  to: string,
  profile?: Profile,
): string {
  const d = (k: string) => parseDayKey(k).toLocaleDateString('de-DE');
  const lines: string[] = [];
  lines.push(`Symptomtagebuch ${d(from)} – ${d(to)}`);
  if (profile?.name) lines.push(`Name: ${profile.name}${profile.birthdate ? `, geb. ${d(profile.birthdate)}` : ''}`);
  lines.push('');
  if (profile?.summary?.trim()) {
    lines.push('ZUSAMMENFASSUNG');
    lines.push(profile.summary.trim());
    lines.push('');
  }
  const questions = questionList(profile?.questions);
  if (questions.length) {
    lines.push('MEINE FRAGEN');
    questions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    lines.push('');
  }
  const summary = symptomSummary(trackers, allEntries, from, to);
  if (summary.length) {
    lines.push('ÜBERSICHT (Tageshöchstwerte)');
    for (const r of summary) {
      const trend = r.trend === 'better' ? ', besser als davor' : r.trend === 'worse' ? ', schlechter als davor' : r.trend === 'same' ? ', unverändert' : '';
      lines.push(`- ${r.label} (${r.tracker.name}): an ${r.daysWith} von ${r.daysTracked} Tagen, Ø ${fmtLevel(Math.round((r.avg ?? 0) * 10) / 10)}, max ${fmtLevel(r.max ?? 0)}${r.unit ? ' ' + r.unit : ''}${trend}`);
    }
    lines.push('');
  }
  const keys = new Set<string>();
  for (const e of inRange(allEntries, from, to)) keys.add(entryDay(e.timestamp));
  for (const k of Object.keys(health ?? {})) if (k >= from && k <= to) keys.add(k);
  for (const k of [...keys].sort()) {
    lines.push(parseDayKey(k).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }));
    const h = health?.[k];
    if (h) {
      const hp = [
        h.wake && `aufgestanden ${h.wake}`,
        h.sleepHours !== undefined && `${fmtLevel(h.sleepHours)} h Schlaf`,
        h.steps !== undefined && `${h.steps} Schritte`,
        h.exerciseMin !== undefined && `${h.exerciseMin} min Training`,
        h.activeKcal !== undefined && `${h.activeKcal} kcal aktiv`,
        h.weight !== undefined && `${fmtLevel(h.weight)} kg`,
        h.bodyFat !== undefined && `${fmtLevel(h.bodyFat)} % Körperfett`,
      ].filter(Boolean);
      if (hp.length) lines.push(`  Gesundheit: ${hp.join(', ')}`);
    }
    for (const t of trackers) {
      const es = entriesOf(t, allEntries).filter((e) => entryDay(e.timestamp) === k);
      for (const e of es) {
        const parts = t.fields
          .filter((f) => !isEmptyValue(e.values[f.id]) && e.values[f.id] !== false)
          .map((f) => {
            const v = e.values[f.id];
            if (f.type === 'scale' && typeof v === 'number') return `${f.label} ${fmtLevel(v)}`;
            if (f.type === 'bodymap' && Array.isArray(v)) return `${f.label}: ${v.map((id) => regionLabel(f.config.bodyMap ?? 'abdomen', id)).join(', ')}`;
            return `${f.label}: ${formatValue(f, v)}`;
          });
        if (parts.length) lines.push(`  ${formatClock(new Date(e.timestamp))} ${t.name}: ${parts.join('; ')}`);
      }
    }
  }
  return lines.join('\n');
}
