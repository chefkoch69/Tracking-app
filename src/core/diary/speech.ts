import type { FieldValue } from '../model/types';

/**
 * Gesprochenen (oder getippten) Text direkt in der App auswerten – ohne Server, ohne KI.
 * Erkennt Beschwerden mit Stärke, Details (Art, Stelle, Ohr, Klang …), Aufstehen, Schlaf,
 * Wecker, Handy, Essen, Trinken und Medikamente. Ergebnis: Werte nach Feldbezeichnung.
 */

export interface SpeechResult {
  /** Werte je Feldbezeichnung (z. B. „Bauchschmerz“ → 3). */
  values: Record<string, FieldValue>;
  /** Aufwachzeit „HH:MM“, falls genannt. */
  wake?: string;
  /** Ereignisse für „Was ist passiert?“. */
  events: string[];
}

const NUM: Record<string, number> = {
  null: 0, eins: 1, ein: 1, eine: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
  dreizehn: 13, vierzehn: 14, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50,
};
const num = (w: string | undefined): number | null => {
  if (!w) return null;
  if (/^\d+$/.test(w)) return Number(w);
  return NUM[w] ?? null;
};
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (h: number, m: number) => (h >= 0 && h < 24 && m >= 0 && m < 60 ? `${pad(h)}:${pad(m)}` : null);

/** Uhrzeit aus einem Satzteil: „um 7“, „7:30“, „halb acht“, „viertel nach sieben“, „um 7 Uhr 20“. */
export function findClock(s: string): string | null {
  let m = s.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (m) return hhmm(+m[1], +m[2]);
  m = s.match(/\bdreiviertel\s+(\w+)/);
  if (m && num(m[1]) !== null) return hhmm((num(m[1])! + 23) % 24, 45);
  m = s.match(/\bhalb\s+(\w+)/);
  if (m && num(m[1]) !== null) return hhmm((num(m[1])! + 23) % 24, 30);
  m = s.match(/\bviertel\s+nach\s+(\w+)/);
  if (m && num(m[1]) !== null) return hhmm(num(m[1])! % 24, 15);
  m = s.match(/\bviertel\s+vor\s+(\w+)/);
  if (m && num(m[1]) !== null) return hhmm((num(m[1])! + 23) % 24, 45);
  m = s.match(/\b(?:um|gegen|ab|auf)\s+(\w+)(?:\s+uhr)?(?:\s+(\w+))?/);
  if (m && num(m[1]) !== null) {
    const min = num(m[2]);
    return hhmm(num(m[1])!, min !== null && min < 60 && !/^(ein|eine|einem)$/.test(m[2] ?? '') ? min : 0);
  }
  m = s.match(/\b(\w+)\s+uhr\b/);
  if (m && num(m[1]) !== null) return hhmm(num(m[1])!, 0);
  return null;
}

// ---------------------------------------------------------------------------
// Beschwerden

interface Symptom {
  label: string;
  re: RegExp;
  /** Satzteile mit diesen Wörtern gehören zu etwas anderem. */
  not?: RegExp;
}

const SYMPTOMS: Symptom[] = [
  { label: 'Übelkeit', re: /übel|mir ist (?:so |ganz |etwas )?schlecht|brechreiz/ },
  { label: 'Würgen / Brechreiz', re: /würg|brechreiz/ },
  { label: 'Erbrechen', re: /erbroch|erbrechen|übergeben|gekotzt/ },
  { label: 'Sodbrennen', re: /sodbrennen|aufstoßen|saures aufstoßen/ },
  { label: 'Bauchschmerz', re: /bauch|magen/, not: /übel|aufgebläht.*getrunken/ },
  { label: 'Kopfschmerz', re: /kopf|migräne|schläfe|stirn|hinterkopf/, not: /erschöpf|konzentr|müde|im kopf erschöpft/ },
  { label: 'Tinnitus', re: /tinnitus|ohr|pfeif|piep|rauscht/ },
  { label: 'Müdigkeit', re: /müde|müdigkeit|schläfrig/ },
  { label: 'Erschöpfung', re: /erschöpf|kaputt|schlapp|ausgelaugt|k\.?\s?o\.?\b|energielos|keine energie|keine kraft/ },
  { label: 'Nase zu', re: /nase\b[^.,;]{0,30}\b(?:zu|verstopft|dicht|frei)\b|verstopfte nase|keine luft durch die nase/ },
  { label: 'Mund trocken', re: /mund\b[^.,;]{0,30}(?:trocken|ausgetrocknet)|trocken(?:er|en) mund/ },
  { label: 'Halskratzen', re: /hals (?:kratzt|kratzig|wund|tut weh)|halskratzen|halsschmerz/ },
  { label: 'Kälteempfinden', re: /\bkalt|kälte|frier|fröstel/, not: /getrunken|gegessen|wasser|getränk/ },
];

