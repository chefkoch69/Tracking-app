/**
 * Zentrales Datenmodell.
 *
 * Ein Tracker ist reine Konfiguration: eine Liste von Feldern (Bausteinen),
 * ein Zeitplan und die gewünschten Ansichten. Es gibt keinen Code, der für
 * einen bestimmten Anwendungsfall (Liegestütze, Symptomtagebuch, ...)
 * geschrieben wurde – alles wird generisch aus dieser Konfiguration erzeugt.
 */

export type FieldType =
  | 'number'
  | 'measurement'
  | 'scale'
  | 'text'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'datetime'
  | 'timerange'
  | 'bodymap';

/** Ob ein höherer Wert gut, schlecht oder neutral ist (für Farben & Erkenntnisse). */
export type Polarity = 'higher-worse' | 'higher-better' | 'neutral';

export type BodyMapKind = 'abdomen' | 'body';

/** Wie Werte eines Feldes pro Tag/Woche/Monat zusammengefasst werden. */
export type Aggregation = 'sum' | 'avg' | 'max' | 'min' | 'last' | 'count';

export interface FieldConfig {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Auswahloptionen für select / multiselect. */
  options?: string[];
  /** Beschriftungen der Skalenstufen (Index 0 = min). */
  scaleLabels?: string[];
  multiline?: boolean;
  aggregation?: Aggregation;
  polarity?: Polarity;
  /** Welches Lokalisationsschema (Feldtyp bodymap). */
  bodyMap?: BodyMapKind;
}

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  config: FieldConfig;
}

/** Zeitraum "HH:MM"–"HH:MM" (Feldtyp timerange). */
export interface TimeRange {
  from: string;
  to: string;
}

export type FieldValue = number | string | boolean | string[] | TimeRange | null;

export type ScheduleMode = 'manual' | 'times' | 'interval';

export interface Schedule {
  mode: ScheduleMode;
  /** Feste Uhrzeiten "HH:MM" (mode = times). */
  times: string[];
  /** Intervall in Minuten (mode = interval). */
  intervalMinutes: number;
  /** Zeitfenster für Intervall-Erinnerungen "HH:MM". */
  intervalStart: string;
  intervalEnd: string;
  /** Aktive Wochentage, 0 = Sonntag … 6 = Samstag. */
  weekdays: number[];
  /** Erneut erinnern nach X Minuten, wenn nicht erledigt (0 = aus). */
  repeatMinutes: number;
  /** Maximale Anzahl Wiederholungen. */
  maxRepeats: number;
}

export type ViewType = 'history' | 'chart' | 'calendar' | 'stats' | 'daily' | 'compare' | 'report';

export interface Tracker {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  fields: FieldDef[];
  schedule: Schedule;
  views: ViewType[];
  createdAt: string;
  archived?: boolean;
}

export interface Entry {
  id: string;
  trackerId: string;
  /** ISO-Zeitstempel des Eintrags (automatisch, änderbar). */
  timestamp: string;
  values: Record<string, FieldValue>;
}

/** Zustand der Erinnerungen je Tracker (für Wiederholungen / Schlummern). */
export interface ReminderState {
  /** Schlüssel der zuletzt ausgelösten Benachrichtigung (slot#n). */
  lastFiredKey?: string;
  /** Geschlummerter Slot und Zeitpunkt der nächsten Erinnerung. */
  snooze?: { slot: string; until: string };
  /** Slot, der manuell übersprungen wurde. */
  skippedSlot?: string;
}

/** Optionale Angaben für Berichte (z. B. Arztbogen). */
export interface Profile {
  name?: string;
  birthdate?: string;
}

export interface AppData {
  version: 1;
  trackers: Tracker[];
  entries: Entry[];
  reminders: Record<string, ReminderState>;
  profile?: Profile;
}
