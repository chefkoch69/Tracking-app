import { addDays, atMinutes, dayKey, parseDayKey, parseTime } from '../model/dates';
import { makeField } from '../fields/templates';
import type { AppData, Entry, FieldDef, HealthDay, Tracker } from '../model/types';

/**
 * Gesundheitsdaten (Aufstehzeit, Schlaf, Schritte, Ruhepuls).
 *
 * Eine Web-App kann Apple Health nicht direkt lesen. Die Brücke ist ein
 * iPhone-Kurzbefehl, der die Werte aus Health liest und als kurzen Text
 * an die App übergibt (Zwischenablage → Einfügen, oder als Link).
 * Dieses Modul parst diesen Text tolerant und stellt die Werte den
 * generischen Auswertungen als "virtuellen Tracker" zur Verfügung.
 */

const TIME = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/;

function toTime(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  const m = s.match(TIME);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  // ISO-Zeitpunkt (ggf. mit Zeitzone) → lokale Uhrzeit
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s))) {
    const d = new Date(s);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  // "25.11.2026, 06:42" o. ä. (so fügt der iPhone-Kurzbefehl ein Datum ein) → Datum entfernen, Uhrzeit nehmen
  const rest = s.replace(/\b\d{1,2}\.\s?(?:\d{1,2}\.|[A-Za-zäÄ]{3,}\.?)\s?\d{2,4}\b/g, ' ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  const t = rest.match(/(\d{1,2}):(\d{2})/) ?? rest.match(/\b(\d{1,2})\.(\d{2})\b/);
  if (t && Number(t[1]) < 24) return `${t[1].padStart(2, '0')}:${t[2]}`;
  return undefined;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/\s|\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Tag eines ISO-Zeitstempels in lokaler Zeit (oder eines deutschen Datums davor). */
function wakeDay(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s))) {
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return /^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(s) ? toDate(s, '') : undefined;
}

function toDate(v: unknown, fallback: string): string {
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return fallback;
}

const KEYS = {
  date: ['date', 'datum', 'tag'],
  wake: ['wake', 'aufgestanden', 'aufstehen', 'aufwachen', 'wakeup'],
  sleepStart: ['sleepstart', 'eingeschlafen', 'schlafbeginn', 'bedtime'],
  sleepHours: ['sleephours', 'sleep', 'schlaf', 'schlafdauer', 'schlafstunden'],
  steps: ['steps', 'schritte'],
  restingHr: ['restinghr', 'restingheartrate', 'ruhepuls', 'hr'],
  activeKcal: ['activekcal', 'activeenergy', 'aktiveenergie', 'aktivenergie', 'kcal', 'kalorien'],
  exerciseMin: ['exercisemin', 'exerciseminutes', 'exercise', 'trainingsminuten', 'training', 'bewegungsminuten', 'bewegung'],
  weight: ['weight', 'gewicht', 'körpergewicht', 'koerpergewicht', 'bodymass'],
  bodyFat: ['bodyfat', 'körperfett', 'koerperfett', 'körperfettanteil', 'fettanteil', 'fett'],
};

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const [k, v] of Object.entries(o)) if (keys.includes(k.toLowerCase().replace(/[\s_-]/g, ''))) return v;
  return undefined;
}

function fromObject(o: Record<string, unknown>, today: string): HealthDay | null {
  let sleepHours = toNum(pick(o, KEYS.sleepHours));
  // Schlaf in Minuten geliefert? (Kurzbefehle rechnen gern in Minuten)
  if (sleepHours !== undefined && sleepHours > 24) sleepHours = Math.round((sleepHours / 60) * 100) / 100;
  const day: HealthDay = {
    // Ohne Datum: aus dem Zeitstempel der Aufwachzeit (z. B. Wecker ausgeschaltet), sonst heute.
    date: toDate(pick(o, KEYS.date), wakeDay(pick(o, KEYS.wake)) ?? today),
    wake: toTime(pick(o, KEYS.wake)),
    sleepStart: toTime(pick(o, KEYS.sleepStart)),
    sleepHours,
    steps: toNum(pick(o, KEYS.steps)),
    restingHr: toNum(pick(o, KEYS.restingHr)),
    activeKcal: toNum(pick(o, KEYS.activeKcal)),
    exerciseMin: toNum(pick(o, KEYS.exerciseMin)),
    weight: toNum(pick(o, KEYS.weight)),
    bodyFat: toNum(pick(o, KEYS.bodyFat)),
    source: 'health',
  };
  // Health liefert den Körperfettanteil oft als Anteil (0,23) statt Prozent.
  if (day.bodyFat !== undefined && day.bodyFat > 0 && day.bodyFat < 1) day.bodyFat = Math.round(day.bodyFat * 1000) / 10;
  if (day.activeKcal !== undefined) day.activeKcal = Math.round(day.activeKcal);
  if (day.exerciseMin !== undefined) day.exerciseMin = Math.round(day.exerciseMin);
  const has = [day.wake, day.sleepStart, day.sleepHours, day.steps, day.restingHr, day.activeKcal, day.exerciseMin, day.weight, day.bodyFat].some((x) => x !== undefined);
  if (!has) return null;
  for (const k of Object.keys(day) as (keyof HealthDay)[]) if (day[k] === undefined) delete day[k];
  return day;
}

