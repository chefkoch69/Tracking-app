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
} from '../analysis/analytics';
import { atMinutes, weekKey } from '../model/dates';
import { cloudDiff, fromCloud, sameData, stableStringify, toCloud } from '../model/cloudModel';
import { dayColumns, dayValue, reportText, symptomSummary } from '../analysis/report';
import { generateDemo } from '../model/demo';
import { formatShort, formatValue, itemName, listItems, rangeMinutes, scaleLevels, severity, validateValues, withLevels } from '../fields/fieldTypes';
import { applyUpgrades, hasUpgrades, mergeTrackers, optionRenames, setupState, templateUpgrades } from '../fields/trackerEdit';
import { reducer } from '../../state/store';
import { computeInsights, factorInsights, trendInsights } from '../analysis/insights';
import { foodGroupsOf } from '../analysis/foodGroups';
import { favoriteValues, favorites } from '../diary/favorites';
import { conditionMet, fieldSpec } from '../fields/fieldTypes';
import { MOMENTS, detailsOf, fieldByLabel, pendingFollowUp, suggestedMoment, symptomFields, withEvent } from '../diary/moments';
import { experimentDay, experimentEffect } from '../diary/experiments';
import { doctorSummaryPrompt } from '../analysis/doctorSummary';
import { appointmentLabel, dayRhythm, daysUntil, entryFeedback, insightReadiness, levelText, questionList } from '../diary/feedback';
import { healthAsTracker, minutesSinceWake, parseHealthText, sinceWakeDistribution } from '../diary/health';
import { daySlotStatus, dueSlot, nextSlot, reminderToFire, slotKey, slotMinutesForDay } from '../diary/schedule';
import { exportCsv, normalize } from '../model/storage';
import { TEMPLATES, makeField, trackerFromTemplate } from '../fields/templates';
import type { Entry, FieldValue, Tracker } from '../model/types';

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
    expect(f.some((i) => /nach der Mahlzeit/i.test(i.title) && i.tone === 'bad')).toBe(true);
    expect(f.some((i) => i.title.includes('Buscopan') && i.title.includes('danach schwächer') && i.tone === 'good')).toBe(true);
    // Fairer Vergleich: Auslöser-Essen fällt gegenüber anderem Essen auf, „aufgestanden“ (Routine) nicht
    expect(f.some((i) => /Milchkaffee|Linsensuppe/.test(i.title) && i.tone === 'bad')).toBe(true);
    expect(f.some((i) => /Aufstehen|aufgestanden/.test(i.title))).toBe(false);
    // Jede Ursache höchstens einmal
    const causes = f.map((i) => i.title.split(':')[0]);
    expect(new Set(causes).size).toBe(causes.length);
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

describe('Listen und Vorlagen-Erweiterung', () => {
  const quick = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);

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
    expect(groups).toEqual(['Ereignisse & Essen', 'Schlaf & Aufstehen', 'Bauch & Verdauung', 'Kopf', 'Tinnitus', 'Allgemein', 'Kälte', 'Notiz']);
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
    expect(all.some((i) => i.kind === 'correlation' && i.title.includes('Bauchschmerz') && i.title.includes('Schmerzdauer'))).toBe(false);
    // Messwert als Ursache vorne, in der Richtung, in der es schlechter wird
    expect(all.some((i) => i.title === 'Raumtemperatur niedriger → Kälteempfinden meist stärker')).toBe(true);
  });
  it('behält Einflüsse von Messwerten und anderen Themen', () => {
    expect(all.some((i) => i.title.includes('Raumtemperatur') && i.title.includes('Kälteempfinden'))).toBe(true);
    expect(all.some((i) => i.kind === 'factor' && /Milchkaffee|Linsensuppe|nach der Mahlzeit/i.test(i.title))).toBe(true);
  });
  it('nennt auf Skalen Differenzen statt Prozente', () => {
    for (const i of all.filter((x) => x.kind !== 'correlation' && /Bauchschmerz|Übelkeit|Kälteempfinden/.test(x.title.split('→').pop() ?? ''))) {
      expect(i.metric).not.toMatch(/%/);
    }
  });
});

