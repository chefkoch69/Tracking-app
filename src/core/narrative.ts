import { BODY_MAPS } from './bodyMaps';
import { dayKey, toLocalInput } from './dates';
import { fmtLevel, isTimeRange, rangeMinutes, scaleLevels } from './fieldTypes';
import type { FieldDef, FieldValue, HealthDay, Tracker } from './types';

/**
 * „Erzählen statt tippen“: Aus einem frei gesprochenen oder getippten Text
 * werden Vorschläge für Einträge in den eigenen Trackern.
 *
 * Die Übersetzung macht Claude (über die Seite); dieses Modul baut den
 * Auftrag und prüft die Antwort STRENG gegen die Tracker-Konfiguration:
 * nur bekannte Felder, nur erlaubte Werte, plausible Zeiten. Alles, was
 * nicht passt, wird nicht gespeichert, sondern als „nicht zugeordnet“ gezeigt.
 */

export interface Proposal {
  key: string;
  trackerId: string;
  time: Date;
  timeUncertain: boolean;
  summary: string;
  values: Record<string, FieldValue>;
  /** Angaben, die keinem Feld zugeordnet werden konnten. */
  dropped: string[];
}

export interface ParsedNarrative {
  proposals: Proposal[];
  wake?: string;
  unmapped: string[];
}

function describeField(f: FieldDef): string {
  const c = f.config;
  switch (f.type) {
    case 'scale':
      return `Skala, NUR diese Zahlen: ${scaleLevels(c).map((l) => `${l.value}${l.label ? `=${l.label}` : ''}`).join(', ')}`;
    case 'select':
      return `Auswahl, genau EIN Wert aus: ${JSON.stringify(c.options ?? [])}`;
    case 'multiselect':
      return `Mehrfachauswahl, Liste NUR aus: ${JSON.stringify(c.options ?? [])}`;
    case 'text':
      return c.multiline ? 'Freitext/Notiz (Text)' : c.splitList ? 'Liste als Text, Einträge mit Komma trennen, je Eintrag mit Menge, z. B. "3 Eier, 2 Scheiben Toast"' : 'kurzer Text';
    case 'number':
    case 'measurement':
      return `Zahl${c.unit ? ` in ${c.unit}` : ''}`;
    case 'checkbox':
      return 'true oder false';
    case 'timerange':
      return 'Zeitraum {"from":"HH:MM","to":"HH:MM"}';
    case 'datetime':
      return 'Zeitpunkt "YYYY-MM-DDTHH:MM"';
    case 'bodymap':
      return `Körperregionen, Liste von IDs aus: ${BODY_MAPS[c.bodyMap ?? 'abdomen'].regions.map((r) => `${r.id}=${r.label}`).join(', ')}`;
  }
}

/** Auftrag an Claude (deutsch, mit den Tracker-Schemata und dem Text). */
export function narrativePrompt(text: string, trackers: Tracker[], now: Date, health?: Record<string, HealthDay>): string {
  const wake = health?.[dayKey(now)]?.wake;
  const schema = trackers
    .map((t) => {
      const fields = t.fields
        .filter((f) => !f.hidden)
        .map((f) => `    - "${f.id}" ${f.label}${f.description ? ` (${f.description})` : ''}: ${describeField(f)}`)
        .join('\n');
      return `  Tracker "${t.id}" – ${t.name}${t.quick ? ' [Schnell-Check-in für das allgemeine Befinden über den Tag]' : ''}\n${fields}`;
    })
    .join('\n');
  return `Du hilfst, ein persönliches Gesundheits- und Symptomtagebuch zu führen. Die Person hat frei erzählt, was passiert ist.
Mache daraus Einträge für ihre Tracker. Stelle KEINE Diagnose und erfinde nichts, was nicht gesagt wurde.

Jetzt ist ${now.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}, ${toLocalInput(now).slice(11)} Uhr (lokal: ${toLocalInput(now)}).
${wake ? `Heute aufgestanden um ${wake}.` : 'Aufstehzeit heute unbekannt.'}

Tracker und Felder (nur diese IDs und nur die erlaubten Werte verwenden):
${schema}

Regeln:
- Ein Eintrag je Zeitpunkt bzw. Ereignis (z. B. Frühstück, danach, Schlaf, jetzt). Zeitangaben wie „vorher“, „danach“, „vor 2 Stunden“, „jetzt“ relativ zu jetzt auflösen. Ist die Zeit nur geschätzt, "timeUncertain": true.
- Allgemeines Befinden und Ereignisse in den Schnell-Check-in, sonst in den passendsten Tracker.
- Wörter auf Skalenstufen abbilden: keine=0, kaum/sehr leicht=0.5 (falls vorhanden), leicht=1, mittel/mittelschlecht/ziemlich=2, stark/sehr/schwer=3 – immer nur Werte, die die Skala erlaubt.
- Gegessenes möglichst vollständig mit Mengen in ein Text-Feld für Essen schreiben, falls vorhanden.
- Was in kein Feld passt (z. B. „nach einem Termin“, „2 Stunden geschlafen“, Würgen ohne passendes Feld), kurz in das Notiz-Feld des passenden Eintrags schreiben.
- Nenne ein Feld nur, wenn der Text etwas dazu sagt.

Antworte NUR mit JSON in genau dieser Form:
{"entries":[{"trackerId":"…","time":"YYYY-MM-DDTHH:MM","timeUncertain":false,"summary":"kurze Beschreibung","values":{"<feldId>":<wert>}}],"wake":"HH:MM oder null","unmapped":["was gar nicht zuzuordnen war"]}

Text der Person:
"""
${text.trim().slice(0, 4000)}
"""`;
}