/**
 * Liest Health-Daten aus Text. Akzeptiert JSON (Objekt oder Liste) oder
 * einfache Zeilen wie "Aufgestanden: 06:42" / "Schritte 4.512".
 */
export function parseHealthText(text: string, today = dayKey(new Date())): HealthDay[] {
  const t = text.trim().replace(/^BYOT[-_ ]?HEALTH\s*/i, '');
  const jsonStart = t.search(/[[{]/);
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(t.slice(jsonStart));
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.flatMap((o) => (o && typeof o === 'object' ? [fromObject(o as Record<string, unknown>, today)].filter(Boolean) as HealthDay[] : []));
    } catch {
      /* weiter mit Zeilenformat */
    }
  }
  const obj: Record<string, unknown> = {};
  for (const line of t.split(/[\n;]+/)) {
    const m = line.match(/^\s*([A-Za-zÄÖÜäöüß _-]+?)\s*[:=]?\s+(.+?)\s*$/) ?? line.match(/^\s*([A-Za-zÄÖÜäöüß _-]+?)\s*[:=]\s*(.+?)\s*$/);
    if (m) obj[m[1]] = m[2];
  }
  const d = fromObject(obj, today);
  return d ? [d] : [];
}

export function mergeHealth(existing: Record<string, HealthDay> | undefined, days: HealthDay[]): Record<string, HealthDay> {
  const out = { ...(existing ?? {}) };
  for (const d of days) out[d.date] = { ...out[d.date], ...d };
  return out;
}

/** Aufstehzeitpunkt eines Tages als Date (oder null). */
export function wakeAt(health: Record<string, HealthDay> | undefined, key: string): Date | null {
  const w = health?.[key]?.wake;
  return w ? atMinutes(parseDayKey(key), parseTime(w)) : null;
}

/** Minuten seit dem Aufstehen zum Zeitpunkt t (null ohne Aufstehzeit oder davor). */
export function minutesSinceWake(health: Record<string, HealthDay> | undefined, t: Date): number | null {
  const w = wakeAt(health, dayKey(t));
  if (!w) return null;
  const m = (t.getTime() - w.getTime()) / 60000;
  return m >= 0 ? m : null;
}

/** Verteilung von Einträgen nach Stunden seit dem Aufstehen (0–19 h). */
export function sinceWakeDistribution(entries: Entry[], health: Record<string, HealthDay> | undefined, weight?: (e: Entry) => number | null) {
  const hours = Array(20).fill(0);
  let used = 0;
  for (const e of entries) {
    const m = minutesSinceWake(health, new Date(e.timestamp));
    if (m === null) continue;
    const w = weight ? weight(e) : 1;
    if (w === null) continue;
    hours[Math.min(19, Math.floor(m / 60))] += w;
    used++;
  }
  return { hours, used, skipped: entries.length - used };
}

// ---------------------------------------------------------------------------
// Virtueller Tracker: macht Health-Werte für Vergleich & Erkenntnisse nutzbar
// ---------------------------------------------------------------------------

export const HEALTH_TRACKER_ID = '__health';

const F = {
  sleep: 'health-sleep',
  steps: 'health-steps',
  wake: 'health-wake',
  hr: 'health-hr',
  kcal: 'health-kcal',
  exercise: 'health-exercise',
  weight: 'health-weight',
  fat: 'health-fat',
};

