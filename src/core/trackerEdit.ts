import { uid } from './id';
import { scaleLevels, withLevels } from './fieldTypes';
import type { Entry, FieldDef, FieldValue, Tracker } from './types';

/**
 * Erkennt umbenannte Auswahloptionen (gleiche Position, alter Name verschwunden,
 * neuer Name vorher nicht vorhanden), damit bestehende Einträge mitwandern.
 */
export function optionRenames(before: Tracker, after: Tracker): { fieldId: string; from: string; to: string }[] {
  const out: { fieldId: string; from: string; to: string }[] = [];
  for (const f of after.fields) {
    if (f.type !== 'select' && f.type !== 'multiselect') continue;
    const old = before.fields.find((x) => x.id === f.id)?.config.options ?? [];
    const now = f.config.options ?? [];
    if (old.length !== now.length) continue;
    old.forEach((o, i) => {
      if (o !== now[i] && !now.includes(o) && !old.includes(now[i])) out.push({ fieldId: f.id, from: o, to: now[i] });
    });
  }
  return out;
}

/**
 * Neue Felder/Optionen einer Vorlage, die in einem bestehenden Tracker fehlen
 * (Vergleich über die Bezeichnung). Bestehende Felder und Daten bleiben unberührt.
 */
export interface Upgrades {
  fields: FieldDef[];
  options: { fieldId: string; label: string; add: string[] }[];
  /** Abschnitte aus der Vorlage für bestehende Felder ohne Abschnitt. */
  groups?: { fieldId: string; group: string }[];
}

export function templateUpgrades(tracker: Tracker, template: Pick<Tracker, 'fields'>): Upgrades {
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  const fields = template.fields.filter((tf) => !tracker.fields.some((f) => norm(f.label) === norm(tf.label)));
  const options = tracker.fields.flatMap((f) => {
    const tf = template.fields.find((x) => norm(x.label) === norm(f.label) && x.type === f.type);
    if (!tf || (f.type !== 'select' && f.type !== 'multiselect')) return [];
    const have = (f.config.options ?? []).map(norm);
    const add = (tf.config.options ?? []).filter((o) => !have.includes(norm(o)));
    return add.length ? [{ fieldId: f.id, label: f.label, add }] : [];
  });
  const groups = tracker.fields.flatMap((f) => {
    const tf = template.fields.find((x) => norm(x.label) === norm(f.label));
    return tf?.group && !f.group ? [{ fieldId: f.id, group: tf.group }] : [];
  });
  return groups.length ? { fields, options, groups } : { fields, options };
}

export const hasUpgrades = (u: Upgrades) => u.fields.length > 0 || u.options.length > 0 || (u.groups?.length ?? 0) > 0;

/**
 * Wendet templateUpgrades an: neue Felder an ihren Platz aus der Vorlage
 * (hinter das Feld, das dort davor steht), sonst vor die Notiz; Optionen anhängen.
 */
export function applyUpgrades(tracker: Tracker, up: Upgrades, template?: Pick<Tracker, 'fields'>): Tracker {
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  let fields = tracker.fields.map((f) => {
    const o = up.options.find((x) => x.fieldId === f.id);
    const g = up.groups?.find((x) => x.fieldId === f.id);
    const withOpts = o ? { ...f, config: { ...f.config, options: [...(f.config.options ?? []), ...o.add] } } : f;
    return g ? { ...withOpts, group: g.group } : withOpts;
  });
  for (const nf of up.fields) {
    const fresh = { ...structuredClone(nf), id: uid() };
    const tIdx = template?.fields.findIndex((f) => norm(f.label) === norm(nf.label)) ?? -1;
    const prevLabel = tIdx > 0 ? template!.fields[tIdx - 1].label : null;
    const after = prevLabel ? fields.findIndex((f) => norm(f.label) === norm(prevLabel)) : -1;
    const noteIdx = fields.findIndex((f) => f.type === 'text' && f.config.multiline);
    const at = after !== -1 ? after + 1 : noteIdx === -1 ? fields.length : noteIdx;
    fields = [...fields.slice(0, at), fresh, ...fields.slice(at)];
  }
  return { ...tracker, fields };
}

/**
 * Führt einen Tracker in einen anderen über. Felder mit gleicher Bezeichnung
 * und gleichem Typ werden zusammengelegt (Optionen und Skalenstufen vereinigt),
 * alle anderen werden als eigener Abschnitt angehängt. Einträge wandern mit.
 */
