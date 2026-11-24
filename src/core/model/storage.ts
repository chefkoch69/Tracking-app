import { formatValue } from '../fields/fieldTypes';
import { defaultSchedule } from '../diary/schedule';
import type { AppData, Entry, FieldDef, Tracker } from './types';

/**
 * Persistenz hinter einer schmalen Schnittstelle, damit sie später gegen
 * IndexedDB oder eine Sync-Lösung ausgetauscht werden kann.
 */
export interface StorageAdapter {
  load(): AppData | null;
  save(data: AppData): void;
}

const KEY = 'byot:data';

export const localStorageAdapter: StorageAdapter = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Speichern fehlgeschlagen', e);
    }
  },
};

export function emptyData(): AppData {
  return { version: 1, trackers: [], entries: [], reminders: {} };
}

/** Validiert/ergänzt importierte oder gespeicherte Daten (tolerant). */
export function normalize(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Ungültige Datei.');
  const r = raw as Partial<AppData>;
  if (!Array.isArray(r.trackers) || !Array.isArray(r.entries)) {
    throw new Error('Die Datei enthält keine Tracker-Daten.');
  }
  const trackers: Tracker[] = (r.trackers as Partial<Tracker>[]).map((t) => ({
    description: '',
    icon: '📈',
    color: '#4c6ef5',
    category: '',
    views: ['history', 'chart', 'calendar', 'stats'],
    createdAt: new Date().toISOString(),
    ...t,
    schedule: { ...defaultSchedule(), ...(t.schedule ?? {}) },
    fields: ((t.fields ?? []) as Partial<FieldDef>[]).map((f) => ({ required: false, config: {}, ...f }) as FieldDef),
  }) as Tracker);
  const ids = new Set(trackers.map((t) => t.id));
  const entries: Entry[] = r.entries.filter((e) => ids.has(e.trackerId) && typeof e.timestamp === 'string');
  const experiments = Array.isArray(r.experiments) ? r.experiments.filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string') : [];
  return { version: 1, trackers, entries, reminders: r.reminders ?? {}, profile: r.profile, health: r.health ?? {}, experiments, days: r.days && typeof r.days === 'object' ? r.days : {} };
}

export function exportJson(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

function csvCell(s: string): string {
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (Semikolon-getrennt, Excel-freundlich für deutsche Locale). */
export function exportCsv(tracker: Tracker, entries: Entry[]): string {
  const header = ['Zeitstempel', ...tracker.fields.map((f) => (f.config.unit ? `${f.label} (${f.config.unit})` : f.label))];
  const rows = entries
    .filter((e) => e.trackerId === tracker.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((e) => [
      e.timestamp,
      ...tracker.fields.map((f) => {
        const v = e.values[f.id];
        if (v === null || v === undefined) return '';
        if (typeof v === 'number') return String(v).replace('.', ',');
        const text = formatValue(f, v);
        return text === '–' ? '' : text;
      }),
    ]);
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
