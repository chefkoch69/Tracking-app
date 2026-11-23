import { FIELD_TYPES } from './fieldTypes';
import { uid } from './id';
import { defaultSchedule } from './schedule';
import type { FieldConfig, FieldDef, FieldType, Schedule, Tracker, ViewType } from './types';

/**
 * Vorlagen sind nur vorausgefüllte Konfigurationen – exakt dieselbe Struktur,
 * die der Nutzer im Baukasten selbst erstellen kann. Es gibt keinen
 * vorlagenspezifischen Code.
 */

export function makeField(type: FieldType, label: string, config: FieldConfig = {}, required = false): FieldDef {
  return {
    id: uid(),
    label,
    type,
    required,
    config: { ...FIELD_TYPES[type].defaultConfig(), ...config },
  };
}

const severity = (label: string) =>
  makeField('scale', label, { min: 0, max: 3, scaleLabels: ['keine', 'leicht', 'mittel', 'stark'] });

const ALL_VIEWS: ViewType[] = ['history', 'chart', 'calendar', 'stats', 'daily', 'compare'];
const everyDay = [0, 1, 2, 3, 4, 5, 6];

export interface TrackerTemplate {
  key: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  build(): Pick<Tracker, 'fields' | 'schedule' | 'views'>;
}

const sched = (s: Partial<Schedule>): Schedule => ({ ...defaultSchedule(), ...s });

