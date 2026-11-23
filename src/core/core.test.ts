import { describe, expect, it } from 'vitest';
import {
  bucketize,
  currentStreak,
  fieldStats,
  frequencies,
  longestStreak,
  pairMetrics,
  pearson,
  series,
} from './analytics';
import { atMinutes, weekKey } from './dates';
import { generateDemo } from './demo';
import { formatValue, validateValues } from './fieldTypes';
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
    const [m] = demo.trackers;
    const id = (l: string) => m.fields.find((f) => f.label === l)!.id;
    const same = pairMetrics(demo.trackers, demo.entries, { trackerId: m.id, fieldId: id('Schlafdauer') }, { trackerId: m.id, fieldId: id('Erschöpfung') });
    expect(same.basis).toBe('entry');
    expect(pearson(same.pairs.map((p) => p.x), same.pairs.map((p) => p.y))!).toBeLessThan(-0.3);

    const [, p] = demo.trackers;
    const cross = pairMetrics(demo.trackers, demo.entries, { trackerId: m.id, fieldId: id('Raumtemperatur') }, { trackerId: p.id, fieldId: p.fields[0].id });
    expect(cross.basis).toBe('day');
    expect(cross.pairs.length).toBeGreaterThan(10);
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