function healthFields(): FieldDef[] {
  const f = (id: string, label: string, unit: string, polarity: 'higher-better' | 'higher-worse' | 'neutral') => ({
    ...makeField('measurement', label, { unit, aggregation: 'avg', polarity }),
    id,
  });
  return [
    f(F.sleep, 'Schlafdauer', 'h', 'higher-better'),
    f(F.steps, 'Schritte', '', 'higher-better'),
    f(F.wake, 'Aufstehzeit', 'h', 'neutral'),
    f(F.hr, 'Ruhepuls', 'bpm', 'neutral'),
    f(F.kcal, 'Aktive Energie', 'kcal', 'higher-better'),
    f(F.exercise, 'Trainingsminuten', 'min', 'higher-better'),
    f(F.weight, 'Gewicht', 'kg', 'neutral'),
    f(F.fat, 'Körperfett', '%', 'neutral'),
  ];
}

/** Health-Daten als Tracker + Tageseinträge (12:00 Uhr), nur zur Auswertung. */
export function healthAsTracker(health: Record<string, HealthDay> | undefined): { tracker: Tracker; entries: Entry[] } | null {
  const days = Object.values(health ?? {});
  if (days.length < 2) return null;
  const tracker: Tracker = {
    id: HEALTH_TRACKER_ID,
    name: 'Gesundheitsdaten',
    description: 'Aus Apple Health bzw. manuell',
    icon: '❤️',
    color: '#e0315b',
    category: 'Gesundheit',
    fields: healthFields(),
    schedule: { mode: 'manual', times: [], intervalMinutes: 60, intervalStart: '08:00', intervalEnd: '20:00', weekdays: [], repeatMinutes: 0, maxRepeats: 0 },
    views: [],
    createdAt: new Date().toISOString(),
  };
  const entries: Entry[] = days.map((d) => ({
    id: `health-${d.date}`,
    trackerId: HEALTH_TRACKER_ID,
    timestamp: atMinutes(parseDayKey(d.date), 12 * 60).toISOString(),
    values: {
      [F.sleep]: d.sleepHours ?? null,
      [F.steps]: d.steps ?? null,
      [F.wake]: d.wake ? Math.round((parseTime(d.wake) / 60) * 100) / 100 : null,
      [F.hr]: d.restingHr ?? null,
      [F.kcal]: d.activeKcal ?? null,
      [F.exercise]: d.exerciseMin ?? null,
      [F.weight]: d.weight ?? null,
      [F.fat]: d.bodyFat ?? null,
    },
  }));
  return { tracker, entries };
}

/** Tracker und Einträge inklusive Health – für Vergleich und Erkenntnisse. */
export function withHealth(data: AppData): { trackers: Tracker[]; entries: Entry[] } {
  const h = healthAsTracker(data.health);
  return h ? { trackers: [...data.trackers, h.tracker], entries: [...data.entries, ...h.entries] } : { trackers: data.trackers, entries: data.entries };
}

/** Beispiel-Gesundheitsdaten passend zu den Demo-Einträgen. */
export function demoHealth(days: number, now: Date, rnd: () => number): Record<string, HealthDay> {
  const out: Record<string, HealthDay> = {};
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(addDays(now, -i));
    const wakeMin = 5 * 60 + 45 + Math.floor(rnd() * 50);
    const sleep = Math.round((5.5 + rnd() * 3) * 4) / 4;
    out[key] = {
      date: key,
      wake: `${String(Math.floor(wakeMin / 60)).padStart(2, '0')}:${String(wakeMin % 60).padStart(2, '0')}`,
      sleepHours: sleep,
      steps: i === 0 ? Math.round(1500 + rnd() * 2500) : Math.round(3000 + rnd() * 9000),
      restingHr: Math.round(54 + rnd() * 12 - (sleep - 7) * 2),
      activeKcal: Math.round(150 + rnd() * 450),
      exerciseMin: Math.round(rnd() * 50),
      weight: Math.round((72 - (days - i) * 0.02 + (rnd() - 0.5) * 0.8) * 10) / 10,
      bodyFat: Math.round((22 + (rnd() - 0.5) * 1.2) * 10) / 10,
      source: 'demo',
    };
  }
  return out;
}