export const TEMPLATES: TrackerTemplate[] = [
  {
    key: 'pushups',
    name: 'Liegestütze',
    category: 'Habit / Fitness',
    icon: '💪',
    color: '#e8590c',
    description: 'Anzahl der Liegestütze regelmäßig dokumentieren.',
    build: () => ({
      fields: [
        makeField('number', 'Anzahl', { min: 0, step: 1, aggregation: 'sum' }, true),
        makeField('measurement', 'Trainingsdauer', { unit: 'min', min: 0, step: 1, aggregation: 'sum' }),
        makeField('text', 'Anmerkungen', { multiline: true }),
      ],
      schedule: sched({ mode: 'manual' }),
      views: ['history', 'chart', 'calendar', 'stats'],
    }),
  },
  {
    key: 'morning',
    name: 'Morgen-Check-in',
    category: 'Gesundheits-Check-in',
    icon: '🌅',
    color: '#f59f00',
    description: 'Das eigene morgendliche Wohlbefinden untersuchen.',
    build: () => ({
      fields: [
        severity('Übelkeit'),
        severity('Bauchschmerzen'),
        severity('Erschöpfung'),
        severity('Kälteempfinden'),
        severity('Tinnitus'),
        makeField('scale', 'Schlafqualität', { min: 0, max: 3, scaleLabels: ['schlecht', 'mäßig', 'gut', 'sehr gut'] }),
        makeField('measurement', 'Schlafdauer', { unit: 'h', min: 0, max: 24, step: 0.25, aggregation: 'avg' }),
        makeField('measurement', 'Raumtemperatur', { unit: '°C', step: 0.5, aggregation: 'avg' }),
        makeField('measurement', 'Luftfeuchtigkeit', { unit: '%', min: 0, max: 100, step: 1, aggregation: 'avg' }),
        makeField('text', 'Besonderheiten', { multiline: true }),
      ],
      schedule: sched({ mode: 'times', times: ['06:45'], weekdays: everyDay, repeatMinutes: 10, maxRepeats: 3 }),
      views: ALL_VIEWS,
    }),
  },
  {
    key: 'food',
    name: 'Ernährung',
    category: 'Ernährungstagebuch',
    icon: '🥗',
    color: '#2f9e44',
    description: 'Lebensmittel und deren Auswirkungen dokumentieren.',
    build: () => ({
      fields: [
        makeField('text', 'Lebensmittel', {}, true),
        makeField('select', 'Mahlzeit', { options: ['Frühstück', 'Mittagessen', 'Abendessen', 'Snack'] }),
        makeField('measurement', 'Menge', { unit: 'g', min: 0, step: 10, aggregation: 'sum' }),
        makeField('scale', 'Beschwerden nach dem Essen', { min: 0, max: 3, scaleLabels: ['keine', 'leicht', 'mittel', 'stark'] }),
        makeField('multiselect', 'Symptome', { options: ['Blähungen', 'Übelkeit', 'Bauchschmerzen', 'Sodbrennen', 'Müdigkeit'] }),
        makeField('scale', 'Energielevel nach dem Essen', { min: 1, max: 5, scaleLabels: ['sehr niedrig', 'niedrig', 'normal', 'hoch', 'sehr hoch'] }),
      ],
      schedule: sched({ mode: 'manual' }),
      views: ['history', 'stats', 'daily', 'calendar', 'compare'],
    }),
  },
  {
    key: 'fitness',
    name: 'Fitness & Fortschritt',
    category: 'Fitness',
    icon: '🏋️',
    color: '#1971c2',
    description: 'Körperliche Entwicklung und Trainingsleistung beobachten.',
    build: () => ({
      fields: [
        makeField('select', 'Übung', { options: ['Bankdrücken', 'Kniebeuge', 'Kreuzheben', 'Schulterdrücken', 'Klimmzüge'] }),
        makeField('measurement', 'Trainingsgewicht', { unit: 'kg', min: 0, step: 2.5, aggregation: 'max' }),
        makeField('number', 'Wiederholungen', { min: 0, step: 1, aggregation: 'max' }),
        makeField('measurement', 'Trainingsdauer', { unit: 'min', min: 0, step: 5, aggregation: 'sum' }),
        makeField('measurement', 'Körpergewicht', { unit: 'kg', min: 0, step: 0.1, aggregation: 'last' }),
        makeField('measurement', 'Taillenumfang', { unit: 'cm', min: 0, step: 0.5, aggregation: 'last' }),
      ],
      schedule: sched({ mode: 'times', times: ['18:00'], weekdays: [1, 3, 5] }),
      views: ['history', 'chart', 'stats', 'compare'],
    }),
  },
  {
    key: 'sleep',
    name: 'Schlaf',
    category: 'Schlaftracking',
    icon: '😴',
    color: '#5f3dc4',
    description: 'Schlafdauer und Erholung jeden Morgen festhalten.',
    build: () => ({
      fields: [
        makeField('datetime', 'Eingeschlafen um'),
        makeField('measurement', 'Schlafdauer', { unit: 'h', min: 0, max: 24, step: 0.25, aggregation: 'avg' }, true),
        makeField('scale', 'Erholung', { min: 1, max: 5, scaleLabels: ['gar nicht', 'wenig', 'mittel', 'gut', 'sehr gut'] }),
        makeField('checkbox', 'Nachts aufgewacht'),
      ],
      schedule: sched({ mode: 'times', times: ['07:30'] }),
      views: ['history', 'chart', 'calendar', 'stats', 'compare'],
    }),
  },
  {
    key: 'cold',
    name: 'Kälteempfinden',
    category: 'Symptomtracking',
    icon: '🥶',
    color: '#1098ad',
    description: 'Kälteempfinden mehrmals täglich erfassen.',
    build: () => ({
      fields: [
        severity('Kälteempfinden'),
        makeField('multiselect', 'Wo?', { options: ['Hände', 'Füße', 'ganzer Körper'] }),
        makeField('measurement', 'Raumtemperatur', { unit: '°C', step: 0.5, aggregation: 'avg' }),
      ],
      schedule: sched({ mode: 'interval', intervalMinutes: 180, intervalStart: '09:00', intervalEnd: '21:00' }),
      views: ['history', 'chart', 'daily', 'stats', 'compare'],
    }),
  },
  {
    key: 'reading',
    name: 'Lesen',
    category: 'Habit Tracker',
    icon: '📚',
    color: '#c2255c',
    description: 'Tägliche Lesegewohnheit aufbauen.',
    build: () => ({
      fields: [
        makeField('checkbox', 'Gelesen'),
        makeField('number', 'Seiten', { min: 0, step: 1, aggregation: 'sum' }),
        makeField('text', 'Buch'),
      ],
      schedule: sched({ mode: 'times', times: ['21:00'] }),
      views: ['history', 'calendar', 'stats', 'chart'],
    }),
  },
];

export function trackerFromTemplate(t: TrackerTemplate): Tracker {
  return {
    id: uid(),
    name: t.name,
    description: t.description,
    icon: t.icon,
    color: t.color,
    category: t.category,
    createdAt: new Date().toISOString(),
    ...t.build(),
  };
}

export function emptyTracker(): Tracker {
  return {
    id: uid(),
    name: '',
    description: '',
    icon: '📈',
    color: '#4c6ef5',
    category: '',
    fields: [],
    schedule: defaultSchedule(),
    views: ['history', 'chart', 'calendar', 'stats'],
    createdAt: new Date().toISOString(),
  };
}
