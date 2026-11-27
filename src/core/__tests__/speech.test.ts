import { describe, expect, it } from 'vitest';
import { findClock, parseSpeech } from '../diary/speech';

describe('Erzählen auswerten', () => {
  it('Uhrzeiten', () => {
    expect(findClock('um halb acht aufgewacht')).toBe('07:30');
    expect(findClock('um 7 uhr 20')).toBe('07:20');
    expect(findClock('viertel nach sieben')).toBe('07:15');
    expect(findClock('um 6:45')).toBe('06:45');
  });
  it('Morgen', () => {
    const r = parseSpeech('Ich bin um halb acht aufgewacht und gleich aufgestanden. Wecker war auf 7 Uhr. Ich habe schlecht geschlafen.');
    expect(r.wake).toBe('07:30');
    expect(r.values['Gleich aufgestanden?']).toBe('ja, sofort');
    expect(r.values['Wecker gestellt auf']).toBe('07:00');
    expect(r.values['Schlafqualität']).toBe(2);
    expect(r.events).toContain('aufgestanden');
  });
  it('Beschwerden mit Stärke und Details', () => {
    const r = parseSpeech('Ich habe starke Bauchschmerzen, krampfartig im Unterbauch links, nach dem Essen. Kopf ist gut. Leichter Tinnitus links, eher ein Pfeifen. Ein bisschen müde.');
    expect(r.values['Bauchschmerz']).toBe(3);
    expect(r.values['Art der Bauchschmerzen']).toEqual(['krampfartig']);
    expect(r.values['Lokalisation']).toEqual(['5']);
    expect(r.values['Bezug zu Mahlzeiten']).toBe('nach der Mahlzeit');
    expect(r.values['Kopfschmerz']).toBe(0);
    expect(r.values['Tinnitus']).toBe(1);
    expect(r.values['Tinnitus – Ohr']).toBe('links');
    expect(r.values['Tinnitus – Klang']).toEqual(['Pfeifen']);
    expect(r.values['Müdigkeit']).toBe(0.5);
  });
  it('Keine Beschwerden', () => {
    const r = parseSpeech('Keine Übelkeit, kein Kopfweh.');
    expect(r.values['Übelkeit']).toBe(0);
    expect(r.values['Kopfschmerz']).toBe(0);
  });
  it('Essen, Trinken, Medikamente', () => {
    const r = parseSpeech('Zum Frühstück habe ich zwei Brote mit Käse und ein Ei gegessen und einen Kaffee getrunken. Dann habe ich eine Ibuprofen genommen.');
    expect(r.values['Was gegessen?']).toBe('Zwei Brote mit Käse, Ei');
    expect(r.values['Was getrunken?']).toBe('Kaffee');
    expect(r.values['Medikamente']).toBe('Ibuprofen');
    expect(r.events).toEqual(expect.arrayContaining(['gegessen', 'getrunken', 'Medikament genommen']));
  });
  it('Abend', () => {
    const r = parseSpeech('Handy habe ich um 11 weggelegt, mir ist kalt an den Füßen, ziemlich erschöpft.');
    expect(r.values['Handy weggelegt um']).toBe('23:00');
    expect(r.values['Kälteempfinden']).toBe(2);
    expect(r.values['Wo kalt?']).toEqual(['Füße']);
    expect(r.values['Erschöpfung']).toBe(2);
  });
});

describe('Nacht & Nase', () => {
  it('versteht Nase, Mund, Pflaster, Klo und Blut', () => {
    const r = parseSpeech('Mit Nasenpflaster geschlafen, aber es ist abgefallen. Die Nase war links ziemlich zu. Mund total trocken. In der Nacht zweimal aufs Klo. Etwas Blut im Rachen.');
    expect(r.values['Nasenpflaster']).toBe('ja, aber abgefallen');
    expect(r.values['Nase zu']).toBe(2);
    expect(r.values['Nase – welche Seite?']).toBe('links');
    expect(r.values['Mund trocken']).toBe(3);
    expect(r.values['Nachts aufs Klo']).toBe('2×');
    expect(r.values['Blut im Rachen / Nasenbluten']).toBe('etwas Blut im Rachen / Speichel');
  });
});

describe('Bauch pulsierend', () => {
  it('erkennt pulsierende Bauchschmerzen', () => {
    expect(parseSpeech('Bauchweh mittel, pulsierend').values['Art der Bauchschmerzen']).toEqual(['pulsierend']);
  });
});