/** Stärke aus einem Satzteil: 0 keine … 3 schwer; null = nichts gesagt. */
function intensity(s: string): number | null {
  if (/nicht (?:mehr |ganz )?(?:so |sehr )?(?:stark|schlimm|arg)/.test(s)) return 1;
  if (/\b(kein|keine|keinen|keiner|nicht|ohne|nichts)\b/.test(s) && !/keine energie|keine kraft/.test(s)) return 0;
  if (/\b(gut|passt|okay|ok|in ordnung|ruhig|weg|normal|fein|super|frei)\b/.test(s) && !/nicht gut/.test(s)) return 0;
  if (/\b(sehr stark|extrem\w*|heftig\w*|schlimm\w*|stark\w*|arg\w*|massiv\w*|unerträglich\w*|richtig|wahnsinnig|total)\b/.test(s)) return 3;
  if (/\b(kaum|minimal\w*|ganz leicht\w*|sehr leicht\w*|ein bisschen|ein bissl|ein wenig|bisschen|bissl)\b/.test(s)) return 0.5;
  if (/\b(mittel\w*|mittler\w*|mäßig\w*|ziemlich|deutlich\w*|einige|spürbar\w*|ganz schön|schon)\b/.test(s)) return 2;
  if (/\b(leicht\w*|etwas|wenig|besser)\b/.test(s)) return 1;
  return null;
}

type Detail = { label: string; options: [RegExp, string][]; multi?: boolean; region?: boolean };

