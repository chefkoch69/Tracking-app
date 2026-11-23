import { describe, expect, it } from 'vitest';
import {
  averageGapMinutes,
  bucketize,
  consistencyScore,
  consistencySeries,
  symptomTrend,
  timeDistribution,
  currentStreak,
  fieldStats,
  frequencies,
  longestStreak,
  pairMetrics,
  pearson,
  series,
} from './analytics';
import { atMinutes, weekKey } from './dates';
import { cloudDiff, fromCloud, sameData, stableStringify, toCloud } from './cloudModel';
import { dayColumns, dayValue, reportText, symptomSummary } from './report';
import { generateDemo } from './demo';
import { formatShort, formatValue, itemName, listItems, rangeMinutes, scaleLevels, severity, validateValues, withLevels } from './fieldTypes';
import { applyUpgrades, hasUpgrades, mergeTrackers, optionRenames, setupState, templateUpgrades } from './trackerEdit';
import { interpretNarrative, narrativePrompt } from './narrative';
import { reducer } from '../state/store';
import { computeInsights, factorInsights, trendInsights } from './insights';
import { healthAsTracker, minutesSinceWake, parseHealthText, sinceWakeDistribution } from './health';
import { daySlotStatus, dueSlot, nextSlot, reminderToFire, slotKey, slotMinutesForDay } from './schedule';
import { exportCsv, normalize } from './storage';
import { TEMPLATES, makeField, trackerFromTemplate } from './templates';
import type { Entry, FieldValue, Tracker } from './types';

const day = new Date(2026, 10, 23); // Montag, 23.11.2026
const at = (h: number, m = 0, d = day) => atMinutes(d, h * 60 + m);
let n = 0;
const entry = (t: Tracker, when: Date, values: Record<string, FieldValue> = {}): Entry => ({
  id: `e${n++}`,
  trackerId: t.id,
  timestamp: when.toISOString(),
  values,
});

function morning(): Tracker {
  return trackerFromTemplate(TEMPLATES.find((t) => t.key === 'morning')!);
}

describe('Feldtypen', () => {
  it('validiert Pflichtfelder und Bereiche generisch', () => {
    const count = makeField('number', 'Anzahl', { min: 0 }, true);
    const scale = makeField('scale', 'Übelkeit', { min: 0, max: 3 });
    const sel = makeField('select', 'Mahlzeit', { options: ['A', 'B'] });
    expect(validateValues([count, scale, sel], {})).toEqual({ [count.id]: 'Pflichtfeld.' });
    const errs = validateValues([count, scale, sel], { [count.id]: -1, [scale.id]: 5, [sel.id]: 'C' });
    expect(Object.keys(errs)).toHaveLength(3);
    expect(validateValues([count, scale, sel], { [count.id]: 20, [scale.id]: 2, [sel.id]: 'A' })).toEqual({});
  });

  it('formatiert Werte mit Einheit und Skalenbeschriftung', () => {
    const temp = makeField('measurement', 'Temp', { unit: '°C' });
    const scale = makeField('scale', 'S', { min: 0, max: 3, scaleLabels: ['keine', 'leicht', 'mittel', 'stark'] });
    expect(formatValue(temp, 21.5)).toBe('21,5 °C');
    expect(formatValue(scale, 2)).toBe('2 (mittel)');
    expect(formatValue(makeField('checkbox', 'C'), true)).toBe('Ja');
  });
});

