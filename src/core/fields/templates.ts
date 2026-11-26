import { FIELD_TYPES, withLevels } from './fieldTypes';
import { uid } from '../model/id';
import { defaultSchedule } from '../diary/schedule';
import type { FieldConfig, FieldDef, FieldType, Schedule, Tracker, ViewType } from '../model/types';

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

const ALL_VIEWS: ViewType[] = ['history', 'chart', 'calendar', 'stats', 'daily', 'compare', 'report', 'table'];

const GRADES = 'Stärkegrade: 0 = keine · 1 = leicht (normale Tätigkeit nicht beeinträchtigt) · 2 = mittel (normale Tätigkeit beeinträchtigt) · 3 = schwer (normaler Tagesablauf nicht mehr möglich)';
const graded = (label: string) => ({
  ...makeField('scale', label, { min: 0, max: 3, scaleLabels: ['keine', 'leicht', 'mittel', 'schwer'], polarity: 'higher-worse' }),
  description: GRADES,
});
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

const fiveStep = () =>
  withLevels([
    { value: 0, label: 'keine' },
    { value: 0.5, label: 'sehr leicht' },
    { value: 1, label: 'leicht' },
    { value: 2, label: 'mittel' },
    { value: 3, label: 'schwer' },
  ]);
const symptom = (label: string) => makeField('scale', label, { ...fiveStep(), polarity: 'higher-worse' });