describe('Was hilft wirklich? (fairer Vergleich)', () => {
  // Kleines Tagebuch: Schmerz (0–3), Medikamente und Essen als Listen
  function diary() {
    const t: Tracker = {
      ...trackerFromTemplate(TEMPLATES.find((x) => x.key === 'reading')!),
      fields: [
        { ...makeField('scale', 'Schmerz', { min: 0, max: 3, polarity: 'higher-worse' }), group: 'Bauch' },
        { ...makeField('text', 'Medikamente', { splitList: true }), group: 'Ereignisse' },
        { ...makeField('text', 'Was gegessen?', { splitList: true }), group: 'Ereignisse' },
      ],
    };
    const [pain, med, food] = t.fields.map((f) => f.id);
    return { t, pain, med, food };
  }
  const d0 = new Date(2026, 9, 1);
  const dayN = (n: number) => new Date(2026, 9, 1 + n);

  it('lobt kein Mittel, das nicht besser wirkt als Abwarten', () => {
    const { t, pain, med } = diary();
    const es: Entry[] = [];
    for (let n = 0; n < 12; n++) {
      const d = dayN(n);
      // Beschwerden klingen von selbst ab: 2 → 1
      es.push(entry(t, at(9, 0, d), { [pain]: 2 }), entry(t, at(11, 0, d), { [pain]: 1 }));
      if (n % 2 === 0) {
        // „Tee“: genauso wie ohne
        es.push(entry(t, at(15, 0, d), { [pain]: 2, [med]: 'Tee' }), entry(t, at(17, 0, d), { [pain]: 1 }));
      } else {
        // „Ibu“: deutlich besser
        es.push(entry(t, at(15, 0, d), { [pain]: 3, [med]: 'Ibu 400' }), entry(t, at(17, 0, d), { [pain]: 0 }));
      }
    }
    const f = factorInsights(t, es);
    expect(f.some((i) => i.title.includes('„Tee“'))).toBe(false);
    const ibu = f.find((i) => i.title.includes('Ibu 400'));
    expect(ibu?.tone).toBe('good');
    expect(ibu?.title).toContain('danach schwächer');
    expect(ibu?.detail).toContain('ohne:');
    expect(d0 < dayN(1)).toBe(true);
  });

  it('meldet Auslöser, aber nicht „harmlose“ Lebensmittel als hilfreich', () => {
    const { t, pain, food } = diary();
    const es: Entry[] = [];
    const foods = ['Reis', 'Apfel', 'Brot', 'Milchkaffee'];
    for (let n = 0; n < 24; n++) {
      const d = dayN(n);
      const meal = foods[n % 4];
      es.push(entry(t, at(12, 0, d), { [food]: meal }));
      es.push(entry(t, at(13, 30, d), { [pain]: meal === 'Milchkaffee' ? 3 : 1 }));
    }
    const f = factorInsights(t, es);
    const trigger = f.find((i) => i.title.includes('Milchkaffee'));
    expect(trigger?.tone).toBe('bad');
    expect(trigger?.title).toBe('Nach „Milchkaffee“: Schmerz danach stärker');
    expect(f.some((i) => /Reis|Apfel|Brot/.test(i.title))).toBe(false);
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

describe('Health: Bewegung und Körperanalyse', () => {
  it('liest Schlaf, Bewegung, Gewicht und Körperfett (auch als Anteil) aus dem Kurzbefehl', () => {
    const [d] = parseHealthText('BYOT-HEALTH {"date":"2026-11-23","wake":"06:42","schlaf":"450","steps":"4.512","kcal":"380,4","training":"25","gewicht":"71,8","fett":"0,22"}');
    expect(d).toMatchObject({ wake: '06:42', sleepHours: 7.5, steps: 4512, activeKcal: 380, exerciseMin: 25, weight: 71.8, bodyFat: 22 });
    const [z] = parseHealthText('Gewicht: 70,2\nKörperfett: 21,5', '2026-11-23');
    expect(z).toMatchObject({ weight: 70.2, bodyFat: 21.5 });
  });
  it('stellt die neuen Werte für Vergleich und Erkenntnisse bereit', () => {
    const demo = generateDemo(30, at(21));
    const h = healthAsTracker(demo.health)!;
    expect(h.tracker.fields.map((f) => f.label)).toEqual(expect.arrayContaining(['Aktive Energie', 'Trainingsminuten', 'Gewicht', 'Körperfett']));
    expect(h.entries.some((e) => typeof e.values['health-weight'] === 'number')).toBe(true);
  });
});

describe('Rückmeldung, Tagesrhythmus, Termin', () => {
  const tpl = () => trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
  const id = (t: Tracker, l: string) => t.fields.find((f) => f.label === l)!.id;

  it('vergleicht mit dem letzten Wert und sagt besser/schlechter', () => {
    const t = tpl();
    const a = entry(t, at(8), { [id(t, 'Bauchschmerz')]: 2, [id(t, 'Übelkeit')]: 1 });
    const b = entry(t, at(10), { [id(t, 'Tinnitus')]: 1 });
    const c = entry(t, at(12), { [id(t, 'Bauchschmerz')]: 1, [id(t, 'Übelkeit')]: 1, [id(t, 'Tinnitus')]: 2, [id(t, 'Raumtemperatur')]: 19 });
    const fb = entryFeedback(t, [a, b, c], c);
    const by = (l: string) => fb.find((x) => x.field.label === l);
    expect(by('Bauchschmerz')?.direction).toBe('better');
    expect(by('Bauchschmerz')?.prev).toBe(2);
    expect(by('Übelkeit')?.direction).toBe('same');
    expect(by('Tinnitus')?.direction).toBe('worse');
    // neutrale Messwerte (Raumtemperatur) werden nicht bewertet
    expect(by('Raumtemperatur')).toBeUndefined();
    expect(levelText(t.fields.find((f) => f.label === 'Übelkeit')!, 0.5)).toBe('0,5 · sehr leicht');
  });

  it('zeigt den Tag als Zeitachse mit Beschwerden und Ereignissen', () => {
    const t = tpl();
    const es = [
      entry(t, at(7, 10), { [id(t, 'Was ist passiert?')]: ['aufgestanden'], [id(t, 'Müdigkeit')]: 2 }),
      entry(t, at(8), { [id(t, 'Was ist passiert?')]: ['gegessen'], [id(t, 'Was gegessen?')]: '3 Eier, Toast' }),
      entry(t, at(9, 30), { [id(t, 'Bauchschmerz')]: 2, [id(t, 'Wo kalt?')]: ['Füße'] }),
      entry(t, at(9, 45), { [id(t, 'Was ist passiert?')]: ['Medikament genommen'], [id(t, 'Medikamente')]: 'Buscopan 10 mg' }),
      entry(t, at(11), { [id(t, 'Bauchschmerz')]: 0.5 }),
      entry(t, at(12), { [id(t, 'Bauchschmerz')]: 3 }, ),
    ];
    es[5].timestamp = atMinutes(new Date(2026, 10, 22), 12 * 60).toISOString(); // anderer Tag
    const r = dayRhythm(t, es, day);
    expect(r.rows.map((x) => x.field.label)).toEqual(['Bauchschmerz', 'Müdigkeit']);
    expect(r.rows[0].points.map((p) => p.value)).toEqual([2, 0.5]);
    expect(r.events.map((e) => `${e.kind}:${e.label}`)).toEqual(['wake:aufgestanden', 'meal:3 Eier, Toast', 'med:Buscopan 10 mg']);
    expect(r.from).toBe(6 * 60);
    expect(r.to).toBe(22 * 60);
  });

  it('zählt Tage bis zu ersten Mustern und bis zum Termin', () => {
    const t = tpl();
    const es = [0, 1, 1, 3].map((d) => entry(t, at(9, 0, new Date(2026, 10, 23 - d)), { [id(t, 'Müdigkeit')]: 1 }));
    expect(insightReadiness([t], es, at(21))).toEqual({ days: 3, need: 7, ready: false });
    expect(insightReadiness([{ ...t, demo: true }], es, at(21)).days).toBe(0);
    expect(daysUntil('2026-12-07', at(21))).toBe(14);
    expect(appointmentLabel('2026-11-24', at(21))).toBe('morgen');
    expect(appointmentLabel('2026-11-20', at(21))).toBe('war vor 3 Tagen');
    expect(questionList('- Woher kommt die Übelkeit?\n\n2) Laktose testen?\n  ')).toEqual(['Woher kommt die Übelkeit?', 'Laktose testen?']);
  });

  it('nimmt die Fragen in die Textfassung des Berichts auf', () => {
    const t = tpl();
    const es = [entry(t, at(9), { [id(t, 'Müdigkeit')]: 1 })];
    const txt = reportText([t], es, undefined, '2026-11-20', '2026-11-23', { name: 'Test', questions: 'Laktose testen?' });
    expect(txt).toContain('MEINE FRAGEN\n1. Laktose testen?');
  });
});

describe('Lebensmittel-Gruppen', () => {
  const keys = (x: string) => foodGroupsOf(x).map((g) => g.key);
  it('ordnet Gerichte Gruppen zu – auch österreichisch und zusammengesetzt', () => {
    expect(keys('Milchkaffee')).toEqual(['milch', 'koffein']);
    expect(keys('2 Scheiben Toast mit Käse')).toEqual(['milch', 'weizen']);
    expect(keys('Topfenstrudel')).toEqual(['milch', 'weizen', 'suess']);
    expect(keys('Leberkässemmel')).toEqual(['weizen', 'fett']);
    expect(keys('Linsensuppe')).toEqual(['huelsen']);
    expect(keys('Melange')).toEqual(['milch', 'koffein']);
  });
  it('vermeidet typische Fehlgriffe', () => {
    expect(keys('Reis mit Gemüse')).toEqual([]); // „Reis“ ist kein Eis
    expect(keys('Schweinsbraten mit Erdäpfeln')).toEqual(['fett']); // kein Wein, kein Obst
    expect(keys('Nudeln mit Tomatensoße')).toEqual(['weizen']); // „Tomate“ ist kein Mate-Tee
    expect(keys('Hafermilch Cappuccino')).toEqual(['koffein']); // Pflanzenmilch
    expect(keys('Kräutertee')).toEqual([]); // „Kräuter“ ist kein Kraut
    expect(keys('Ginger Ale')).toEqual([]); // „Ginger“ ist kein Gin
    expect(keys('Stilles Mineralwasser')).toEqual([]);
  });
  it('findet Auslöser-Gruppen, auch wenn kein einzelnes Gericht oft genug vorkommt', () => {
    const t: Tracker = {
      ...trackerFromTemplate(TEMPLATES.find((x) => x.key === 'reading')!),
      fields: [
        { ...makeField('scale', 'Bauchschmerz', { min: 0, max: 3, polarity: 'higher-worse' }), group: 'Bauch' },
        { ...makeField('text', 'Was gegessen?', { splitList: true }), group: 'Essen' },
      ],
    };
    const [pain, food] = t.fields.map((f) => f.id);
    const dairy = ['Joghurt', 'Käsebrot', 'Kakao', 'Milchreis', 'Topfen', 'Latte'];
    const other = ['Reis mit Gemüse', 'Apfel', 'Hühnersuppe', 'Kartoffeln', 'Banane', 'Gurkensalat'];
    const es: Entry[] = [];
    for (let n = 0; n < 12; n++) {
      const d = new Date(2026, 9, 1 + n);
      const meal = n % 2 === 0 ? dairy[n / 2] : other[(n - 1) / 2];
      es.push(entry(t, at(12, 0, d), { [food]: meal }));
      es.push(entry(t, at(13, 30, d), { [pain]: n % 2 === 0 ? 2 : 0.5 }));
    }
    const f = factorInsights(t, es);
    const g = f.find((i) => i.title.startsWith('Nach Milchprodukten'));
    expect(g?.tone).toBe('bad');
    expect(g?.detail).toContain('nach Essen ohne Milchprodukte');
    // Kein einzelnes Milchprodukt kommt oft genug vor
    expect(f.some((i) => dairy.some((x) => i.title.includes(`„${x}“`)))).toBe(false);
  });
});

describe('Ein-Tipp-Favoriten', () => {
  const tpl = () => trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
  const id = (t: Tracker, l: string) => t.fields.find((f) => f.label === l)!.id;
  it('macht Häufiges zu Knöpfen – Mahlzeiten erst, wenn sie sich wiederholen', () => {
    const t = tpl();
    const food = id(t, 'Was gegessen?');
    const med = id(t, 'Medikamente');
    const es = [
      entry(t, at(7, 0, new Date(2026, 10, 20)), { [food]: '3 Eier, Toast' }),
      entry(t, at(7, 0, new Date(2026, 10, 21)), { [food]: '3 Eier, Toast' }),
      entry(t, at(9, 0, new Date(2026, 10, 21)), { [food]: 'Milchkaffee' }),
      entry(t, at(9, 0, new Date(2026, 10, 22)), { [food]: 'Milchkaffee' }),
      entry(t, at(9, 0, new Date(2026, 10, 23)), { [food]: 'Milchkaffee' }),
      entry(t, at(12, 0, new Date(2026, 10, 22)), { [food]: 'Linsensuppe, Brot' }),
      entry(t, at(13, 0, new Date(2026, 10, 22)), { [med]: 'Buscopan 10 mg' }),
      entry(t, at(9, 0, new Date(2026, 8, 1)), { [food]: 'Uralt-Essen' }), // älter als 30 Tage
    ];
    const fav = favorites(t, es, at(21));
    const texts = fav.map((f) => f.text);
    expect(texts[0]).toBe('Milchkaffee');
    expect(texts).toContain('3 Eier, Toast');
    expect(texts).not.toContain('Linsensuppe, Brot'); // nur einmal gegessen
    expect(texts).toContain('Linsensuppe');
    expect(texts).not.toContain('Uralt-Essen');
    expect(fav.find((f) => f.text === 'Milchkaffee')?.kind).toBe('drink');
    expect(fav.find((f) => f.text === 'Buscopan 10 mg')?.kind).toBe('med');
  });
  it('setzt beim Speichern das passende Ereignis', () => {
    const t = tpl();
    const fav = favorites(t, [entry(t, at(9), { [id(t, 'Medikamente')]: 'Buscopan 10 mg' }), entry(t, at(10), { [id(t, 'Was gegessen?')]: 'Kaffee' })], at(21));
    const med = favoriteValues(t, fav.find((f) => f.kind === 'med')!);
    expect(med[id(t, 'Was ist passiert?')]).toEqual(['Medikament genommen']);
    const drink = favoriteValues(t, fav.find((f) => f.kind === 'drink')!);
    expect(drink[id(t, 'Was ist passiert?')]).toEqual(['getrunken']);
    expect(drink[id(t, 'Was gegessen?')]).toBe('Kaffee');
  });
});

describe('Arztzettel mit Claude', () => {
  it('gibt Claude nur die Daten, die Fragen und klare Regeln', () => {
    const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
    const pain = t.fields.find((f) => f.label === 'Bauchschmerz')!.id;
    const es = [entry(t, at(9, 0, new Date(2026, 10, 21)), { [pain]: 2 }), entry(t, at(9, 0, new Date(2026, 10, 22)), { [pain]: 1 })];
    const p = doctorSummaryPrompt({
      trackers: [t], entries: es, from: '2026-11-20', to: '2026-11-23',
      profile: { questions: 'Laktose testen?', summary: 'ALTE FASSUNG' }, insights: [],
    });
    expect(p).toContain('NUR Angaben aus den Daten');
    expect(p).toContain('Keine Diagnosen');
    expect(p).toContain('nicht wiederholen');
    expect(p).toContain('1. Laktose testen?');
    expect(p).toContain('Bauchschmerz 2');
    expect(p).not.toContain('ALTE FASSUNG');
  });
  it('setzt eine vorhandene Zusammenfassung an den Anfang der Textfassung', () => {
    const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
    const txt = reportText([t], [], undefined, '2026-11-20', '2026-11-23', { summary: 'Kurz: Bauchschmerz an 5 von 7 Tagen.' });
    expect(txt.indexOf('ZUSAMMENFASSUNG')).toBeLessThan(txt.indexOf('Kurz:'));
  });
});

describe('Körper-Tagebuch: Details, Uhrzeiten, Kopf', () => {
  const tpl = () => trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
  const by = (t: Tracker, l: string) => t.fields.find((f) => f.label === l)!;

  it('zeigt Details erst, wenn die Beschwerde angegeben ist', () => {
    const t = tpl();
    const pain = by(t, 'Bauchschmerz');
    const loc = by(t, 'Lokalisation');
    const head = by(t, 'Kopf – wo?');
    expect(loc.showIf?.fieldId).toBe(pain.id);
    expect(conditionMet(loc, t.fields, { [pain.id]: 0 })).toBe(false);
    expect(conditionMet(loc, t.fields, { [pain.id]: 0.5 })).toBe(true);
    expect(conditionMet(head, t.fields, { [pain.id]: 2 })).toBe(false);
    expect(conditionMet(by(t, 'Tinnitus – Klang'), t.fields, { [by(t, 'Tinnitus').id]: 1 })).toBe(true);
    expect(conditionMet(by(t, 'Notiz'), t.fields, {})).toBe(true);
    expect(validateValues([head], { [head.id]: ['schlaefe-r', 'nacken'] })).toEqual({});
  });

  it('speichert Uhrzeiten wie „Handy weggelegt um“ – auch nach Mitternacht', () => {
    const t = tpl();
    const phone = by(t, 'Handy weggelegt um');
    const alarm = by(t, 'Wecker gestellt auf');
    expect(validateValues([phone], { [phone.id]: '23:45' })).toEqual({});
    expect(Object.keys(validateValues([phone], { [phone.id]: '25:00' }))).toEqual([phone.id]);
    expect(fieldSpec(phone).toNumber(phone, '00:30')).toBe(24.5);
    expect(fieldSpec(alarm).toNumber(alarm, '06:30')).toBe(6.5);
    expect(formatValue(alarm, '06:30')).toBe('06:30 Uhr');
  });

  it('erweitert ein älteres „Mein Befinden“ um Schlaf, Kopf und Tinnitus – mit passenden Bedingungen', () => {
    const t = tpl();
    const keep = ['Was ist passiert?', 'Was gegessen?', 'Bezug zu Mahlzeiten', 'Medikamente', 'Bauchschmerz', 'Uhrzeit von–bis', 'Lokalisation', 'Übelkeit', 'Müdigkeit', 'Erschöpfung', 'Tinnitus', 'Kälteempfinden', 'Wo kalt?', 'Notiz'];
    const old: Tracker = {
      ...t,
      fields: t.fields
        .filter((f) => keep.includes(f.label))
        .map((f) => ({ ...f, showIf: undefined, group: f.label === 'Tinnitus' ? 'Allgemein' : f.group })),
    };
    const template = TEMPLATES.find((x) => x.key === 'now')!.build();
    const up = templateUpgrades(old, template);
    expect(hasUpgrades(up)).toBe(true);
    const next = applyUpgrades(old, up, template);
    const nb = (l: string) => next.fields.find((f) => f.label === l)!;
    expect(next.fields.map((f) => f.label)).toEqual(template.fields.map((f) => f.label));
    // Bedingungen zeigen auf Felder dieses Trackers
    expect(nb('Lokalisation').showIf?.fieldId).toBe(nb('Bauchschmerz').id);
    expect(nb('Kopf – wo?').showIf?.fieldId).toBe(nb('Kopfschmerz').id);
    expect(nb('Tinnitus – Ohr').showIf?.fieldId).toBe(nb('Tinnitus').id);
    expect(nb('Tinnitus').group).toBe('Tinnitus');
    expect(nb('Bauchschmerz').id).toBe(old.fields.find((f) => f.label === 'Bauchschmerz')!.id);
    expect(hasUpgrades(templateUpgrades(next, template))).toBe(false);
  });
});

describe('Eintragen nach Moment', () => {
  const tpl = () => trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
  it('findet die Felder jedes Moments in „Mein Befinden“', () => {
    const t = tpl();
    for (const m of MOMENTS) for (const f of m.fields) expect(fieldByLabel(t, f.label), `${m.key}: ${f.label}`).toBeTruthy();
    const { main, more } = symptomFields(t);
    expect(main.map((f) => f.label)).toEqual(['Bauchschmerz', 'Übelkeit', 'Kopfschmerz', 'Tinnitus', 'Müdigkeit', 'Erschöpfung', 'Kälteempfinden']);
    expect(more.map((f) => f.label)).toEqual(['Würgen / Brechreiz', 'Sodbrennen', 'Erbrechen']);
    expect(detailsOf(t, fieldByLabel(t, 'Kopfschmerz')!).map((f) => f.label)).toEqual(['Kopf – wo?', 'Art der Kopfschmerzen', 'Kopfschmerz von–bis']);
  });
  it('vermerkt das passende Ereignis', () => {
    const t = tpl();
    const ev = fieldByLabel(t, 'Was ist passiert?')!;
    const meal = MOMENTS.find((m) => m.key === 'meal')!;
    const drinkOnly = withEvent(t, meal, { [fieldByLabel(t, 'Was getrunken?')!.id]: 'Kaffee' });
    expect(drinkOnly[ev.id]).toEqual(['getrunken']);
    const food = withEvent(t, meal, { [fieldByLabel(t, 'Was gegessen?')!.id]: 'Semmel' });
    expect(food[ev.id]).toEqual(['gegessen']);
    const evening = withEvent(t, MOMENTS.find((m) => m.key === 'evening')!, {});
    expect(evening[ev.id]).toEqual(['schlafen gegangen']);
    // Maßnahme ohne Medikament: kein „Medikament genommen“
    const med = withEvent(t, MOMENTS.find((m) => m.key === 'med')!, { [fieldByLabel(t, 'Maßnahmen')!.id]: 'Wärmflasche' });
    expect(med[ev.id]).toBeUndefined();
  });
  it('schlägt morgens „Aufgestanden“ und abends „Schlafen gehen“ vor', () => {
    const t = tpl();
    expect(suggestedMoment(t, [], at(7))).toBe('morning');
    expect(suggestedMoment(t, [entry(t, at(6, 50), { [fieldByLabel(t, 'Was ist passiert?')!.id]: ['aufgestanden'] })], at(7))).toBe(null);
    expect(suggestedMoment(t, [], at(15))).toBe(null);
    expect(suggestedMoment(t, [], at(22))).toBe('evening');
  });
  it('fragt 30 Minuten bis 4 Stunden nach dem Essen nach', () => {
    const t = tpl();
    const food = fieldByLabel(t, 'Was gegessen?')!;
    const pain = fieldByLabel(t, 'Bauchschmerz')!;
    const meal = entry(t, at(12, 0), { [food.id]: '2 Semmeln, Butter' });
    expect(pendingFollowUp(t, [meal], at(12, 10))).toBe(null); // zu früh
    const f = pendingFollowUp(t, [meal], at(13, 0));
    expect(f?.what).toBe('Semmeln, Butter');
    expect(f?.minutesAgo).toBe(60);
    expect(pendingFollowUp(t, [meal, entry(t, at(12, 45), { [pain.id]: 0 })], at(13, 0))).toBe(null); // schon beantwortet
    expect(pendingFollowUp(t, [meal], at(17, 0))).toBe(null); // zu spät
    expect(pendingFollowUp(t, [meal], at(13, 0), [meal.id])).toBe(null); // weggeklickt
  });
});

describe('Ausprobieren', () => {
  it('vergleicht Beschwerden vorher und während des Versuchs', () => {
    const t = trackerFromTemplate(TEMPLATES.find((x) => x.key === 'now')!);
    const pain = t.fields.find((f) => f.label === 'Bauchschmerz')!;
    const sleep = t.fields.find((f) => f.label === 'Schlafqualität')!;
    const es: Entry[] = [];
    for (let i = 1; i <= 10; i++) es.push(entry(t, at(13, 0, new Date(2026, 10, i)), { [pain.id]: 2, [sleep.id]: 2 })); // 1.–10.11.
    for (let i = 11; i <= 20; i++) es.push(entry(t, at(13, 0, new Date(2026, 10, i)), { [pain.id]: 0.5, [sleep.id]: 4 })); // 11.–20.11.
    const exp = { id: 'x', title: 'Laktosefrei', status: 'running' as const, startedAt: '2026-11-11', createdAt: '2026-11-10' };
    const eff = experimentEffect(exp, t, es, at(21, 0, new Date(2026, 10, 20)));
    const p = eff.find((e) => e.field.label === 'Bauchschmerz')!;
    expect(p.before).toBe(2);
    expect(p.during).toBe(0.5);
    expect(p.direction).toBe('better');
    expect(eff.find((e) => e.field.label === 'Schlafqualität')?.direction).toBe('better');
    expect(experimentDay(exp, new Date(2026, 10, 20, 9))).toBe(10);
    expect(experimentEffect({ ...exp, startedAt: undefined }, t, es, at(21))).toEqual([]);
  });
});