describe('Zeitplan & Erinnerungen', () => {
  it('erzeugt Slots für feste Zeiten, Intervalle und Wochentage', () => {
    const t = morning();
    expect(slotMinutesForDay(t.schedule, day)).toEqual([6 * 60 + 45]);
    const interval = { ...t.schedule, mode: 'interval' as const, intervalMinutes: 180, intervalStart: '09:00', intervalEnd: '21:00' };
    expect(slotMinutesForDay(interval, day)).toEqual([540, 720, 900, 1080, 1260]);
    expect(slotMinutesForDay({ ...t.schedule, weekdays: [0] }, day)).toEqual([]); // Montag nicht aktiv
    expect(slotMinutesForDay({ ...t.schedule, mode: 'manual' }, day)).toEqual([]);
  });

  it('erkennt fällige und erledigte Slots', () => {
    const t = morning();
    expect(dueSlot(t, [], at(6, 30))).toBeNull(); // noch nicht fällig
    expect(dueSlot(t, [], at(7, 0))?.slot).toEqual(at(6, 45));
    // Eintrag kurz vor dem Slot zählt als erledigt
    const e = entry(t, at(6, 20));
    expect(dueSlot(t, [e], at(7, 0))).toBeNull();
    expect(daySlotStatus(t, [e], day)[0].done).toBe(true);
  });

  it('Tagebuch-Erinnerung am Abend gilt durch einen Eintrag am selben Tag als erledigt', () => {
    const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'abdominal')!); // 20:00
    expect(dueSlot(t, [entry(t, at(15, 0))], at(20, 5))).toBeNull();
    expect(dueSlot(t, [], at(20, 5))).not.toBeNull();
    // Morgen-Check-in mit zwei Slots: zweiter Slot verlangt eigenen Eintrag
    const m = { ...morning(), schedule: { ...morning().schedule, times: ['06:45', '18:00'] } };
    expect(dueSlot(m, [entry(m, at(7, 0))], at(18, 5))).not.toBeNull();
  });

  it('wiederholt die Erinnerung nach 10 Minuten bis maxRepeats', () => {
    const t = morning(); // 06:45, alle 10 Min, max. 3
    const r1 = reminderToFire(t, [], undefined, at(6, 46));
    expect(r1?.attempt).toBe(0);
    expect(reminderToFire(t, [], { lastFiredKey: r1!.key }, at(6, 50))).toBeNull();
    const r2 = reminderToFire(t, [], { lastFiredKey: r1!.key }, at(6, 56));
    expect(r2?.attempt).toBe(1);
    const r4 = reminderToFire(t, [], { lastFiredKey: r2!.key }, at(7, 40));
    expect(r4?.attempt).toBe(3);
    expect(reminderToFire(t, [], { lastFiredKey: r4!.key }, at(8, 30))).toBeNull(); // Limit erreicht
    // Nach dem Eintrag keine Erinnerung mehr
    expect(reminderToFire(t, [entry(t, at(7, 0))], undefined, at(7, 5))).toBeNull();
  });

  it('respektiert Schlummern und Überspringen', () => {
    const t = morning();
    const slot = slotKey(at(6, 45));
    const until = at(7, 10).toISOString();
    expect(reminderToFire(t, [], { snooze: { slot, until } }, at(7, 0))).toBeNull();
    const after = reminderToFire(t, [], { snooze: { slot, until }, lastFiredKey: `${slot}#1` }, at(7, 11));
    expect(after?.key).toContain('snooze');
    expect(reminderToFire(t, [], { snooze: { slot, until }, lastFiredKey: after!.key }, at(7, 12))).toBeNull();
    expect(reminderToFire(t, [], { skippedSlot: slot }, at(7, 0))).toBeNull();
  });

  it('findet die nächste Erinnerung', () => {
    const t = morning();
    expect(nextSlot(t, at(7, 0))).toEqual(atMinutes(new Date(2026, 10, 24), 6 * 60 + 45));
  });
});

describe('Auswertungen', () => {
  const pushups = trackerFromTemplate(TEMPLATES.find((t) => t.key === 'pushups')!);
  const count = pushups.fields[0];
  const d = (offset: number) => new Date(2026, 10, 23 + offset);
  const es = [
    entry(pushups, at(8, 0, d(-2)), { [count.id]: 10 }),
    entry(pushups, at(18, 0, d(-2)), { [count.id]: 15 }),
    entry(pushups, at(8, 0, d(-1)), { [count.id]: 30 }),
    entry(pushups, at(8, 0, d(0)), { [count.id]: 20 }),
  ];

  it('fasst Werte pro Tag/Woche zusammen', () => {
    const days = bucketize(series(count, es), 'day', 'sum');
    expect(days.map((b) => b.v)).toEqual([25, 30, 20]);
    expect(weekKey(day)).toBe('2026-W48');
    expect(bucketize(series(count, es), 'week', 'sum')).toEqual([
      { key: '2026-W47', v: 55, n: 3 },
      { key: '2026-W48', v: 20, n: 1 },
    ]);
  });

  it('berechnet Rekorde und Serien', () => {
    const s = fieldStats(count, es, at(20));
    expect(s.sum).toBe(75);
    expect(s.bestEntry?.v).toBe(30);
    expect(s.bestDay).toEqual({ key: '2026-11-22', v: 30 });
    expect(currentStreak(es, at(20))).toBe(3);
    expect(currentStreak(es.slice(0, 3), at(20))).toBe(2); // heute noch offen
    expect(longestStreak(es)).toBe(3);
  });

  it('zählt Kategorien case-insensitiv', () => {
    const food = makeField('text', 'Lebensmittel');
    const t = { ...pushups, fields: [food] };
    const f = frequencies(food, [
      entry(t, at(8), { [food.id]: 'Brot' }),
      entry(t, at(9), { [food.id]: 'brot ' }),
      entry(t, at(10), { [food.id]: 'Apfel' }),
    ]);
    expect(f).toEqual([
      { label: 'Brot', count: 2 },
      { label: 'Apfel', count: 1 },
    ]);
  });

  it('korreliert Messgrößen im selben und über Tracker hinweg', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 2], [1, 2])).toBeNull();

    const demo = generateDemo(60, at(12));
    const [m, p] = demo.trackers;
    const id = (l: string) => m.fields.find((f) => f.label === l)!.id;
    // gleicher Tracker, je Eintrag: wärmer → weniger Kälteempfinden
    const same = pairMetrics(demo.trackers, demo.entries, { trackerId: m.id, fieldId: id('Raumtemperatur') }, { trackerId: m.id, fieldId: id('Kälteempfinden') });
    expect(same.basis).toBe('entry');
    expect(pearson(same.pairs.map((x) => x.x), same.pairs.map((x) => x.y))!).toBeLessThan(-0.3);
    // über Tracker hinweg, je Tag: Schlaf (Health) ↔ Erschöpfung
    const h = healthAsTracker(demo.health)!;
    const cross = pairMetrics([...demo.trackers, h.tracker], [...demo.entries, ...h.entries], { trackerId: h.tracker.id, fieldId: 'health-sleep' }, { trackerId: m.id, fieldId: id('Erschöpfung') });
    expect(cross.basis).toBe('day');
    expect(pearson(cross.pairs.map((x) => x.x), cross.pairs.map((x) => x.y))!).toBeLessThan(-0.3);
    expect(pairMetrics(demo.trackers, demo.entries, { trackerId: m.id, fieldId: id('Raumtemperatur') }, { trackerId: p.id, fieldId: p.fields[0].id }).pairs.length).toBeGreaterThan(10);
  });
});