const lower = (s: string) => s.trim().toLocaleLowerCase('de-DE');

/** Wert gegen das Feld prüfen und in die gespeicherte Form bringen; null = verwerfen. */
export function coerceValue(f: FieldDef, v: unknown): FieldValue | null {
  if (v === null || v === undefined || v === '') return null;
  switch (f.type) {
    case 'scale': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n)) return null;
      const levels = scaleLevels(f.config);
      const best = levels.reduce((a, l) => (Math.abs(l.value - n) < Math.abs(a.value - n) ? l : a), levels[0]);
      return best && Math.abs(best.value - n) <= 0.5 ? best.value : null;
    }
    case 'select': {
      const opt = (f.config.options ?? []).find((o) => lower(o) === lower(String(v)));
      return opt ?? null;
    }
    case 'multiselect': {
      const items = Array.isArray(v) ? v : String(v).split(',');
      const opts = f.config.options ?? [];
      const out = [...new Set(items.map((x) => opts.find((o) => lower(o) === lower(String(x)))).filter((x): x is string => !!x))];
      return out.length ? out : null;
    }
    case 'text': {
      const s = Array.isArray(v) ? v.join(', ') : String(v);
      return s.trim() ? s.trim() : null;
    }
    case 'number':
    case 'measurement': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    case 'checkbox':
      return v === true || /^(true|ja|yes|1)$/i.test(String(v)) ? true : v === false || /^(false|nein|no|0)$/i.test(String(v)) ? false : null;
    case 'timerange':
      return isTimeRange(v) && rangeMinutes(v) !== null ? { from: v.from, to: v.to } : null;
    case 'datetime':
      return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
    case 'bodymap': {
      const ids = BODY_MAPS[f.config.bodyMap ?? 'abdomen'].regions.map((r) => r.id);
      const out = (Array.isArray(v) ? v : [v]).map(String).filter((x) => ids.includes(x));
      return out.length ? out : null;
    }
  }
}

function parseTime(s: unknown, now: Date): { time: Date; ok: boolean } {
  if (typeof s === 'string') {
    const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
    if (m) {
      const d = new Date(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00`);
      if (!Number.isNaN(d.getTime())) return { time: d, ok: true };
    }
    const hm = s.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (hm) {
      const d = new Date(now);
      d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      return { time: d, ok: true };
    }
  }
  return { time: new Date(now), ok: false };
}

/** Antwort von Claude prüfen und in Vorschläge umwandeln. */
export function interpretNarrative(raw: unknown, trackers: Tracker[], now: Date): ParsedNarrative {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.entries) ? obj.entries : [];
  const proposals: Proposal[] = [];
  list.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const e = r as Record<string, unknown>;
    const tracker = trackers.find((t) => t.id === e.trackerId) ?? trackers.find((t) => t.name === e.trackerId);
    if (!tracker) return;
    const values: Record<string, FieldValue> = {};
    const dropped: string[] = [];
    const given = (e.values && typeof e.values === 'object' ? e.values : {}) as Record<string, unknown>;
    for (const [fid, v] of Object.entries(given)) {
      const f = tracker.fields.find((x) => x.id === fid) ?? tracker.fields.find((x) => lower(x.label) === lower(fid));
      if (!f) {
        dropped.push(`${fid}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
        continue;
      }
      const c = coerceValue(f, v);
      if (c === null) dropped.push(`${f.label}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      else values[f.id] = c;
    }
    if (!Object.keys(values).length && !dropped.length) return;
    const { time, ok } = parseTime(e.time, now);
    // Zukunft ist unplausibel: auf jetzt setzen und als unsicher markieren.
    const future = time.getTime() > now.getTime() + 5 * 60000;
    proposals.push({
      key: `p${i}`,
      trackerId: tracker.id,
      time: future ? new Date(now) : time,
      timeUncertain: !ok || future || e.timeUncertain === true,
      summary: typeof e.summary === 'string' ? e.summary.slice(0, 200) : '',
      values,
      dropped,
    });
  });
  proposals.sort((a, b) => a.time.getTime() - b.time.getTime());
  const wake = typeof obj.wake === 'string' && /^\d{1,2}:\d{2}$/.test(obj.wake) ? obj.wake.padStart(5, '0') : undefined;
  const unmapped = Array.isArray(obj.unmapped) ? obj.unmapped.map(String).filter((s) => s.trim()) : [];
  return { proposals, wake, unmapped };
}

/** Kurztext eines Vorschlags für die Anzeige (z. B. „Übelkeit 2 · Notiz“). */
export function proposalText(p: Proposal, tracker: Tracker): string {
  return tracker.fields
    .filter((f) => p.values[f.id] !== undefined)
    .map((f) => {
      const v = p.values[f.id];
      if (typeof v === 'number' && f.type === 'scale') return `${f.label} ${fmtLevel(v)}`;
      if (Array.isArray(v)) return v.join(', ');
      const sep = /[?:]$/.test(f.label) ? ' ' : ': ';
      return `${f.label}${sep}${typeof v === 'string' ? v : JSON.stringify(v)}`;
    })
    .join(' · ');
}
