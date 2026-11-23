import type { Aggregation, FieldConfig, FieldDef, FieldType, FieldValue } from './types';

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
    validate: validateRange,
    format: (f, v) => {
      if (typeof v !== 'number') return '–';
      const label = f.config.scaleLabels?.[v - (f.config.min ?? 0)];
      return label ? `${v} (${label})` : String(v);
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
    categories: (f, v) =>
      !f.config.multiline && typeof v === 'string' && v.trim() ? [v.trim()] : [],
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
};

export const FIELD_TYPE_LIST = Object.values(FIELD_TYPES);

export function fieldSpec(field: FieldDef): FieldTypeSpec {
  return FIELD_TYPES[field.type];
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