describe('Speicherung', () => {
  it('normalisiert Importe und verwirft verwaiste Einträge', () => {
    const t = morning();
    const data = normalize({ trackers: [{ id: t.id, name: 'X', fields: t.fields }], entries: [entry(t, at(7)), { id: 'z', trackerId: 'gibts-nicht', timestamp: 'x', values: {} }] });
    expect(data.trackers[0].schedule.mode).toBe('manual');
    expect(data.entries).toHaveLength(1);
    expect(() => normalize({ foo: 1 })).toThrow();
  });

  it('exportiert CSV mit deutschem Dezimaltrennzeichen', () => {
    const t = morning();
    const temp = t.fields.find((f) => f.label === 'Raumtemperatur')!;
    const csv = exportCsv(t, [entry(t, at(7), { [temp.id]: 19.5 })]);
    expect(csv).toContain('Raumtemperatur (°C)');
    expect(csv).toContain('19,5');
  });
});

describe('Vorlagen', () => {
  it('bestehen ausschließlich aus generischen Bausteinen', () => {
    for (const tpl of TEMPLATES) {
      const t = trackerFromTemplate(tpl);
      expect(t.fields.length).toBeGreaterThan(0);
      expect(new Set(t.fields.map((f) => f.id)).size).toBe(t.fields.length);
    }
  });
});

describe('Neue Bausteine', () => {
  it('Zeitraum: Dauer auch über Mitternacht', () => {
    const f = makeField('timerange', 'Dauer');
    expect(rangeMinutes({ from: '10:15', to: '11:30' })).toBe(75);
    expect(rangeMinutes({ from: '23:30', to: '00:15' })).toBe(45);
    expect(formatValue(f, { from: '10:15', to: '11:30' })).toBe('10:15–11:30 (1 h 15 min)');
    expect(validateValues([f], { [f.id]: { from: '10:00', to: '' } })[f.id]).toBeTruthy();
    expect(validateValues([f], { [f.id]: { from: '', to: '' } })).toEqual({});
  });

  it('Körperkarte: validiert Regionen und liefert Kategorien', () => {
    const f = makeField('bodymap', 'Lokalisation', { bodyMap: 'abdomen' });
    expect(validateValues([f], { [f.id]: ['1', '6'] })).toEqual({});
    expect(validateValues([f], { [f.id]: ['99'] })[f.id]).toBeTruthy();
    expect(formatValue(f, ['1', '6'])).toBe('Oberbauch Mitte, Nabelregion');
    expect(formatShort(f, ['1', '6'])).toBe('1, 6');
  });

  it('Schweregrad berücksichtigt die Polarität', () => {
    const pain = makeField('scale', 'Schmerz', { min: 0, max: 3 });
    const sleep = makeField('scale', 'Schlaf', { min: 0, max: 3, polarity: 'higher-better' });
    expect(severity(pain, 3)).toBe(1);
    expect(severity(sleep, 3)).toBe(0);
    expect(severity(makeField('measurement', 'Temp'), 20)).toBeNull();
  });
});

describe('Erkenntnisse', () => {
  const now = at(21);
  const demo = generateDemo(60, now);
  const [belly] = demo.trackers;

  it('erkennt die Verbesserung der letzten zwei Wochen', () => {
    const t = trendInsights(belly, demo.entries, now).find((i) => i.title.startsWith('Bauchschmerz'));
    expect(t?.tone).toBe('good');
  });

  it('findet Einflussfaktoren (Mahlzeit, Medikament)', () => {
    const f = factorInsights(belly, demo.entries);
    expect(f.some((i) => i.title.includes('nach der Mahlzeit') && i.tone === 'bad')).toBe(true);
    expect(f.some((i) => i.title.includes('Buscopan') && i.tone === 'good')).toBe(true);
  });

  it('liefert eine begrenzte, sortierte Liste', () => {
    const all = computeInsights(demo.trackers, demo.entries, now);
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].strength).toBeGreaterThanOrEqual(all[i].strength);
  });
});

