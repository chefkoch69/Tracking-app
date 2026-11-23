import type { Tracker } from './types';

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
