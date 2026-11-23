import { uid } from './id';
import type { FieldDef, Tracker } from './types';

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
export function templateUpgrades(tracker: Tracker, template: Pick<Tracker, 'fields'>): { fields: FieldDef[]; options: { fieldId: string; label: string; add: string[] }[] } {
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  const fields = template.fields.filter((tf) => !tracker.fields.some((f) => norm(f.label) === norm(tf.label)));
  const options = tracker.fields.flatMap((f) => {
    const tf = template.fields.find((x) => norm(x.label) === norm(f.label) && x.type === f.type);
    if (!tf || (f.type !== 'select' && f.type !== 'multiselect')) return [];
    const have = (f.config.options ?? []).map(norm);
    const add = (tf.config.options ?? []).filter((o) => !have.includes(norm(o)));
    return add.length ? [{ fieldId: f.id, label: f.label, add }] : [];
  });
  return { fields, options };
}

/**
 * Wendet templateUpgrades an: neue Felder an ihren Platz aus der Vorlage
 * (hinter das Feld, das dort davor steht), sonst vor die Notiz; Optionen anhängen.
 */
export function applyUpgrades(tracker: Tracker, up: ReturnType<typeof templateUpgrades>, template?: Pick<Tracker, 'fields'>): Tracker {
  const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');
  let fields = tracker.fields.map((f) => {
    const o = up.options.find((x) => x.fieldId === f.id);
    return o ? { ...f, config: { ...f.config, options: [...(f.config.options ?? []), ...o.add] } } : f;
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