describe('Regelmäßigkeit & Zeitverteilung', () => {
  const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'reading')!); // täglich 21:00
  const d = (o: number) => new Date(2026, 10, 23 + o);

  it('steigt mit erledigten Tagen und sinkt nur langsam bei einer Lücke', () => {
    const es = Array.from({ length: 30 }, (_, i) => entry(t, at(20, 0, d(-30 + i))));
    const full = consistencyScore(t, es, at(23, 0, d(-1)))!;
    expect(full).toBeGreaterThan(0.7);
    const gap = consistencyScore(t, es.filter((_, i) => i !== 28), at(23, 0, d(-1)))!;
    expect(gap).toBeLessThan(full);
    expect(full - gap).toBeLessThan(0.1); // eine Lücke wirft nicht alles zurück
    const series = consistencySeries(t, es, at(23, 0, d(-1)));
    expect(series[series.length - 1].v).toBeGreaterThan(series[5].v);
  });

  it('zählt heute erst nach dem fälligen Slot', () => {
    const es = Array.from({ length: 10 }, (_, i) => entry(t, at(20, 0, d(-10 + i))));
    const before = consistencySeries(t, es, at(12, 0));
    expect(before[before.length - 1].key).toBe('2026-11-22');
  });

  it('verteilt Einträge nach Stunde und Wochentag, optional gewichtet', () => {
    const pain = makeField('scale', 'Schmerz', { min: 0, max: 3 });
    const tt = { ...t, fields: [pain] };
    const es = [entry(tt, at(14, 10), { [pain.id]: 3 }), entry(tt, at(14, 50), { [pain.id]: 1 }), entry(tt, at(9, 0, d(-1)), { [pain.id]: 2 })];
    const plain = timeDistribution(es);
    expect(plain.byHour[14]).toBe(2);
    expect(plain.byWeekday[0]).toBe(2); // Montag
    expect(plain.byWeekday[6]).toBe(1); // Sonntag
    expect(timeDistribution(es, pain).byHour[14]).toBe(4);
    expect(averageGapMinutes(es)).toBeCloseTo((24 * 60 + 5 * 60 + 50) / 2);
  });
});

describe('Gesundheitsdaten & seit dem Aufstehen', () => {
  it('liest JSON aus einem Kurzbefehl (auch mit Präfix, Minuten und deutschen Zahlen)', () => {
    const [d] = parseHealthText('BYOT-HEALTH {"date":"2026-11-23","wake":"6:42","sleep":"450","steps":"4.512","ruhepuls":"58"}');
    expect(d).toEqual({ date: '2026-11-23', wake: '06:42', sleepHours: 7.5, steps: 4512, restingHr: 58, source: 'health' });
  });

  it('liest Zeilenformat und ISO-Zeitpunkte, Datum fällt auf heute zurück', () => {
    const [d] = parseHealthText('Aufgestanden: 2026-11-23T06:05:00\nSchritte 3200\nSchlaf: 6,5', '2026-11-23');
    expect(d.wake).toBe('06:05');
    expect(d.steps).toBe(3200);
    expect(d.sleepHours).toBe(6.5);
    expect(d.date).toBe('2026-11-23');
    expect(parseHealthText('hallo welt')).toEqual([]);
  });

  it('rechnet Minuten seit dem Aufstehen und verteilt Einträge danach', () => {
    const health = { '2026-11-23': { date: '2026-11-23', wake: '06:30', source: 'manual' as const } };
    expect(minutesSinceWake(health, at(9, 0))).toBe(150);
    expect(minutesSinceWake(health, at(6, 0))).toBeNull();
    expect(minutesSinceWake(health, at(9, 0, new Date(2026, 10, 22)))).toBeNull();
    const t = morning();
    const dist = sinceWakeDistribution([entry(t, at(9, 0)), entry(t, at(9, 20)), entry(t, at(13, 0))], health);
    expect(dist.hours[2]).toBe(2);
    expect(dist.hours[6]).toBe(1);
  });

  it('macht Health-Werte für Vergleiche nutzbar (virtueller Tracker)', () => {
    const demo = generateDemo(60, at(21));
    const h = healthAsTracker(demo.health)!;
    expect(h.tracker.fields.map((f) => f.label)).toContain('Schlafdauer');
    const [belly] = demo.trackers;
    const pain = belly.fields.find((f) => f.label === 'Bauchschmerz')!;
    const pairs = pairMetrics([belly, h.tracker], [...demo.entries, ...h.entries], { trackerId: h.tracker.id, fieldId: 'health-sleep' }, { trackerId: belly.id, fieldId: pain.id });
    expect(pairs.basis).toBe('day');
    expect(pairs.pairs.length).toBeGreaterThan(15);
  });
});