const DETAILS: Record<string, Detail[]> = {
  Bauchschmerz: [
    {
      label: 'Art der Bauchschmerzen',
      multi: true,
      options: [
        [/krampf/, 'krampfartig'],
        [/stech|sticht/, 'stechend'],
        [/drück|drückt/, 'drückend'],
        [/brenn/, 'brennend'],
        [/dumpf/, 'dumpf'],
        [/bläh|völle|aufgebläht|voll\b/, 'Blähungen / Völlegefühl'],
      ],
    },
    {
      label: 'Lokalisation',
      multi: true,
      region: true,
      options: [
        [/oberbauch\s+(?:mitte|in der mitte)|magen/, '1'],
        [/oberbauch\s+rechts|rechts\s+oben/, '2'],
        [/oberbauch\s+links|links\s+oben/, '3'],
        [/unterbauch\s+rechts|rechts\s+unten/, '4'],
        [/unterbauch\s+links|links\s+unten/, '5'],
        [/nabel/, '6'],
      ],
    },
    {
      label: 'Bezug zu Mahlzeiten',
      options: [
        [/nach dem essen|nachdem ich gegessen|nach der mahlzeit/, 'nach der Mahlzeit'],
        [/beim essen|während des essens|während dem essen/, 'während der Mahlzeit'],
        [/vor dem essen|nüchtern|noch nichts gegessen/, 'vor der Mahlzeit (noch nichts gegessen)'],
        [/unabhängig vom essen|ohne bezug/, 'unabhängig'],
      ],
    },
  ],
  Kopfschmerz: [
    {
      label: 'Art der Kopfschmerzen',
      multi: true,
      options: [
        [/drück|drückt/, 'drückend'],
        [/poch|pulsier|hämmer|klopf/, 'pochend / pulsierend'],
        [/stech|sticht/, 'stechend'],
        [/zieh|zieht/, 'ziehend'],
        [/dumpf/, 'dumpf'],
      ],
    },
    {
      label: 'Kopf – wo?',
      multi: true,
      region: true,
      options: [
        [/stirn/, 'stirn'],
        [/auge|nasenwurzel/, 'augen'],
        [/schläfe[n]?\s+rechts|rechte[n]?\s+schläfe/, 'schlaefe-r'],
        [/schläfe[n]?\s+links|linke[n]?\s+schläfe/, 'schlaefe-l'],
        [/kiefer|gesicht/, 'kiefer'],
        [/scheitel|oben am kopf|oben auf dem kopf/, 'scheitel'],
        [/hinterkopf/, 'hinterkopf'],
        [/nacken/, 'nacken'],
        [/ganze[nr]? kopf|ganzen kopf|überall/, 'ganz'],
      ],
    },
  ],
  Tinnitus: [
    {
      label: 'Tinnitus – Ohr',
      options: [
        [/beide|beiden/, 'beide'],
        [/links|linke/, 'links'],
        [/rechts|rechte/, 'rechts'],
        [/im kopf/, 'eher im Kopf'],
      ],
    },
    {
      label: 'Tinnitus – Klang',
      multi: true,
      options: [
        [/pfeif/, 'Pfeifen'],
        [/piep/, 'Piepen'],
        [/rausch/, 'Rauschen'],
        [/brumm/, 'Brummen'],
        [/summ/, 'Summen'],
        [/puls|klopf/, 'Pulsieren / Klopfen'],
        [/zisch/, 'Zischen'],
      ],
    },
    {
      label: 'Tinnitus – Verlauf',
      options: [
        [/kommt und geht|mal da mal weg|zwischendurch/, 'kommt und geht'],
        [/schwank|mal mehr mal weniger|mal lauter/, 'schwankend'],
        [/gleich ?bleibend|konstant|durchgehend|die ganze zeit/, 'gleichbleibend'],
      ],
    },
  ],
  Erschöpfung: [
    {
      label: 'Art der Erschöpfung',
      multi: true,
      options: [
        [/körperlich/, 'körperlich'],
        [/konzentr|im kopf|denken/, 'Kopf / Konzentration'],
        [/schwer(?!e)|schweregefühl|bleiern/, 'Schweregefühl'],
        [/schwach|schwäche/, 'Schwäche'],
      ],
    },
  ],
  'Nase zu': [
    {
      label: 'Nase – welche Seite?',
      options: [
        [/beide|beidseitig/, 'beide'],
        [/wechsel/, 'wechselnd'],
        [/links|linke/, 'links'],
        [/rechts|rechte/, 'rechts'],
      ],
    },
  ],
  Kälteempfinden: [
    {
      label: 'Wo kalt?',
      multi: true,
      options: [
        [/händ|hand/, 'Hände'],
        [/füß|fuß|füße/, 'Füße'],
        [/ganze[nr]? körper|überall/, 'ganzer Körper'],
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Essen, Trinken, Medikamente

const FILLER = new Set(
  (
    'ich hab habe hatte heute gerade eben vorhin grad zum zur zu frühstück frühstücken mittagessen mittag abendessen abend gegessen gefrühstückt ' +
    'getrunken trinke trank esse aß es gab gibt dann noch auch nur morgens mittags abends danach später einen eine ein einem paar genommen eingenommen ' +
    'tablette tabletten mir mich um uhr gegen so also halt jetzt etwa ungefähr was wieder bisher schon'
  ).split(' '),
);

function cleanItem(s: string): string {
  const words = s
    .replace(/\b(?:um|gegen)\s+\S+(?:\s+uhr)?(?:\s+\d+)?/gi, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w.toLocaleLowerCase('de-DE')));
  return words.join(' ').trim();
}

function items(chunks: string[]): string[] {
  return chunks.map(cleanItem).filter((x) => x.length > 1);
}

const cap = (s: string) => s.replace(/^\p{Ll}/u, (c) => c.toLocaleUpperCase('de-DE'));

// ---------------------------------------------------------------------------

export function parseSpeech(input: string): SpeechResult {
  const values: Record<string, FieldValue> = {};
  const events = new Set<string>();
  let wake: string | undefined;
  const text = ` ${input.replace(/[„“"]/g, ' ')} `;
  const multi = (label: string, v: string) => {
    const cur = Array.isArray(values[label]) ? (values[label] as string[]) : [];
    if (!cur.includes(v)) values[label] = [...cur, v];
  };
  const food: string[] = [];
  const drinks: string[] = [];
  const meds: string[] = [];
  const measures: string[] = [];

  const sentences = text.split(/[.!?\n]+/);
  let lastSymptom: string | null = null;
  for (const sentence of sentences) {
    const raw = sentence.split(/,|;|\s+und\s+|\s+aber\s+|\s+außerdem\s+|\s+sonst\s+/i).map((c) => c.trim()).filter(Boolean);
    let pending: string[] = [];
    let lastList: string[] | null = null;
    for (const orig of raw) {
      const c = orig.toLocaleLowerCase('de-DE');
      // --- Listen: Essen, Trinken, Medikamente
      const isFood = /gegessen|gefrühstückt|\besse\b|\baß\b|zum frühstück|zu mittag|zum mittagessen|zu abend|zum abendessen/.test(c);
      const isDrink = /getrunken|\btrinke\b|\btrank\b/.test(c);
      const isMed = /genommen|eingenommen|tablette/.test(c) && !/wärmflasche/.test(c);
      if (isFood || isDrink || isMed) {
        const list = isMed ? meds : isDrink && !isFood ? drinks : food;
        list.push(...items([...pending, orig]));
        pending = [];
        lastList = /^(gegessen|getrunken|genommen|gefrühstückt|zum|zu)\b/.test(c) ? list : null;
        events.add(isMed ? 'Medikament genommen' : isDrink && !isFood ? 'getrunken' : 'gegessen');
        continue;
      }
      if (/wärmflasche|hingelegt|spazier|tee getrunken|massiert|entspann|atemübung/.test(c)) {
        const m = c.match(/wärmflasche|hingelegt|spaziergang|spazieren|massiert|entspannt|atemübung/);
        if (m) measures.push(m[0] === 'spazieren' ? 'Spaziergang' : cap(m[0]));
      }

      if (/abgefallen|runtergefallen/.test(c) && values['Nasenpflaster'] && !/pflaster/.test(c)) {
        values['Nasenpflaster'] = 'ja, aber abgefallen';
        continue;
      }
      if (/pflaster/.test(c)) {
        values['Nasenpflaster'] = /ohne|kein/.test(c) ? 'nein' : /abgefallen|runter|weg|verloren/.test(c) ? 'ja, aber abgefallen' : 'ja, noch drauf';
        continue;
      }
      // --- Aufstehen, Schlaf, Wecker, Handy
      if (/aufgestanden|aufgewacht|wach geworden|aufstehen|raus aus dem bett/.test(c)) {
        const t = findClock(c);
        if (t && /aufgewacht|wach geworden|aufgestanden/.test(c)) wake = t;
        if (/aufgestanden|aufgewacht|wach geworden/.test(c)) events.add('aufgestanden');
        if (/sofort|gleich|direkt/.test(c)) values['Gleich aufgestanden?'] = 'ja, sofort';
        else if (/schlummer|snooze|noch.*liegen|liegen (?:ge)?blieben|länger liegen|im bett geblieben/.test(c)) values['Gleich aufgestanden?'] = /schlummer|snooze/.test(c) ? 'nach Schlummern' : 'blieb länger liegen';
        lastList = null;
        continue;
      }
      if (/schlummer|snooze/.test(c)) values['Gleich aufgestanden?'] = 'nach Schlummern';
      if (/geschlafen|schlaf\b|nacht war/.test(c)) {
        const q = /sehr schlecht|kaum|miserabel|furchtbar|katastrophal|gar nicht/.test(c)
          ? 1
          : /sehr gut|super|toll|wunderbar|richtig gut|perfekt/.test(c)
            ? 5
            : /nicht so gut|nicht gut|schlecht|unruhig|oft aufgewacht/.test(c)
              ? 2
              : /\bgut\b/.test(c)
                ? 4
                : /okay|ok\b|geht so|mittel|mittelmäßig|passabel/.test(c)
                  ? 3
                  : null;
        if (q !== null) values['Schlafqualität'] = q;
        lastList = null;
        continue;
      }
      if (/wecker/.test(c)) {
        const t = findClock(c);
        if (t) values['Wecker gestellt auf'] = t;
        continue;
      }
      if (/handy|telefon/.test(c) && /weg|aus|beiseite/.test(c)) {
        const t = findClock(c);
        if (t) {
          const [h, m] = t.split(':').map(Number);
          values['Handy weggelegt um'] = h >= 6 && h <= 11 ? hhmm(h + 12, m)! : t;
        }
        continue;
      }
      if (/schlafen gehe|ins bett|gehe schlafen|schlafen gegangen/.test(c)) events.add('schlafen gegangen');

      // --- Nacht & Nase
      const times = (x: string) => (/drei ?mal|dreimal|öfter|oft|mehrmals|vier|fünf/.test(x) ? '3× oder öfter' : /zwei ?mal|zweimal|2 ?mal|2x/.test(x) ? '2×' : /ein ?mal|einmal|1 ?mal|1x/.test(x) ? '1×' : null);
      if (/klo|toilette|pinkeln|pipi|wc/.test(c) && /nacht|nachts/.test(sentence.toLocaleLowerCase("de-DE"))) {
        values['Nachts aufs Klo'] = /nicht|kein|nie/.test(c) ? 'nein' : (times(c) ?? '1×');
        continue;
      }
      if (/nachts|in der nacht/.test(c) && /aufgewacht|wach geworden|wach gelegen/.test(c)) {
        values['Nachts aufgewacht'] = /nicht|durchgeschlafen/.test(c) ? 'durchgeschlafen' : (times(c) ?? '1×');
        continue;
      }
      if (/durchgeschlafen/.test(c)) values['Nachts aufgewacht'] = 'durchgeschlafen';
      if (/nasenbluten/.test(c)) values['Blut im Rachen / Nasenbluten'] = /kein|nicht/.test(c) ? 'nein' : 'Nasenbluten';
      else if (/blut/.test(c) && /rachen|hals|speichel|spucke|mund|geschluckt/.test(c)) values['Blut im Rachen / Nasenbluten'] = /kein|nicht/.test(c) ? 'nein' : 'etwas Blut im Rachen / Speichel';

      // --- Beschwerden
      let found = false;
      for (const s of SYMPTOMS) {
        if (!s.re.test(c) || s.not?.test(c)) continue;
        if (s.label === 'Übelkeit' && /würg/.test(c) && !/übel/.test(c)) continue;
        if (s.label === 'Bauchschmerz' && /\bnach dem essen\b/.test(c) && !/bauch|magen/.test(c.replace('nach dem essen', ''))) continue;
        const v = intensity(c) ?? (typeof values[s.label] === 'number' ? (values[s.label] as number) : 2);
        values[s.label] = v;
        found = true;
        lastSymptom = s.label;
      }
      // Details zur zuletzt genannten Beschwerde – auch im nächsten Satzteil („es ist krampfartig“).
      const targets = found ? Object.keys(DETAILS).filter((k) => values[k] !== undefined && SYMPTOMS.find((x) => x.label === k)!.re.test(c)) : lastSymptom ? [lastSymptom] : [];
      for (const k of targets) {
        if ((values[k] as number) === 0) continue;
        for (const d of DETAILS[k] ?? []) {
          for (const [re, opt] of d.options) {
            if (!re.test(c)) continue;
            if (d.multi) multi(d.label, opt);
            else values[d.label] = opt;
            if (!d.multi) break;
          }
        }
      }
      // Schläfe ohne Seite → beide
      if (targets.includes('Kopfschmerz') && /schläfe/.test(c) && !/rechts|links|rechte|linke/.test(c)) {
        multi('Kopf – wo?', 'schlaefe-r');
        multi('Kopf – wo?', 'schlaefe-l');
      }
      if (!found && lastList && !/\b(ist|war|bin|habe|hab|tut|fühl)\b/.test(c)) {
        lastList.push(...items([orig]));
        continue;
      }
      if (!found) pending = [orig];
      else pending = [];
    }
  }

  const join = (xs: string[]) => [...new Set(xs.map(cap))].join(', ');
  if (food.length) values['Was gegessen?'] = join(food);
  if (drinks.length) values['Was getrunken?'] = join(drinks);
  if (meds.length) values['Medikamente'] = join(meds);
  if (measures.length) values['Maßnahmen'] = join(measures);
  if (wake) events.add('aufgestanden');
  return { values, wake, events: [...events] };
}
