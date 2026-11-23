import { BODY_MAPS, regionLabel } from './bodyMaps';
import type { Aggregation, FieldConfig, FieldDef, FieldType, FieldValue, Polarity, ScaleLevel, TimeRange } from './types';

/**
 * Registry aller Feldtypen (Bausteine).
 *
 * Jeder Feldtyp beschreibt hier seine fachliche Logik: Standardkonfiguration,
 * Validierung, Formatierung und wie er in Auswertungen eingeht. Die
 * passende Eingabe-/Konfigurations-UI liegt in `ui/fieldInputs.tsx`.
 * Ein neuer Baustein = ein Eintrag hier + ein Eintrag dort.
 */
export interface FieldTypeSpec {
  type: FieldType;
  label: string;
  hint: string;
  icon: string;
  /** Liefert einen Zahlenwert → erscheint in Diagrammen/Statistiken/Vergleichen. */
  numeric: boolean;
  /** Liefert Kategorien → erscheint in Häufigkeitsauswertungen. */
  categorical: boolean;
  defaultAggregation: Aggregation;
  defaultConfig(): FieldConfig;
  emptyValue(field: FieldDef): FieldValue;
  /** Fehlermeldung oder null. Wird nur für nicht-leere Werte aufgerufen. */
  validate(field: FieldDef, value: FieldValue): string | null;
  format(field: FieldDef, value: FieldValue): string;
  toNumber(field: FieldDef, value: FieldValue): number | null;
  categories(field: FieldDef, value: FieldValue): string[];
}

export function isEmptyValue(v: FieldValue | undefined): boolean {
  if (isTimeRange(v)) return !v.from && !v.to;
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

const fmtNumber = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

function withUnit(field: FieldDef, n: number): string {
  return field.config.unit ? `${fmtNumber(n)} ${field.config.unit}` : fmtNumber(n);
}

function validateRange(field: FieldDef, value: FieldValue): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Bitte eine Zahl eingeben.';
  const { min, max } = field.config;
  if (min !== undefined && value < min) return `Mindestens ${min}.`;
  if (max !== undefined && value > max) return `Höchstens ${max}.`;
  return null;
}

const numberToNumber = (_f: FieldDef, v: FieldValue) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : null;

const none = () => [] as string[];