describe('Baukasten: freie Skalenstufen & Umbenennen', () => {
  it('Übelkeit hat die Zwischenstufe 0,5 „sehr leicht“', () => {
    const belly = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'abdominal')!);
    const n = belly.fields.find((f) => f.label === 'Übelkeit')!;
    expect(scaleLevels(n.config).map((l) => l.value)).toEqual([0, 0.5, 1, 2, 3]);
    expect(formatValue(n, 0.5)).toBe('0,5 (sehr leicht)');
    expect(validateValues([n], { [n.id]: 0.5 })).toEqual({});
    expect(validateValues([n], { [n.id]: 1.5 })[n.id]).toBeTruthy();
    expect(severity(n, 0.5)).toBeCloseTo(1 / 6);
    const meal = belly.fields.find((f) => f.label === 'Bezug zu Mahlzeiten')!;
    expect(meal.config.options![0]).toBe('vor der Mahlzeit (noch nichts gegessen)');
  });

  it('ältere Skalen ohne Stufenliste funktionieren weiter', () => {
    const old = makeField('scale', 'Alt', { min: 1, max: 5, scaleLabels: ['a', 'b', 'c', 'd', 'e'] });
    expect(scaleLevels(old.config).map((l) => `${l.value}${l.label}`)).toEqual(['1a', '2b', '3c', '4d', '5e']);
    expect(withLevels([{ value: 2, label: 'x' }, { value: 0, label: 'y' }])).toMatchObject({ min: 0, max: 2 });
  });

  it('erkennt umbenannte Optionen und zieht Einträge mit', () => {
    const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'abdominal')!);
    const meal = t.fields.find((f) => f.label === 'Bezug zu Mahlzeiten')!;
    const renamed = {
      ...t,
      fields: t.fields.map((f) => (f.id === meal.id ? { ...f, config: { ...f.config, options: ['nüchtern', 'während der Mahlzeit', 'nach der Mahlzeit', 'unabhängig'] } } : f)),
    };
    expect(optionRenames(t, renamed)).toEqual([{ fieldId: meal.id, from: 'vor der Mahlzeit (noch nichts gegessen)', to: 'nüchtern' }]);
    // Nur Umsortieren ist keine Umbenennung
    const reordered = { ...t, fields: t.fields.map((f) => (f.id === meal.id ? { ...f, config: { ...f.config, options: [...meal.config.options!].reverse() } } : f)) };
    expect(optionRenames(t, reordered)).toEqual([]);

    const state = { version: 1 as const, trackers: [t], reminders: {}, entries: [entry(t, at(8), { [meal.id]: 'vor der Mahlzeit (noch nichts gegessen)' })] };
    const next = reducer(state, { type: 'entries/renameOption', trackerId: t.id, fieldId: meal.id, from: 'vor der Mahlzeit (noch nichts gegessen)', to: 'nüchtern' });
    expect(next.entries[0].values[meal.id]).toBe('nüchtern');
  });
});

describe('Cloud-Speicher: Abbildung und Abgleich', () => {
  const demo = generateDemo(30, at(21));
  const data = { version: 1 as const, trackers: demo.trackers, entries: demo.entries, reminders: {}, health: demo.health };

  it('bündelt Einträge in Wochen und stellt den Zustand verlustfrei wieder her', () => {
    const { meta, weeks } = toCloud(data);
    expect(weeks.size).toBeGreaterThanOrEqual(4);
    expect(weeks.size).toBeLessThanOrEqual(6);
    const back = fromCloud(meta, [...weeks.values()]);
    expect(back.entries.length).toBe(data.entries.length);
    expect(sameData(back, data)).toBe(true);
  });

  it('schreibt nur geänderte Dokumente', () => {
    const first = cloudDiff(null, data);
    expect(first.meta).not.toBeNull();
    expect(first.write.length).toBe(toCloud(data).weeks.size);
    expect(cloudDiff(data, data)).toEqual({ meta: null, write: [], remove: [] });
    const e = data.entries[data.entries.length - 1];
    const changed = { ...data, entries: data.entries.map((x) => (x.id === e.id ? { ...x, values: { ...x.values, extra: 1 } } : x)) };
    const d = cloudDiff(data, changed);
    expect(d.meta).toBeNull();
    expect(d.write.map((w) => w.week)).toEqual([weekKey(new Date(e.timestamp))]);
    const profileOnly = { ...data, profile: { name: 'Test' } };
    expect(cloudDiff(data, profileOnly).write).toEqual([]);
    expect(cloudDiff(data, profileOnly).meta).not.toBeNull();
  });

  it('löscht leere Wochen und vergleicht unabhängig von der Schlüsselreihenfolge', () => {
    const w = weekKey(new Date(data.entries[0].timestamp));
    const without = { ...data, entries: data.entries.filter((x) => weekKey(new Date(x.timestamp)) !== w) };
    expect(cloudDiff(data, without).remove).toEqual([w]);
    expect(stableStringify({ b: 1, a: { d: 2, c: undefined } })).toBe(stableStringify({ a: { d: 2 }, b: 1 }));
  });
});

