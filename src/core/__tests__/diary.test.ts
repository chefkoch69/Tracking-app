import { describe, expect, it } from 'vitest';
import { TEMPLATES, trackerFromTemplate } from '../fields/templates';
import { entryStory } from '../diary/story';
import { weekReview } from '../diary/week';
import { parseHealthText } from '../diary/health';
import type { Entry, FieldValue } from '../model/types';

const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
const id = (l: string) => t.fields.find((f) => f.label === l)!.id;
let n = 0;
const entry = (ts: string, vals: Record<string, FieldValue>): Entry => ({
  id: `e${n++}`, trackerId: t.id, timestamp: new Date(ts).toISOString(),
  values: Object.fromEntries(Object.entries(vals).map(([l, v]) => [id(l), v])),
});

describe('Eintrag als lesbare Zeile', () => {
  it('Essen mit Getränk als Titel', () => {
    const s = entryStory(t, entry('2026-11-24T08:00', { 'Was ist passiert?': ['gegessen'], 'Was gegessen?': 'Apfel, Joghurt', 'Was getrunken?': 'Kaffee' }));
    expect(s.icon).toBe('🍽');
    expect(s.title).toBe('Gegessen: Apfel, Joghurt · Getrunken: Kaffee');
    expect(s.facts).toEqual([]);
  });
  it('Beschwerden mit Details, keine-Angaben getrennt', () => {
    const s = entryStory(t, entry('2026-11-24T14:00', { Bauchschmerz: 2, 'Art der Bauchschmerzen': ['krampfartig'], Übelkeit: 0, Stuhlgang: 3 }));
    expect(s.icon).toBe('🤕');
    expect(s.symptoms[0].label).toBe('Bauchschmerz');
    expect(s.symptoms[0].details).toEqual(['krampfartig']);
    expect(s.none).toEqual(['Übelkeit']);
    expect(s.facts[0]).toMatch(/^Stuhlgang: 3/);
  });
  it('Aufgestanden mit Schlaf', () => {
    const s = entryStory(t, entry('2026-11-24T06:30', { 'Was ist passiert?': ['aufgestanden'], Schlafqualität: 4 }));
    expect(s.title).toBe('Aufgestanden');
    expect(s.facts[0]).toMatch(/^Schlaf: 4/);
  });
});

describe('Wochenrückblick', () => {
  it('vergleicht mit denselben Tagen der Vorwoche', () => {
    const es = [
      entry('2026-11-16T10:00', { Bauchschmerz: 2 }),
      entry('2026-11-17T10:00', { Bauchschmerz: 3 }),
      entry('2026-11-18T10:00', { Bauchschmerz: 1 }),
      entry('2026-11-23T10:00', { Bauchschmerz: 1 }),
      entry('2026-11-24T10:00', { Bauchschmerz: 0 }),
      entry('2026-11-25T10:00', { Kopfschmerz: 2 }),
    ];
    const r = weekReview([t], es, new Date('2026-11-25T18:00'), { '2026-11-23': { mood: 2 }, '2026-11-24': { mood: 4 } });
    expect(r.from).toBe('2026-11-23');
    expect(r.span).toBe(3);
    expect(r.logged).toBe(3);
    const belly = r.symptoms.find((s) => s.label === 'Bauchschmerz')!;
    expect([belly.days, belly.prevDays, belly.direction]).toEqual([1, 3, 'better']);
    expect(r.symptoms.find((s) => s.label === 'Kopfschmerz')!.direction).toBe('worse');
    expect(r.mood).toBe(3);
    expect(r.best).toBe('2026-11-24');
  });
});

describe('Kurzbefehl: Datumsformate vom iPhone', () => {
  it('liest die Aufwachzeit aus deutschen Datumsangaben', () => {
    for (const w of ['25.11.2026, 06:42', '25.11.26, 06:42', '25. Nov. 2026 um 06:42', '06:42', '6.42'])
      expect(parseHealthText(JSON.stringify({ wake: w }))[0].wake).toBe('06:42');
  });
});

import { correctText } from '../diary/autocorrect';
describe('Einträge ausbessern', () => {
  it('korrigiert Diktier- und Tippfehler', () => {
    expect(correctText('Brathuhn, Mod Kartoffeln')).toBe('Brathuhn mit Kartoffeln');
    expect(correctText('brathuhn mod kartofeln')).toBe('Brathuhn mit Kartoffeln');
    expect(correctText('Brathuhn MOT Kartoffeln')).toBe('Brathuhn mit Kartoffeln');
    expect(correctText('2 scheiben brot mit kaese unt marmelade')).toBe('2 Scheiben Brot mit Käse und Marmelade');
    expect(correctText('kafee, 0,5 l wasser')).toBe('Kaffee, 0,5 l Wasser');
    expect(correctText('ibuprofen 400 mg')).toBe('Ibuprofen 400 mg');
  });
  it('lässt Richtiges und Unbekanntes in Ruhe', () => {
    expect(correctText('Reis mit Eis')).toBe('Reis mit Eis');
    expect(correctText('Omas Spezialauflauf')).toBe('Omas Spezialauflauf');
    expect(correctText('Linsensuppe, Tee')).toBe('Linsensuppe, Tee');
  });
});

import { checkinForHour, dayCheckins } from '../diary/moments';
describe('Drei feste Einträge pro Tag', () => {
  it('findet Morgen, Mittag und Abend am Ereignis', () => {
    const es = [
      entry('2026-11-26T06:40', { 'Was ist passiert?': ['aufgestanden'], 'Nase zu': 2 }),
      entry('2026-11-26T09:00', { 'Was gegessen?': 'Brot' }),
      entry('2026-11-26T13:00', { 'Was ist passiert?': ['Mittags-Check'], Bauchschmerz: 1 }),
    ];
    const c = dayCheckins(t, es, '2026-11-26');
    expect(c.morning?.id).toBe(es[0].id);
    expect(c.midday?.id).toBe(es[2].id);
    expect(c.evening).toBeUndefined();
    expect([checkinForHour(7), checkinForHour(13), checkinForHour(21)]).toEqual(['morning', 'midday', 'evening']);
  });
});

import { entryDay } from '../model/dates';
describe('Tagebuch-Tag bis 4 Uhr früh', () => {
  it('Einträge nach Mitternacht gehören zum Vortag', () => {
    expect(entryDay(new Date('2026-11-27T00:46').toISOString())).toBe('2026-11-26');
    expect(entryDay(new Date('2026-11-27T03:59').toISOString())).toBe('2026-11-26');
    expect(entryDay(new Date('2026-11-27T04:00').toISOString())).toBe('2026-11-27');
    const late = entry('2026-11-27T00:46', { 'Was ist passiert?': ['schlafen gegangen'] });
    expect(dayCheckins(t, [late], '2026-11-26').evening?.id).toBe(late.id);
  });
});