export const TEMPLATES: TrackerTemplate[] = [
  {
    key: 'now',
    name: 'Mein Befinden',
    category: 'Tagebuch',
    icon: '💙',
    color: '#2f63f0',
    description: 'Dein Körper-Tagebuch: Aufstehen, Nacht & Nase, Schlafen, Essen und Trinken, Bauch, Kopf, Tinnitus, Erschöpfung – Details klappen auf, wenn du eine Beschwerde angibst.',
    build: () => {
      const g = (group: string, f: FieldDef): FieldDef => ({ ...f, group });
      const EV = 'Ereignisse & Essen';
      const SL = 'Schlaf & Aufstehen';
      const BA = 'Bauch & Verdauung';
      const KO = 'Kopf';
      const TI = 'Tinnitus';
      const AL = 'Allgemein';
      const KA = 'Kälte';
      const NA = 'Nacht & Nase';
      const fields: FieldDef[] = [
        g(EV, makeField('multiselect', 'Was ist passiert?', {
          options: ['aufgestanden', 'gegessen', 'getrunken', 'Medikament genommen', 'Toilette', 'Bewegung', 'Pause / hingelegt', 'geschlafen', 'Stress', 'schlafen gegangen'],
        })),
        g(EV, { ...makeField('text', 'Was gegessen?', { splitList: true }), description: 'mit Mengen, durch Komma getrennt – z. B. 3 Eier, 3 Scheiben Toast, Käse, Hummus' }),
        g(EV, { ...makeField('text', 'Was getrunken?', { splitList: true }), description: 'z. B. Kaffee, 0,5 l Wasser, Pfefferminztee' }),
        g(EV, makeField('select', 'Bezug zu Mahlzeiten', { options: ['vor der Mahlzeit (noch nichts gegessen)', 'während der Mahlzeit', 'nach der Mahlzeit', 'unabhängig'] })),
        g(EV, { ...makeField('text', 'Medikamente', { splitList: true }), description: 'Name und Dosis, z. B. Buscopan 10 mg' }),
        g(EV, { ...makeField('text', 'Maßnahmen', { splitList: true }), description: 'was du gegen Beschwerden gemacht hast – z. B. Wärmflasche, hingelegt, Spaziergang' }),
        g(SL, makeField('time', 'Wecker gestellt auf')),
        g(SL, makeField('select', 'Gleich aufgestanden?', { options: ['ja, sofort', 'nach Schlummern', 'blieb länger liegen'] })),
        g(SL, makeField('scale', 'Schlafqualität', {
          ...withLevels([
            { value: 1, label: 'sehr schlecht' },
            { value: 2, label: 'schlecht' },
            { value: 3, label: 'okay' },
            { value: 4, label: 'gut' },
            { value: 5, label: 'sehr gut' },
          ]),
          polarity: 'higher-better',
        })),
        g(SL, makeField('time', 'Handy weggelegt um', { overnight: true })),
        // Nacht & Nase: morgens beim Aufstehen – Nasenpflaster, Nase zu, trockener Mund, Blut im Rachen, Klo
        g(NA, makeField('select', 'Nasenpflaster', { options: ['ja, noch drauf', 'ja, aber abgefallen', 'nein'] })),
        g(NA, symptom('Nase zu')),
        g(NA, makeField('select', 'Nase – welche Seite?', { options: ['links', 'rechts', 'beide', 'wechselnd'] })),
        g(NA, symptom('Mund trocken')),
        g(NA, symptom('Halskratzen')),
        g(NA, makeField('select', 'Blut im Rachen / Nasenbluten', { options: ['nein', 'etwas Blut im Rachen / Speichel', 'Nasenbluten'] })),
        g(NA, makeField('select', 'Nachts aufgewacht', { options: ['durchgeschlafen', '1×', '2×', '3× oder öfter'] })),
        g(NA, makeField('select', 'Nachts aufs Klo', { options: ['nein', '1×', '2×', '3× oder öfter'] })),
        g(BA, symptom('Bauchschmerz')),
        g(BA, makeField('multiselect', 'Art der Bauchschmerzen', { options: ['krampfartig', 'stechend', 'drückend', 'brennend', 'dumpf', 'Blähungen / Völlegefühl'] })),
        g(BA, makeField('bodymap', 'Lokalisation', { bodyMap: 'abdomen' })),
        g(BA, makeField('timerange', 'Uhrzeit von–bis', { aggregation: 'sum', polarity: 'higher-worse', metricName: 'Schmerzdauer' })),
        g(BA, symptom('Übelkeit')),
        g(BA, symptom('Würgen / Brechreiz')),
        g(BA, symptom('Sodbrennen')),
        g(BA, symptom('Erbrechen')),
        g(BA, {
          ...makeField('scale', 'Stuhlgang', { ...withLevels(['kein', 'hart', 'geformt', 'weich', 'flüssig'].map((label, value) => ({ value, label }))), polarity: 'neutral' }),
          description: '0 = kein, 1 = hart, 2 = geformt, 3 = weich, 4 = flüssig',
        }),
        g(KO, symptom('Kopfschmerz')),
        g(KO, makeField('bodymap', 'Kopf – wo?', { bodyMap: 'head' })),
        g(KO, makeField('multiselect', 'Art der Kopfschmerzen', { options: ['drückend', 'pochend / pulsierend', 'stechend', 'ziehend', 'dumpf'] })),
        g(KO, makeField('timerange', 'Kopfschmerz von–bis', { aggregation: 'sum', polarity: 'higher-worse', metricName: 'Kopfschmerzdauer' })),
        g(TI, symptom('Tinnitus')),
        g(TI, makeField('select', 'Tinnitus – Ohr', { options: ['links', 'rechts', 'beide', 'eher im Kopf'] })),
        g(TI, makeField('multiselect', 'Tinnitus – Klang', { options: ['Pfeifen', 'Piepen', 'Rauschen', 'Brummen', 'Summen', 'Pulsieren / Klopfen', 'Zischen'] })),
        g(TI, makeField('select', 'Tinnitus – Verlauf', { options: ['gleichbleibend', 'schwankend', 'kommt und geht'] })),
        g(AL, symptom('Müdigkeit')),
        g(AL, { ...symptom('Erschöpfung'), description: '„fertig“, ausgelaugt' }),
        g(AL, makeField('multiselect', 'Art der Erschöpfung', { options: ['körperlich', 'Kopf / Konzentration', 'Schweregefühl', 'Schwäche'] })),
        g(KA, symptom('Kälteempfinden')),
        g(KA, makeField('multiselect', 'Wo kalt?', { options: ['Hände', 'Füße', 'ganzer Körper'] })),
        g(KA, makeField('select', 'Kälte – welche Seite?', { options: ['rechts kälter', 'links kälter', 'beide gleich'] })),
        g(KA, makeField('measurement', 'Raumtemperatur', { unit: '°C', step: 0.5, aggregation: 'avg' })),
        g('Notiz', makeField('text', 'Notiz', { multiline: true })),
      ];
      // Details erscheinen erst, wenn die zugehörige Beschwerde angegeben ist.
      const when: Record<string, string> = {
        'Art der Bauchschmerzen': 'Bauchschmerz',
        Lokalisation: 'Bauchschmerz',
        'Uhrzeit von–bis': 'Bauchschmerz',
        'Bezug zu Mahlzeiten': 'Bauchschmerz',
        'Kopf – wo?': 'Kopfschmerz',
        'Art der Kopfschmerzen': 'Kopfschmerz',
        'Kopfschmerz von–bis': 'Kopfschmerz',
        'Tinnitus – Ohr': 'Tinnitus',
        'Tinnitus – Klang': 'Tinnitus',
        'Tinnitus – Verlauf': 'Tinnitus',
        'Art der Erschöpfung': 'Erschöpfung',
        'Wo kalt?': 'Kälteempfinden',
        'Kälte – welche Seite?': 'Kälteempfinden',
        'Nase – welche Seite?': 'Nase zu',
        Raumtemperatur: 'Kälteempfinden',
      };
      for (const f of fields) {
        const ref = when[f.label] && fields.find((x) => x.label === when[f.label]);
        if (ref) f.showIf = { fieldId: ref.id };
      }
      return {
        fields,
        schedule: sched({ mode: 'times', times: ['20:00'], repeatMinutes: 30, maxRepeats: 2 }),
        views: ['history', 'table', 'report', 'calendar', 'stats', 'chart', 'compare'],
      };
    },
  },
  {
    key: 'abdominal',
    name: 'Bauchschmerztagebuch',
    category: 'Symptomtagebuch',
    icon: '🩺',
    color: '#2f5bea',
    description: 'Bauchschmerzen, Begleitsymptome, Stuhlgang und Medikamente – als Bericht für die Ärztin/den Arzt.',
    build: () => ({
      fields: [
        graded('Bauchschmerz'),
        makeField('timerange', 'Uhrzeit von–bis', { aggregation: 'sum', polarity: 'higher-worse', metricName: 'Schmerzdauer' }),
        makeField('select', 'Bezug zu Mahlzeiten', { options: ['vor der Mahlzeit (noch nichts gegessen)', 'während der Mahlzeit', 'nach der Mahlzeit', 'unabhängig'] }),
        makeField('bodymap', 'Lokalisation', { bodyMap: 'abdomen' }),
        {
          ...makeField('scale', 'Übelkeit', {
            ...withLevels([
              { value: 0, label: 'keine' },
              { value: 0.5, label: 'sehr leicht' },
              { value: 1, label: 'leicht' },
              { value: 2, label: 'mittel' },
              { value: 3, label: 'schwer' },
            ]),
            polarity: 'higher-worse',
          }),
          description: 'Wie Stärkegrade, zusätzlich 0,5 = sehr leicht (kaum spürbar, nur bei Aufmerksamkeit)',
        },
        graded('Sodbrennen'),
        graded('Erbrechen'),
        {
          ...makeField('scale', 'Stuhlgang', { min: 0, max: 4, scaleLabels: ['kein', 'hart', 'geformt', 'weich', 'flüssig'], polarity: 'neutral' }),
          description: '0 = kein, 1 = hart, 2 = geformt, 3 = weich, 4 = flüssig',
        },
        { ...makeField('text', 'Medikamente'), description: 'Name und Dosis – leer lassen, wenn keine' },
        makeField('text', 'Besonderheiten', { multiline: true }),
      ],
      schedule: sched({ mode: 'times', times: ['20:00'], repeatMinutes: 30, maxRepeats: 2 }),
      views: ['history', 'report', 'calendar', 'stats', 'chart', 'compare', 'table'],
    }),
  },
  {
    key: 'pushups',
    name: 'Liegestütze',
    category: 'Habit / Fitness',
    icon: '💪',
    color: '#e8590c',
    description: 'Anzahl der Liegestütze regelmäßig dokumentieren.',
    build: () => ({
      fields: [
        makeField('number', 'Anzahl', { min: 0, step: 1, aggregation: 'sum', polarity: 'higher-better' }, true),
        makeField('measurement', 'Trainingsdauer', { unit: 'min', min: 0, step: 1, aggregation: 'sum' }),
        makeField('text', 'Anmerkungen', { multiline: true }),
      ],
      schedule: sched({ mode: 'manual' }),
      views: ['history', 'chart', 'calendar', 'stats', 'table'],
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
        makeField('scale', 'Schlafqualität', { min: 0, max: 3, scaleLabels: ['schlecht', 'mäßig', 'gut', 'sehr gut'], polarity: 'higher-better' }),
        makeField('measurement', 'Schlafdauer', { unit: 'h', min: 0, max: 24, step: 0.25, aggregation: 'avg', polarity: 'higher-better' }),
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
        makeField('text', 'Lebensmittel', { splitList: true }, true),
        makeField('select', 'Mahlzeit', { options: ['Frühstück', 'Mittagessen', 'Abendessen', 'Snack'] }),
        makeField('measurement', 'Menge', { unit: 'g', min: 0, step: 10, aggregation: 'sum' }),
        makeField('scale', 'Beschwerden nach dem Essen', { min: 0, max: 3, scaleLabels: ['keine', 'leicht', 'mittel', 'stark'] }),
        makeField('multiselect', 'Symptome', { options: ['Blähungen', 'Übelkeit', 'Bauchschmerzen', 'Sodbrennen', 'Müdigkeit'] }),
        makeField('scale', 'Energielevel nach dem Essen', { min: 1, max: 5, scaleLabels: ['sehr niedrig', 'niedrig', 'normal', 'hoch', 'sehr hoch'], polarity: 'higher-better' }),
      ],
      schedule: sched({ mode: 'manual' }),
      views: ['history', 'stats', 'daily', 'calendar', 'compare', 'table'],
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
      views: ['history', 'chart', 'stats', 'compare', 'table'],
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
        makeField('scale', 'Erholung', { min: 1, max: 5, scaleLabels: ['gar nicht', 'wenig', 'mittel', 'gut', 'sehr gut'], polarity: 'higher-better' }),
        makeField('checkbox', 'Nachts aufgewacht'),
      ],
      schedule: sched({ mode: 'times', times: ['07:30'] }),
      views: ['history', 'chart', 'calendar', 'stats', 'compare', 'table'],
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
      views: ['history', 'calendar', 'stats', 'chart', 'table'],
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
    ...(t.key === 'now' ? { quick: true } : {}),
  };
}

export function emptyTracker(): Tracker {
  return {
    id: uid(),
    name: '',
    description: '',
    icon: '📈',
    color: '#2f5bea',
    category: '',
    fields: [],
    schedule: defaultSchedule(),
    views: ['history', 'chart', 'calendar', 'stats', 'table'],
    createdAt: new Date().toISOString(),
  };
}