describe('Arztbericht', () => {
  const now = at(21);
  const demo = generateDemo(30, now);
  const [belly] = demo.trackers;
  const from = '2026-11-10';
  const to = '2026-11-23';

  it('fasst Tage zusammen (Skala: Tageshöchstwert, Spanne bei mehreren Werten)', () => {
    const pain = belly.fields.find((f) => f.label === 'Bauchschmerz')!;
    const es = [entry(belly, at(9), { [pain.id]: 1 }), entry(belly, at(14), { [pain.id]: 3 })];
    expect(dayValue(pain, es)).toBe('3 (1–3)');
    const cols = dayColumns(belly, es);
    expect(cols).toHaveLength(1);
    expect(cols[0].sub).toBe('2 Einträge');
  });

  it('liefert eine Übersicht je Beschwerde mit Trend', () => {
    const rows = symptomSummary([belly], demo.entries, from, to);
    const pain = rows.find((r) => r.label === 'Bauchschmerz')!;
    expect(pain.daysTracked).toBeGreaterThan(3);
    expect(pain.daysWith).toBeLessThanOrEqual(pain.daysTracked);
    expect(['better', 'worse', 'same', null]).toContain(pain.trend);
  });

  it('erzeugt eine lesbare Textfassung', () => {
    const text = reportText([belly], demo.entries, demo.health, from, to, { name: 'Test Person' });
    expect(text).toContain('Symptomtagebuch 10.11.2026 – 23.11.2026');
    expect(text).toContain('Name: Test Person');
    expect(text).toContain('ÜBERSICHT');
    expect(text).toMatch(/Bauchschmerz \d/);
  });
});

describe('Erzählen: Text → Einträge', () => {
  const quick = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
  const id = (l: string) => quick.fields.find((f) => f.label === l)!.id;
  const now = new Date(2026, 10, 23, 11, 40);

  it('baut einen Auftrag mit Feldern, erlaubten Werten und der aktuellen Zeit', () => {
    const p = narrativePrompt('Ich habe gefrühstückt', [quick], now, { '2026-11-23': { date: '2026-11-23', wake: '06:10', source: 'manual' } });
    expect(p).toContain(id('Übelkeit'));
    expect(p).toContain('0.5=sehr leicht');
    expect(p).toContain('2026-11-23T11:40');
    expect(p).toContain('Heute aufgestanden um 06:10');
    expect(p).toContain('Ich habe gefrühstückt');
  });

  it('übernimmt nur gültige Werte (Beispiel: Frühstück, fertig, Schlaf, jetzt übel und Würgen)', () => {
    const reply = {
      entries: [
        { trackerId: quick.id, time: '2026-11-23T08:30', timeUncertain: true, summary: 'Frühstück nach Termin',
          values: { [id('Was ist passiert?')]: ['gegessen'], [id('Was gegessen?')]: '3 Eier, 3 Scheiben Toast, Käse, Hummus', [id('Notiz')]: 'nach einem Termin in der Früh' } },
        { trackerId: quick.id, time: '2026-11-23T09:15', summary: 'danach sehr fertig', values: { [id('Erschöpfung')]: 3 } },
        { trackerId: quick.id, time: '2026-11-23T09:30', summary: '2 Stunden geschlafen', values: { [id('Was ist passiert?')]: ['geschlafen', 'Mittagsschlaf'] } },
        { trackerId: quick.id, time: '2026-11-23T11:40', summary: 'jetzt übel, würgen',
          values: { [id('Übelkeit')]: 2, [id('Würgen / Brechreiz')]: '2', [id('Müdigkeit')]: 7, unbekannt: 'x' } },
        { trackerId: 'gibt-es-nicht', time: '2026-11-23T11:40', values: { a: 1 } },
        { trackerId: quick.id, time: '2026-11-23T18:00', values: { [id('Bauchschmerz')]: 1 } },
      ],
      wake: '6:05',
      unmapped: ['Termin'],
    };
    const r = interpretNarrative(reply, [quick], now);
    expect(r.proposals).toHaveLength(5);
    const [breakfast, tired, nap, current, future] = r.proposals;
    expect(breakfast.values[id('Was gegessen?')]).toBe('3 Eier, 3 Scheiben Toast, Käse, Hummus');
    expect(breakfast.timeUncertain).toBe(true);
    expect(tired.values[id('Erschöpfung')]).toBe(3);
    expect(nap.values[id('Was ist passiert?')]).toEqual(['geschlafen']); // „Mittagsschlaf“ ist keine Option
    expect(current.values[id('Übelkeit')]).toBe(2);
    expect(current.values[id('Würgen / Brechreiz')]).toBe(2);
    expect(current.values[id('Müdigkeit')]).toBeUndefined(); // 7 gibt es auf der Skala nicht
    expect(current.dropped.join(' ')).toMatch(/Müdigkeit: 7/);
    expect(future.time.getTime()).toBe(now.getTime()); // Zukunft → jetzt, unsicher
    expect(future.timeUncertain).toBe(true);
    expect(r.wake).toBe('06:05');
    expect(r.unmapped).toEqual(['Termin']);
  });

  it('wertet Essens-Listen einzeln und ohne Mengen aus', () => {
    expect(listItems('3 Eier, 3 Scheiben Toast mit Käse und Hummus')).toEqual(['3 Eier', '3 Scheiben Toast mit Käse', 'Hummus']);
    expect(itemName('3 Scheiben Toast')).toBe('Toast');
    expect(itemName('100 g Hummus')).toBe('Hummus');
    expect(itemName('zwei Eier')).toBe('Eier');
    const food = quick.fields.find((f) => f.label === 'Was gegessen?')!;
    const f = frequencies(food, [entry(quick, at(8), { [food.id]: '3 Eier, Hummus' }), entry(quick, at(12), { [food.id]: '2 Eier, 1 Scheibe Brot' })]);
    expect(f[0]).toEqual({ label: 'Eier', count: 2 });
  });

  it('ergänzt neue Vorlagen-Felder in einem bestehenden Check-in, ohne Daten anzufassen', () => {
    const old = { ...quick, fields: quick.fields.filter((f) => f.label !== 'Was gegessen?' && !f.label.startsWith('Würgen')).map((f) => (f.label === 'Was ist passiert?' ? { ...f, config: { ...f.config, options: ['gegessen', 'aufgestanden'] } } : f)) };
    const up = templateUpgrades(old, quick);
    expect(up.fields.map((f) => f.label)).toEqual(['Was gegessen?', 'Würgen / Brechreiz']);
    expect(up.options[0].add).toContain('geschlafen');
    const next = applyUpgrades(old, up, quick);
    expect(next.fields.length).toBe(old.fields.length + 2);
    expect(next.fields.map((f) => f.label)).toEqual(quick.fields.map((f) => f.label)); // an ihrem Platz aus der Vorlage
    expect(applyUpgrades(old, up).fields.at(-1)!.label).toBe('Notiz'); // ohne Vorlage: vor die Notiz
    expect(next.fields.filter((f) => old.fields.some((o) => o.id === f.id)).length).toBe(old.fields.length);
    expect(templateUpgrades(next, quick)).toEqual({ fields: [], options: [] });
  });
});

