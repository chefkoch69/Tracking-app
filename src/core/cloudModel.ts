import { weekKey } from './dates';
import type { AppData, Entry } from './types';

/**
 * Abbildung des App-Zustands auf den Cloud-Speicher (claude.ai-"db"):
 *  - diary/meta          ein Dokument: Tracker, Erinnerungen, Profil, Gesundheitsdaten
 *  - entries/<KW>        ein Dokument je Kalenderwoche: { week, items: { <id>: Eintrag } }
 * Wochen-Pakete halten die Dokumentanzahl klein (rund 52 pro Jahr) und
 * jedes Dokument weit unter der Größengrenze.
 */

export interface CloudMeta {
  v: 1;
  trackers: AppData['trackers'];
  reminders: AppData['reminders'];
  profile: AppData['profile'] | null;
  health: NonNullable<AppData['health']>;
  experiments?: NonNullable<AppData['experiments']>;
}

export interface CloudWeek {
  week: string;
  items: Record<string, Entry>;
}

/** Entfernt undefined (nicht JSON-fähig) und friert die Form ein. */
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** JSON mit sortierten Schlüsseln – um Zustände unabhängig von der Reihenfolge zu vergleichen. */
export function stableStringify(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return `[${x.map(stableStringify).join(',')}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export function toCloud(data: AppData): { meta: CloudMeta; weeks: Map<string, CloudWeek> } {
  const meta: CloudMeta = plain({
    v: 1 as const,
    trackers: data.trackers,
    reminders: data.reminders,
    profile: data.profile ?? null,
    health: data.health ?? {},
    experiments: data.experiments ?? [],
  });
  const weeks = new Map<string, CloudWeek>();
  for (const e of data.entries) {
    const w = weekKey(new Date(e.timestamp));
    const doc = weeks.get(w) ?? { week: w, items: {} };
    doc.items[e.id] = plain(e);
    weeks.set(w, doc);
  }
  return { meta, weeks };
}

export function fromCloud(meta: Partial<CloudMeta> | undefined, weeks: Partial<CloudWeek>[]): AppData {
  const entries: Entry[] = [];
  for (const w of weeks) {
    if (!w || typeof w !== 'object') continue;
    for (const e of Object.values(w.items ?? {})) if (e && e.id && e.trackerId) entries.push(e);
  }
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return {
    version: 1,
    trackers: meta?.trackers ?? [],
    reminders: meta?.reminders ?? {},
    profile: meta?.profile ?? undefined,
    health: meta?.health ?? {},
    experiments: meta?.experiments ?? [],
    entries,
  };
}

/** Fingerabdrücke je Dokument, um nur Geändertes zu schreiben. */
export function fingerprints(data: AppData): { meta: string; weeks: Map<string, string> } {
  const { meta, weeks } = toCloud(data);
  return { meta: stableStringify(meta), weeks: new Map([...weeks].map(([k, v]) => [k, stableStringify(v)])) };
}

/** Welche Dokumente seit dem letzten Abgleich geschrieben oder gelöscht werden müssen. */
export function cloudDiff(prev: AppData | null, next: AppData) {
  const a = prev ? fingerprints(prev) : { meta: '', weeks: new Map<string, string>() };
  const b = fingerprints(next);
  const { meta, weeks } = toCloud(next);
  return {
    meta: a.meta !== b.meta ? meta : null,
    write: [...b.weeks].filter(([k, fp]) => a.weeks.get(k) !== fp).map(([k]) => weeks.get(k)!),
    remove: [...a.weeks.keys()].filter((k) => !b.weeks.has(k)),
  };
}

export function sameData(a: AppData, b: AppData): boolean {
  const x = fingerprints(a);
  const y = fingerprints(b);
  if (x.meta !== y.meta || x.weeks.size !== y.weeks.size) return false;
  for (const [k, v] of x.weeks) if (y.weeks.get(k) !== v) return false;
  return true;
}
