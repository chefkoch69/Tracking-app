const pad = (n: number) => String(n).padStart(2, '0');

/** Lokaler Tagesschlüssel YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** ISO-8601-Woche, z. B. "2026-W48". */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "HH:MM" → Minuten seit Mitternacht. */
export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

export function atMinutes(day: Date, minutes: number): Date {
  const r = startOfDay(day);
  r.setMinutes(minutes);
  return r;
}

/** Wert für <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function formatDay(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