/** Text-Liste in Einträge zerlegen (Komma, Semikolon, Zeilenumbruch, „und“). */
export function listItems(text: string): string[] {
  return text
    .split(/[,;\n]+|\s+und\s+|\s+\+\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Mengenangabe vorne entfernen: "3 Scheiben Toast" → "Toast", "100 g Hummus" → "Hummus". */
export function itemName(item: string): string {
  const s = item
    .replace(/^\s*(ein(e|en|er)?|zwei|drei|vier|fünf|halbe?s?|\d+([.,]\d+)?)\s*(x|×)?\s*/i, '')
    .replace(/^(g|kg|ml|l|stk\.?|stück|scheiben?|portion(en)?|tassen?|gläser|glas|el|tl|becher|schalen?|handvoll|stücke?)\s+/i, '')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : item.trim();
}

export const fmtLevel = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

/** Stufen einer Skala – aus levels oder (ältere Form) aus min/max/scaleLabels abgeleitet. */
export function scaleLevels(config: FieldConfig): ScaleLevel[] {
  if (config.levels?.length) return [...config.levels].sort((a, b) => a.value - b.value);
  const min = config.min ?? 0;
  const max = config.max ?? 3;
  const n = Math.max(0, Math.min(21, Math.round(max - min) + 1));
  return Array.from({ length: n }, (_, i) => ({ value: min + i, label: config.scaleLabels?.[i] ?? '' }));
}

/** Setzt Stufen und hält min/max für Auswertungen synchron. */
export function withLevels(levels: ScaleLevel[]): Partial<FieldConfig> {
  const sorted = [...levels].sort((a, b) => a.value - b.value);
  return {
    levels: sorted,
    min: sorted.length ? sorted[0].value : 0,
    max: sorted.length ? sorted[sorted.length - 1].value : 0,
    scaleLabels: undefined,
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTimeRange(v: unknown): v is TimeRange {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'from' in v && 'to' in v;
}

/** Dauer eines Zeitraums in Minuten (über Mitternacht möglich). */
export function rangeMinutes(r: TimeRange): number | null {
  if (!TIME_RE.test(r.from) || !TIME_RE.test(r.to)) return null;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const d = toMin(r.to) - toMin(r.from);
  return d >= 0 ? d : d + 24 * 60;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export const FIELD_TYPES: Record<FieldType, FieldTypeSpec> = {
  number: {
    type: 'number',
    label: 'Zahlenfeld',
    hint: 'z. B. Anzahl Liegestütze, Seiten, Wiederholungen',
    icon: '#',
    numeric: true,
    categorical: false,
    defaultAggregation: 'sum',
    defaultConfig: () => ({ min: 0, step: 1 }),
    emptyValue: () => null,
    validate: validateRange,
    format: (f, v) => (typeof v === 'number' ? withUnit(f, v) : '–'),
    toNumber: numberToNumber,
    categories: none,
  },
  measurement: {
    type: 'measurement',
    label: 'Messwert mit Einheit',
    hint: 'z. B. Gewicht in kg, Temperatur in °C, Luftfeuchtigkeit in %',
    icon: '⚖',
    numeric: true,
    categorical: false,
    defaultAggregation: 'avg',
    defaultConfig: () => ({ unit: 'kg', step: 0.1 }),
    emptyValue: () => null,
    validate: validateRange,
    format: (f, v) => (typeof v === 'number' ? withUnit(f, v) : '–'),
    toNumber: numberToNumber,
    categories: none,
  },
  scale: {
    type: 'scale',
    label: 'Bewertungsskala',
    hint: 'z. B. Beschwerden 0–3, Stimmung 1–5',
    icon: '◔',
    numeric: true,
    categorical: false,
    defaultAggregation: 'avg',
    defaultConfig: () => ({ min: 0, max: 3, scaleLabels: ['keine', 'leicht', 'mittel', 'stark'] }),
    emptyValue: () => null,
    validate: (f, v) => {
      if (typeof v !== 'number' || Number.isNaN(v)) return 'Bitte eine Stufe wählen.';
      return scaleLevels(f.config).some((l) => l.value === v) ? null : 'Diese Stufe gibt es auf der Skala nicht.';
    },
    format: (f, v) => {
      if (typeof v !== 'number') return '–';
      const label = scaleLevels(f.config).find((l) => l.value === v)?.label;
      return label ? `${fmtLevel(v)} (${label})` : fmtLevel(v);
    },
    toNumber: numberToNumber,
    categories: none,
  },
  text: {
    type: 'text',
    label: 'Textfeld',
    hint: 'z. B. Lebensmittel, Anmerkungen, Besonderheiten',
    icon: 'T',
    numeric: false,
    categorical: true,
    defaultAggregation: 'count',
    defaultConfig: () => ({ multiline: false }),
    emptyValue: () => '',
    validate: (_f, v) => (typeof v === 'string' ? null : 'Ungültiger Text.'),
    format: (_f, v) => (typeof v === 'string' && v ? v : '–'),
    toNumber: () => null,
    // Nur einzeilige Texte sind sinnvolle Kategorien (z. B. "Lebensmittel").
    // Als Liste markiert: jeder Eintrag einzeln, ohne Mengenangabe ("3 Eier" → "Eier").
    categories: (f, v) => {
      if (f.config.multiline || typeof v !== 'string' || !v.trim()) return [];
      return f.config.splitList ? listItems(v).map(itemName) : [v.trim()];
    },
  },
  select: {
    type: 'select',
    label: 'Auswahlfeld',
    hint: 'eine Option aus einer Liste',
    icon: '◉',
    numeric: false,
    categorical: true,
    defaultAggregation: 'count',
    defaultConfig: () => ({ options: ['Option A', 'Option B'] }),
    emptyValue: () => null,
    validate: (f, v) =>
      typeof v === 'string' && (f.config.options ?? []).includes(v) ? null : 'Bitte eine Option wählen.',
    format: (_f, v) => (typeof v === 'string' ? v : '–'),
    toNumber: () => null,
    categories: (_f, v) => (typeof v === 'string' ? [v] : []),
  },
  multiselect: {
    type: 'multiselect',
    label: 'Mehrfachauswahl',
    hint: 'mehrere Optionen gleichzeitig, z. B. Symptome',
    icon: '☰',
    numeric: false,
    categorical: true,
    defaultAggregation: 'count',
    defaultConfig: () => ({ options: ['Option A', 'Option B', 'Option C'] }),
    emptyValue: () => [],
    validate: (f, v) => {
      if (!Array.isArray(v)) return 'Ungültige Auswahl.';
      const opts = f.config.options ?? [];
      return v.every((x) => opts.includes(x)) ? null : 'Unbekannte Option.';
    },
    format: (_f, v) => (Array.isArray(v) && v.length ? v.join(', ') : '–'),
    toNumber: () => null,
    categories: (_f, v) => (Array.isArray(v) ? v : []),
  },
  checkbox: {
    type: 'checkbox',
    label: 'Checkbox',
    hint: 'Ja/Nein, z. B. „Heute gelesen?“',
    icon: '☑',
    numeric: true,
    categorical: true,
    defaultAggregation: 'sum',
    defaultConfig: () => ({}),
    emptyValue: () => false,
    validate: (_f, v) => (typeof v === 'boolean' ? null : 'Ungültiger Wert.'),
    format: (_f, v) => (v === true ? 'Ja' : v === false ? 'Nein' : '–'),
    toNumber: (_f, v) => (typeof v === 'boolean' ? (v ? 1 : 0) : null),
    categories: (_f, v) => (typeof v === 'boolean' ? [v ? 'Ja' : 'Nein'] : []),
  },
  datetime: {
    type: 'datetime',
    label: 'Datum/Uhrzeit',
    hint: 'zusätzlicher Zeitpunkt, z. B. Einschlafzeit',
    icon: '◷',
    numeric: false,
    categorical: false,
    defaultAggregation: 'count',
    defaultConfig: () => ({}),
    emptyValue: () => null,
    validate: (_f, v) =>
      typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? null : 'Ungültiges Datum.',
    format: (_f, v) =>
      typeof v === 'string' && v
        ? new Date(v).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
        : '–',
    toNumber: () => null,
    categories: none,
  },
  timerange: {
    type: 'timerange',
    label: 'Zeitraum (von–bis)',
    hint: 'z. B. Dauer der Beschwerden, Schlafenszeit',
    icon: '↔',
    numeric: true,
    categorical: false,
    defaultAggregation: 'sum',
    defaultConfig: () => ({ unit: 'min' }),
    emptyValue: () => ({ from: '', to: '' }),
    validate: (_f, v) =>
      isTimeRange(v) && rangeMinutes(v) !== null ? null : 'Bitte Beginn und Ende angeben.',
    format: (_f, v) => {
      if (!isTimeRange(v)) return '–';
      const d = rangeMinutes(v);
      return d === null ? '–' : `${v.from}–${v.to} (${formatDuration(d)})`;
    },
    toNumber: (_f, v) => (isTimeRange(v) ? rangeMinutes(v) : null),
    categories: none,
  },
  bodymap: {
    type: 'bodymap',
    label: 'Körperkarte / Lokalisation',
    hint: 'Wo genau? Regionen auf einem Schema antippen',
    icon: '⌖',
    numeric: false,
    categorical: true,
    defaultAggregation: 'count',
    defaultConfig: () => ({ bodyMap: 'abdomen' }),
    emptyValue: () => [],
    validate: (f, v) => {
      if (!Array.isArray(v)) return 'Ungültige Auswahl.';
      const ids = BODY_MAPS[f.config.bodyMap ?? 'abdomen'].regions.map((r) => r.id);
      return v.every((x) => ids.includes(x)) ? null : 'Unbekannte Region.';
    },
    format: (f, v) =>
      Array.isArray(v) && v.length ? v.map((id) => regionLabel(f.config.bodyMap ?? 'abdomen', id)).join(', ') : '–',
    toNumber: () => null,
    categories: (f, v) => (Array.isArray(v) ? v.map((id) => regionLabel(f.config.bodyMap ?? 'abdomen', id)) : []),
  },
};

export const FIELD_TYPE_LIST = Object.values(FIELD_TYPES);

export function fieldSpec(field: FieldDef): FieldTypeSpec {
  return FIELD_TYPES[field.type];
}

export function polarityOf(field: FieldDef): Polarity {
  if (field.config.polarity) return field.config.polarity;
  return field.type === 'scale' ? 'higher-worse' : 'neutral';
}

/** Kurzform für Tabellen/Pills (Skalen nur als Zahl, Zeiträume als Dauer). */
export function formatShort(field: FieldDef, value: FieldValue | undefined): string {
  if (value === undefined || isEmptyValue(value)) return '';
  if (field.type === 'scale' && typeof value === 'number') return fmtLevel(value);
  if (field.type === 'bodymap' && Array.isArray(value)) return value.join(', ');
  if (field.type === 'timerange' && isTimeRange(value)) return `${value.from}–${value.to}`;
  const s = formatValue(field, value);
  return s === '–' ? '' : s;
}

/**
 * Schweregrad 0..1 eines Wertes (0 = gut, 1 = schlecht) für die Einfärbung.
 * null, wenn das Feld keine Bewertungsrichtung hat.
 */
export function severity(field: FieldDef, value: FieldValue | undefined): number | null {
  const pol = polarityOf(field);
  if (pol === 'neutral' || typeof value !== 'number') return null;
  const { min, max } = field.config;
  if (min === undefined || max === undefined || max <= min) return null;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return pol === 'higher-worse' ? t : 1 - t;
}

/** Bezeichnung einer Messgröße in Auswertungen (Zeiträume werden als Dauer ausgewertet). */
export function metricLabel(field: FieldDef): string {
  return field.type === 'timerange' ? `Dauer (${field.label})` : field.label;
}

export function aggregationOf(field: FieldDef): Aggregation {
  return field.config.aggregation ?? FIELD_TYPES[field.type].defaultAggregation;
}

export function formatValue(field: FieldDef, value: FieldValue | undefined): string {
  if (value === undefined) return '–';
  return fieldSpec(field).format(field, value);
}

/** Validiert alle Werte eines Eintrags. Liefert Fehler je Feld-ID. */
export function validateValues(
  fields: FieldDef[],
  values: Record<string, FieldValue>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.id];
    if (isEmptyValue(v)) {
      if (f.required && f.type !== 'checkbox') errors[f.id] = 'Pflichtfeld.';
      continue;
    }
    const err = fieldSpec(f).validate(f, v as FieldValue);
    if (err) errors[f.id] = err;
  }
  return errors;
}

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: 'Summe',
  avg: 'Durchschnitt',
  max: 'Maximum',
  min: 'Minimum',
  last: 'Letzter Wert',
  count: 'Anzahl',
};

/** Felder nach Abschnitt gruppieren (Reihenfolge bleibt; Felder ohne Abschnitt unter „Weitere“). */
export function groupFields(fields: FieldDef[]): { name: string; fields: FieldDef[] }[] {
  const out: { name: string; fields: FieldDef[] }[] = [];
  for (const f of fields) {
    const name = f.group?.trim() || 'Weitere';
    const g = out.find((x) => x.name === name);
    if (g) g.fields.push(f);
    else out.push({ name, fields: [f] });
  }
  return out;
}