describe('Ein Tracker für alles: Zusammenführen und Abschnitte', () => {
  it('„Mein Befinden“ enthält Bauch, Kälte und Allgemeines in Abschnitten', () => {
    const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
    expect(t.name).toBe('Mein Befinden');
    expect(t.quick).toBe(true);
    const groups = [...new Set(t.fields.map((f) => f.group))];
    expect(groups).toEqual(['Ereignisse & Essen', 'Bauch & Verdauung', 'Allgemein', 'Kälte', 'Notiz']);
    for (const l of ['Bauchschmerz', 'Lokalisation', 'Kälteempfinden', 'Raumtemperatur', 'Was gegessen?', 'Würgen / Brechreiz']) {
      expect(t.fields.some((f) => f.label === l)).toBe(true);
    }
    expect(TEMPLATES.some((x) => x.key === 'cold')).toBe(false);
  });

  it('führt Tracker zusammen: gleiche Felder werden eins, Einträge wandern mit', () => {
    const me = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
    const belly = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'abdominal')!);
    const painB = belly.fields.find((f) => f.label === 'Bauchschmerz')!;
    const notesB = belly.fields.find((f) => f.label === 'Besonderheiten')!;
    const mealB = belly.fields.find((f) => f.label === 'Bezug zu Mahlzeiten')!;
    const es = [entry(belly, at(14), { [painB.id]: 2, [notesB.id]: 'Stress', [mealB.id]: 'unabhängig' }), entry(me, at(9), {})];
    const { tracker, entries } = mergeTrackers(me, belly, es);
    const painM = me.fields.find((f) => f.label === 'Bauchschmerz')!;
    const moved = entries.find((e) => e.values[painM.id] === 2)!;
    expect(moved.trackerId).toBe(me.id);
    expect(moved.values[me.fields.find((f) => f.label === 'Bezug zu Mahlzeiten')!.id]).toBe('unabhängig');
    // „Besonderheiten“ (Freitext) wandert in die vorhandene Notiz
    expect(tracker.fields.some((f) => f.label === 'Besonderheiten')).toBe(false);
    expect(moved.values[me.fields.find((f) => f.label === 'Notiz')!.id]).toBe('Stress');
    expect(tracker.fields.length).toBe(me.fields.length); // alles Übrige gab es schon
    expect(tracker.fields.filter((f) => f.label === 'Bauchschmerz')).toHaveLength(1);
    expect(tracker.fields.at(-1)!.label).toBe('Notiz');

    const state = { version: 1 as const, trackers: [me, belly], entries: es, reminders: {} };
    const next = reducer(state, { type: 'tracker/merge', sourceId: belly.id, targetId: me.id });
    expect(next.trackers.map((t) => t.id)).toEqual([me.id]);
    expect(next.entries.every((e) => e.trackerId === me.id)).toBe(true);
  });

  it('erweitert einen alten Check-in zu „Mein Befinden“ inkl. Abschnitten', () => {
    const tpl = TEMPLATES.find((x) => x.key === 'now')!.build();
    const old = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
    const legacy = { ...old, name: 'Befinden jetzt', fields: old.fields.filter((f) => ['Was ist passiert?', 'Bauchschmerz', 'Übelkeit', 'Müdigkeit', 'Notiz'].includes(f.label)).map((f) => ({ ...f, group: undefined })) };
    const up = templateUpgrades(legacy, tpl);
    expect(hasUpgrades(up)).toBe(true);
    const next = applyUpgrades(legacy, up, tpl);
    expect(next.fields.map((f) => f.label)).toEqual(tpl.fields.map((f) => f.label));
    expect(next.fields.every((f) => !!f.group)).toBe(true);
    expect(hasUpgrades(templateUpgrades(next, tpl))).toBe(false);
  });
});

