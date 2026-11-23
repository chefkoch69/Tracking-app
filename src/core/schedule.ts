import { addDays, atMinutes, dayKey, parseTime, startOfDay } from './dates';
import type { Entry, ReminderState, Schedule, Tracker } from './types';

/**
 * Erinnerungs-Engine – generisch für jeden Tracker.
 *
 * Ein Zeitplan erzeugt pro Tag "Slots" (Zeitpunkte, zu denen getrackt werden
 * soll). Ein Slot gilt als erledigt, sobald im Fenster rund um den Slot ein
 * Eintrag existiert. Ist ein Slot fällig und unerledigt, wird erinnert –
 * und ggf. alle `repeatMinutes` wiederholt, bis `maxRepeats` erreicht ist.
 */

/** Wie früh vor einem Slot ein Eintrag schon als "erledigt" zählt. */
export const EARLY_TOLERANCE_MIN = 60;

export function defaultSchedule(): Schedule {
  return {
    mode: 'manual',
    times: ['08:00'],
    intervalMinutes: 120,
    intervalStart: '08:00',
    intervalEnd: '20:00',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    repeatMinutes: 0,
    maxRepeats: 3,
  };
}

/** Alle Slot-Minuten eines Tages (sortiert). */
export function slotMinutesForDay(schedule: Schedule, day: Date): number[] {
  if (schedule.mode === 'manual') return [];
  if (!schedule.weekdays.includes(day.getDay())) return [];
  if (schedule.mode === 'times') {
    return [...new Set(schedule.times.filter(Boolean).map(parseTime))].sort((a, b) => a - b);
  }
  const step = Math.max(5, schedule.intervalMinutes || 0);
  const start = parseTime(schedule.intervalStart);
  const end = parseTime(schedule.intervalEnd);
  const out: number[] = [];
  for (let m = start; m <= end; m += step) out.push(m);
  return out;
}

export function slotsForDay(schedule: Schedule, day: Date): Date[] {
  return slotMinutesForDay(schedule, day).map((m) => atMinutes(day, m));
}

export interface SlotStatus {
  slot: Date;
  /** Fenster, in dem ein Eintrag den Slot erfüllt. */
  windowStart: Date;
  windowEnd: Date;
  done: boolean;
}

/** Status aller Slots eines Tages. */
export function daySlotStatus(tracker: Tracker, entries: Entry[], day: Date): SlotStatus[] {
  const slots = slotsForDay(tracker.schedule, day);
  const dayEnd = addDays(startOfDay(day), 1);
  const times = entries
    .filter((e) => e.trackerId === tracker.id)
    .map((e) => new Date(e.timestamp).getTime());

  return slots.map((slot, i) => {
    const prev = slots[i - 1];
    const next = slots[i + 1];
    const earliest = slot.getTime() - EARLY_TOLERANCE_MIN * 60000;
    // Das Fenster beginnt frühestens in der Mitte zum vorherigen Slot.
    const ws = prev ? Math.max(earliest, (prev.getTime() + slot.getTime()) / 2) : earliest;
    const we = next ? (slot.getTime() + next.getTime()) / 2 : dayEnd.getTime();
    const done = times.some((t) => t >= ws && t < we);
    return { slot, windowStart: new Date(ws), windowEnd: new Date(we), done };
  });
}

/** Der aktuell fällige, unerledigte Slot (oder null). */
export function dueSlot(tracker: Tracker, entries: Entry[], now: Date): SlotStatus | null {
  if (tracker.archived) return null;
  const status = daySlotStatus(tracker, entries, now);
  const t = now.getTime();
  const current = status.find((s) => s.slot.getTime() <= t && t < s.windowEnd.getTime());
  return current && !current.done ? current : null;
}

/** Nächster zukünftiger Slot innerhalb der nächsten 8 Tage. */
export function nextSlot(tracker: Tracker, now: Date): Date | null {
  for (let i = 0; i < 8; i++) {
    const day = addDays(startOfDay(now), i);
    const s = slotsForDay(tracker.schedule, day).find((d) => d.getTime() > now.getTime());
    if (s) return s;
  }
  return null;
}

export function slotKey(slot: Date): string {
  return slot.toISOString();
}

export interface ReminderDecision {
  /** Eindeutiger Schlüssel der fälligen Benachrichtigung (slot#n). */
  key: string;
  slot: Date;
  /** 0 = erste Erinnerung, 1.. = Wiederholungen. */
  attempt: number;
}

/**
 * Ermittelt, ob jetzt eine Benachrichtigung ausgelöst werden soll.
 * Liefert null, wenn nichts zu tun ist oder diese bereits ausgelöst wurde.
 */
export function reminderToFire(
  tracker: Tracker,
  entries: Entry[],
  state: ReminderState | undefined,
  now: Date,
): ReminderDecision | null {
  const due = dueSlot(tracker, entries, now);
  if (!due) return null;
  const key0 = slotKey(due.slot);
  if (state?.skippedSlot === key0) return null;

  const { repeatMinutes, maxRepeats } = tracker.schedule;
  const elapsedMin = (now.getTime() - due.slot.getTime()) / 60000;
  let attempt = 0;
  if (repeatMinutes > 0) {
    attempt = Math.min(Math.floor(elapsedMin / repeatMinutes), Math.max(0, maxRepeats));
  }
  let key = `${key0}#${attempt}`;

  const snooze = state?.snooze?.slot === key0 ? state.snooze : undefined;
  if (snooze) {
    const until = new Date(snooze.until).getTime();
    if (now.getTime() < until) return null;
    // Nach dem Schlummern: genau eine Erinnerung, danach reguläre Wiederholungen,
    // die nach dem Schlummerende liegen.
    const lastRegularAt = due.slot.getTime() + attempt * repeatMinutes * 60000;
    if (lastRegularAt <= until) key = `${key0}#snooze-${snooze.until}`;
  }

  if (state?.lastFiredKey === key) return null;
  return { key, slot: due.slot, attempt };
}

/** Anteil erledigter Slots je Tag (für Kalender/Erfüllungsquote). */
export function adherence(tracker: Tracker, entries: Entry[], from: Date, to: Date) {
  let total = 0;
  let done = 0;
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    for (const s of daySlotStatus(tracker, entries, d)) {
      if (s.slot > to) continue;
      total++;
      if (s.done) done++;
    }
  }
  return { total, done, rate: total ? done / total : null };
}

export function describeSchedule(schedule: Schedule): string {
  if (schedule.mode === 'manual') return 'Manuell';
  const all = schedule.weekdays.length === 7;
  const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const days = all
    ? 'täglich'
    : [1, 2, 3, 4, 5, 6, 0].filter((d) => schedule.weekdays.includes(d)).map((d) => names[d]).join(', ');
  const base =
    schedule.mode === 'times'
      ? `${days} um ${schedule.times.join(', ')}`
      : `${days} alle ${schedule.intervalMinutes} Min (${schedule.intervalStart}–${schedule.intervalEnd})`;
  return schedule.repeatMinutes > 0 ? `${base}, Wiederholung nach ${schedule.repeatMinutes} Min` : base;
}

export { dayKey };