export function mergeTrackers(target: Tracker, source: Tracker, entries: Entry[]): { tracker: Tracker; entries: Entry[] } {
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  const map = new Map<string, string>();
  let fields = target.fields.slice();
  const noteIdx = () => fields.findIndex((f) => f.type === 'text' && f.config.multiline);
  for (const sf of source.fields) {
    let i = fields.findIndex((f) => norm(f.label) === norm(sf.label) && f.type === sf.type);
    // Freitext-Notizen (z. B. „Besonderheiten“) landen in der vorhandenen Notiz.
    if (i === -1 && sf.type === 'text' && sf.config.multiline) i = fields.findIndex((f) => f.type === 'text' && !!f.config.multiline);
    if (i !== -1) {
      const tf = fields[i];
      map.set(sf.id, tf.id);
      let config = tf.config;
      if (tf.type === 'select' || tf.type === 'multiselect') {
        const have = new Set((config.options ?? []).map(norm));
        config = { ...config, options: [...(config.options ?? []), ...(sf.config.options ?? []).filter((o) => !have.has(norm(o)))] };
      }
      if (tf.type === 'scale') {
        const levels = [...scaleLevels(config)];
        for (const l of scaleLevels(sf.config)) if (!levels.some((x) => x.value === l.value)) levels.push(l);
        config = { ...config, ...withLevels(levels) };
      }
      fields[i] = { ...tf, config };
    } else {
      const nf: FieldDef = { ...structuredClone(sf), id: uid(), group: sf.group ?? source.name.replace(/\s*\(Demo\)$/, '') };
      map.set(sf.id, nf.id);
      // Mehrzeilige Notizen gleichen Namens wurden oben schon zusammengelegt; sonst vor die Notiz.
      const at = noteIdx() === -1 ? fields.length : noteIdx();
      fields = [...fields.slice(0, at), nf, ...fields.slice(at)];
    }
  }
  const moved = entries.map((e) => {
    if (e.trackerId !== source.id) return e;
    const values: Record<string, FieldValue> = {};
    for (const [k, v] of Object.entries(e.values)) values[map.get(k) ?? k] = v;
    return { ...e, trackerId: target.id, values };
  });
  return { tracker: { ...target, fields }, entries: moved };
}

/**
 * Was zum Aufräumen ansteht – Grundlage der Karte „App startklar machen“.
 * Rein lesend; die Oberfläche bietet für jeden Punkt eine Ein-Tipp-Aktion.
 */
export interface SetupState {
  /** Eigener Check-in, der zu „Mein Befinden“ erweitert werden kann. */
  upgrade: { tracker: Tracker; next: Tracker } | null;
  /** Eigene Tracker, die thematisch in den Check-in gehören (gemeinsame Felder). */
  mergeable: Tracker[];
  /** Eigene Tracker ohne einen einzigen Eintrag (außer dem Check-in). */
  empty: Tracker[];
  /** Beispiel-Tracker, obwohl schon eigene Daten existieren. */
  demos: Tracker[];
}

export function setupState(trackers: Tracker[], entries: Entry[], template: Pick<Tracker, 'fields'>): SetupState {
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  const own = trackers.filter((t) => !t.demo && !t.archived);
  const count = (t: Tracker) => entries.filter((e) => e.trackerId === t.id).length;
  const quick = own.find((t) => t.quick);
  let upgrade: SetupState['upgrade'] = null;
  if (quick) {
    const related = quick.fields.filter((f) => template.fields.some((tf) => norm(tf.label) === norm(f.label))).length >= 3;
    const up = templateUpgrades(quick, template);
    const rename = quick.name === 'Befinden jetzt';
    if (related && (hasUpgrades(up) || rename)) {
      const next = applyUpgrades(quick, up, template);
      upgrade = { tracker: quick, next: rename ? { ...next, name: 'Mein Befinden', icon: quick.icon === '⚡' ? '💙' : quick.icon, color: '#2f63f0' } : next };
    }
  }
  const mergeable = quick
    ? own.filter((t) => t.id !== quick.id && count(t) > 0 && t.fields.some((f) => quick.fields.some((q) => norm(q.label) === norm(f.label))))
    : [];
  const empty = own.filter((t) => !t.quick && count(t) === 0);
  const hasOwnData = own.some((t) => count(t) > 0);
  const demos = hasOwnData ? trackers.filter((t) => t.demo) : [];
  return { upgrade, mergeable, empty, demos };
}