describe('Erkenntnisse ohne Selbstverständlichkeiten', () => {
  const now = at(21);
  const demo = generateDemo(60, now);
  const all = computeInsights(demo.trackers, demo.entries, now, 50);
  it('zeigt keine Zusammenhänge innerhalb desselben Themas', () => {
    expect(all.some((i) => i.title.includes('Füße') && i.title.includes('Kälteempfinden'))).toBe(false);
    expect(all.some((i) => i.title.includes('Müdigkeit') && i.title.includes('Erschöpfung'))).toBe(false);
    expect(all.some((i) => i.title.startsWith('Je höher Bauchschmerz, desto höher Dauer'))).toBe(false);
  });
  it('behält Einflüsse von Messwerten und anderen Themen', () => {
    expect(all.some((i) => i.title.includes('Raumtemperatur') && i.title.includes('Kälteempfinden'))).toBe(true);
    expect(all.some((i) => i.kind === 'factor' && /Milchkaffee|nach der Mahlzeit/.test(i.title))).toBe(true);
  });
  it('nennt auf Skalen Differenzen statt Prozente', () => {
    for (const i of all.filter((x) => x.kind !== 'correlation' && /Bauchschmerz|Übelkeit|Kälteempfinden/.test(x.title.split('→').pop() ?? ''))) {
      expect(i.metric).not.toMatch(/%/);
    }
  });
});

describe('Beschwerden im Verlauf', () => {
  it('liefert Tageshöchstwerte je Symptom, sortiert nach Stärke, mit Wochenvergleich', () => {
    const now = at(21);
    const demo = generateDemo(60, now);
    const [me] = demo.trackers;
    const t = symptomTrend(me, demo.entries, 14, now);
    expect(t.days).toHaveLength(14);
    expect(t.days.at(-1)).toBe('2026-11-23');
    expect(t.series.length).toBeGreaterThan(3);
    for (let i = 1; i < t.series.length; i++) expect(t.series[i - 1].avg).toBeGreaterThanOrEqual(t.series[i].avg);
    expect(t.series.some((s) => s.field.label === 'Stuhlgang')).toBe(false); // neutral, kein Symptom
    const c = t.compare(t.series.slice(0, 3).map((s) => s.field.id));
    expect(c).not.toBeNull();
    // Tageshöchstwert: zwei Einträge an einem Tag → Maximum
    const pain = me.fields.find((f) => f.label === 'Bauchschmerz')!;
    const tt = symptomTrend(me, [entry(me, at(8), { [pain.id]: 1 }), entry(me, at(15), { [pain.id]: 3 })], 7, now);
    expect(tt.series[0].values.at(-1)).toBe(3);
  });
});

describe('App startklar machen', () => {
  it('erkennt alten Check-in, leere und Beispiel-Tracker', () => {
    const tpl = TEMPLATES.find((x) => x.key === 'now')!.build();
    const full = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
    const old = { ...full, name: 'Befinden jetzt', fields: full.fields.filter((f) => ['Was ist passiert?', 'Bauchschmerz', 'Übelkeit', 'Müdigkeit', 'Notiz'].includes(f.label)) };
    const empty = { ...trackerFromTemplate(TEMPLATES.find((x) => x.key === 'reading')!), name: 'r' };
    const demo = { ...trackerFromTemplate(TEMPLATES.find((x) => x.key === 'pushups')!), demo: true };
    const s = setupState([old, empty, demo], [entry(old, at(9), {})], tpl);
    expect(s.upgrade?.next.name).toBe('Mein Befinden');
    expect(s.upgrade?.next.fields.length).toBe(tpl.fields.length);
    expect(s.empty.map((t) => t.name)).toEqual(['r']);
    expect(s.demos).toHaveLength(1);
    // Nach dem Umbau: nichts mehr zu tun beim Check-in
    const after = setupState([s.upgrade!.next], [entry(old, at(9), {})], tpl);
    expect(after.upgrade).toBeNull();
    // Ohne eigene Daten bleiben Beispiele unangetastet
    expect(setupState([demo], [], tpl).demos).toHaveLength(0);
  });
});
