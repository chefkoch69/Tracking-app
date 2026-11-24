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
  | 'time'
  | 'bodymap';

/** Ob ein höherer Wert gut, schlecht oder neutral ist (für Farben & Erkenntnisse). */
export type Polarity = 'higher-worse' | 'higher-better' | 'neutral';

export type BodyMapKind = 'abdomen' | 'body' | 'head';

/** Wie Werte eines Feldes pro Tag/Woche/Monat zusammengefasst werden. */
export type Aggregation = 'sum' | 'avg' | 'max' | 'min' | 'last' | 'count';

export interface FieldConfig {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Auswahloptionen für select / multiselect. */
  options?: string[];
  /** Beschriftungen der Skalenstufen (Index 0 = min). Ältere Form, siehe levels. */
  scaleLabels?: string[];
  /**
   * Frei definierte Skalenstufen (aufsteigend), z. B. 0 keine, 0,5 sehr leicht, 1 leicht …
   * Hat Vorrang vor min/max/scaleLabels; min/max werden synchron gehalten.
   */
  levels?: ScaleLevel[];
  multiline?: boolean;
  aggregation?: Aggregation;
  polarity?: Polarity;
  /** Welches Lokalisationsschema (Feldtyp bodymap). */
  bodyMap?: BodyMapKind;
  /** Name in Auswertungen, z. B. „Schmerzdauer“ für ein Feld „Uhrzeit von–bis“. */
  metricName?: string;
  /** Text: mehrere Einträge mit Komma (z. B. Lebensmittel) – einzeln ausgewertet. */
  splitList?: boolean;
  /** Zeitraum: Beginn automatisch mit der Aufstehzeit vorbelegen. */
  fromWake?: boolean;
  /** Uhrzeit: Zeiten vor 12 Uhr zählen zum Vorabend (z. B. „Handy weggelegt um 00:30“). */
  overnight?: boolean;
}

/**
 * Feld nur zeigen, wenn ein anderes Feld passt – z. B. Bauchweh-Details erst, wenn
 * „Bauchschmerz“ über 0 liegt. Ohne Angabe: Zahl/Skala über 0 bzw. Häkchen gesetzt.
 */
export interface ShowIf {
  fieldId: string;
  /** Zahl/Skala mindestens so groß. */
  atLeast?: number;
  /** Auswahl gleich bzw. Mehrfachauswahl enthält diesen Wert. */
  equals?: string;
}

export interface ScaleLevel {
  value: number;
  label: string;
}

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  description?: string;
  config: FieldConfig;
  /** Ausgeblendet: erscheint nicht mehr im Eingabeformular, Daten bleiben erhalten. */
  hidden?: boolean;
  /** Abschnitt im Formular (z. B. „Bauch & Verdauung“); Felder ohne Abschnitt stehen unter „Weitere“. */
  group?: string;
  /** Nur zeigen, wenn … (Details, die „aufploppen“). */
  showIf?: ShowIf;
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

export type ViewType = 'history' | 'chart' | 'calendar' | 'stats' | 'daily' | 'compare' | 'report' | 'table';

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
  /** Beispieldaten – lassen sich gesammelt entfernen. */
  demo?: boolean;
  /** Erscheint auf der „Jetzt“-Seite für den schnellen Check-in. */
  quick?: boolean;
  /** Selbst entfernte Vorlagen-Felder (Bezeichnungen) – werden nicht automatisch wieder ergänzt. */
  templateSkip?: string[];
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

/** Tageswerte aus Apple Health (per Kurzbefehl) oder manuell. */
export interface HealthDay {
  /** YYYY-MM-DD */
  date: string;
  /** Aufstehzeit "HH:MM". */
  wake?: string;
  /** Einschlafzeit "HH:MM" (Vorabend). */
  sleepStart?: string;
  sleepHours?: number;
  steps?: number;
  restingHr?: number;
  /** Bewegung: aktive Energie (kcal) und Trainingsminuten. */
  activeKcal?: number;
  exerciseMin?: number;
  /** Körperanalyse (z. B. Waage, die in Health schreibt). */
  weight?: number;
  bodyFat?: number;
  source: 'manual' | 'health' | 'demo';
}

/** Optionale Angaben für Berichte (z. B. Arztbogen). */
export interface Profile {
  name?: string;
  birthdate?: string;
  /** Nächster Arzttermin (YYYY-MM-DD). */
  appointment?: string;
  /** Fragen für den Termin, eine pro Zeile. */
  questions?: string;
  /** Arztzettel (von Claude erstellt, selbst bearbeitet) und für welchen Zeitraum. */
  summary?: string;
  summaryFrom?: string;
  summaryTo?: string;
}

/** Etwas, das man ausprobieren will, gerade ausprobiert oder schon ausprobiert hat. */
export interface Experiment {
  id: string;
  title: string;
  category?: string;
  status: 'idea' | 'running' | 'done';
  /** YYYY-MM-DD */
  startedAt?: string;
  endedAt?: string;
  verdict?: 'helped' | 'partly' | 'no' | 'unclear';
  note?: string;
  createdAt: string;
}

/** Tagebuch-Notiz eines Tages: Gesamteindruck (1 = schlecht … 5 = sehr gut) und ein Satz. */
export interface DayNote {
  mood?: number;
  note?: string;
}

export interface AppData {
  version: 1;
  trackers: Tracker[];
  entries: Entry[];
  reminders: Record<string, ReminderState>;
  profile?: Profile;
  /** Gesundheitsdaten je Tag (Schlüssel YYYY-MM-DD). */
  health?: Record<string, HealthDay>;
  /** Was ich ausprobieren will / ausprobiere / ausprobiert habe. */
  experiments?: Experiment[];
  /** Je Tag (YYYY-MM-DD): „Wie war der Tag?“ */
  days?: Record<string, DayNote>;
}
