import { entriesOf } from '../analysis/analytics';
import { addDays } from '../model/dates';
import { itemName, listItems } from '../fields/fieldTypes';
import { isFoodField } from '../analysis/foodGroups';
import type { Entry, FieldDef, FieldValue, Tracker } from '../model/types';

/**
 * Ein-Tipp-Favoriten: Was man oft isst, trinkt oder nimmt, wird zum Knopf – ein Tipp speichert
 * es sofort. Grundlage sind die Listenfelder (Essen, Medikamente) der letzten 30 Tage; ganze
 * Mahlzeiten, die sich wiederholen („3 Eier, Toast“), und einzelne Dinge („Kaffee“).
 */

export type FavoriteKind = 'meal' | 'drink' | 'med';

export interface Favorite {
  fieldId: string;
  /** Text wie zuletzt eingetragen (inkl. Menge). */
  text: string;
  kind: FavoriteKind;
  count: number;
  last: string;
}

const DRINK = /\b(kaffee|espresso|cappuccino|latte|melange|verlängerter|tee|wasser|mineral|sprudel|saft|schorle|smoothie|kakao|milch|cola|limo|spezi|bier|wein|sekt|spritzer|radler|energy|drink|getränk)\b|kaffee$|tee$|saft$|wasser$/i;

export const isMedField = (f: FieldDef) => f.type === 'text' && !!f.config.splitList && /medikament|tablette|arznei/i.test(f.label);

function kindOf(field: FieldDef, text: string): FavoriteKind {
  if (isMedField(field)) return 'med';
  return listItems(text).every((i) => DRINK.test(itemName(i))) ? 'drink' : 'meal';
}

export function favorites(tracker: Tracker, entries: Entry[], now: Date, limit = 8): Favorite[] {
  const fields = tracker.fields.filter((f) => !f.hidden && (isFoodField(f) || isMedField(f)));
  if (!fields.length) return [];
  const since = addDays(now, -30).toISOString();
  const es = entriesOf(tracker, entries).filter((e) => e.timestamp >= since);
  const map = new Map<string, Favorite>();
  const bump = (f: FieldDef, text: string, ts: string) => {
    const key = `${f.id}|${listItems(text).map((i) => itemName(i).toLocaleLowerCase('de-DE')).join(',')}`;
    const cur = map.get(key);
    if (!cur) map.set(key, { fieldId: f.id, text, kind: kindOf(f, text), count: 1, last: ts });
    else {
      cur.count++;
      if (ts > cur.last) {
        cur.last = ts;
        cur.text = text;
      }
    }
  };
  for (const e of es) {
    for (const f of fields) {
      const v = e.values[f.id];
      if (typeof v !== 'string' || !v.trim()) continue;
      const items = listItems(v);
      for (const i of items) bump(f, i, e.timestamp);
      // Ganze Mahlzeit nur, wenn sie aus mehreren Teilen besteht (sonst doppelt).
      if (items.length > 1) bump(f, items.join(', '), e.timestamp);
    }
  }
  const all = [...map.values()];
  // Ganze Mahlzeiten nur, wenn sie sich wiederholen – sonst reichen die einzelnen Teile.
  return all
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit);
}

/** Werte für einen Ein-Tipp-Eintrag inkl. passendem „Was ist passiert?“ (gegessen/getrunken/Medikament). */
export function favoriteValues(tracker: Tracker, fav: Favorite): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = { [fav.fieldId]: fav.text };
  const want = fav.kind === 'med' ? /medikament/i : fav.kind === 'drink' ? /^getrunken$/i : /^gegessen$/i;
  for (const f of tracker.fields) {
    if (f.hidden || f.type !== 'multiselect') continue;
    const opt = (f.config.options ?? []).find((o) => want.test(o));
    if (opt) {
      values[f.id] = [opt];
      break;
    }
  }
  return values;
}

export const FAVORITE_ICON: Record<FavoriteKind, string> = { meal: '🍽', drink: '☕', med: '💊' };
