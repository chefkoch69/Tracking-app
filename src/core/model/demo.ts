import { addDays, atMinutes, dayKey, startOfDay } from './dates';
import { uid } from './id';
import { TEMPLATES, trackerFromTemplate } from '../fields/templates';
import { demoHealth } from '../diary/health';
import type { Entry, FieldValue, HealthDay, Tracker } from './types';

const FOODS = ['2 Scheiben Toast mit Käse', '3 Eier', 'Hummus', 'Haferflocken mit Banane', 'Milchkaffee', 'Reis mit Gemüse', 'Nudeln mit Tomatensoße', 'Apfel', 'Joghurt', 'Linsensuppe'];

/**
 * Plausible Beispieldaten (klar als Demo markiert): ein Tracker „Mein Befinden“
 * mit Morgenwerten, Mahlzeiten und Bauch-Episoden – plus Liegestütze als
 * Beispiel für eine Gewohnheit.
 */
export function generateDemo(days = 60, now = new Date()): { trackers: Tracker[]; entries: Entry[]; health: Record<string, HealthDay> } {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const tpl = (k: string) => trackerFromTemplate(TEMPLATES.find((t) => t.key === k)!);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

  const me = tpl('now');
  const pushups = tpl('pushups');
  const trackers = [me, pushups];
  const entries: Entry[] = [];
  // Eigener Zufallsgenerator, damit Gesundheitswerte die übrigen Beispieldaten nicht verschieben.
  let seedH = 7;
  const health = demoHealth(days, now, () => ((seedH = (seedH * 16807) % 2147483647) / 2147483647));
  const id = (t: Tracker, l: string) => t.fields.find((f) => f.label === l)!.id;
  const push = (t: Tracker, when: Date, values: Record<string, FieldValue>) => {
    if (when <= now) entries.push({ id: uid(), trackerId: t.id, timestamp: when.toISOString(), values });
  };
  const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(startOfDay(now), -i);
    const h = health[dayKey(day)];
    const slept = h?.sleepHours ?? 7;

    // Morgens: aufgestanden + Befinden, Kälte hängt an der Raumtemperatur.
    if (rnd() > 0.08) {
      const temp = Math.round((17 + rnd() * 5) * 2) / 2;
      const cold = clamp(Math.round((21 - temp) * 0.7 + (rnd() - 0.5)), 0, 3);
      const tired = clamp(Math.round((8 - slept) * 0.9 + (rnd() - 0.5) * 1.2), 0, 3);
      const v: Record<string, FieldValue> = {
        [id(me, 'Was ist passiert?')]: ['aufgestanden'],
        [id(me, 'Übelkeit')]: clamp(Math.round(rnd() * 1.6), 0, 3),
        [id(me, 'Bauchschmerz')]: rnd() > 0.7 ? 0.5 : 0,
        [id(me, 'Erschöpfung')]: tired,
        [id(me, 'Müdigkeit')]: clamp(tired + (rnd() > 0.7 ? 1 : 0), 0, 3),
        [id(me, 'Tinnitus')]: clamp(Math.round(rnd() * 2), 0, 3),
        [id(me, 'Kälteempfinden')]: cold,
        [id(me, 'Raumtemperatur')]: temp,
      };
      if (cold >= 2) v[id(me, 'Wo kalt?')] = rnd() > 0.5 ? ['Hände', 'Füße'] : ['Füße'];
      push(me, atMinutes(day, (h?.wake ? Number(h.wake.slice(0, 2)) * 60 + Number(h.wake.slice(3)) : 400) + 15 + Math.floor(rnd() * 20)), v);
    }

    // Mahlzeiten als eigene Einträge – Beschwerden kommen (wie im echten Leben) später
    // als separater Eintrag. „Milchkaffee“ und „Linsensuppe“ sind im Beispiel Auslöser.
    // In den letzten 2 Wochen sind die Beschwerden deutlich schwächer.
    const recent = i < 14 ? -0.9 : 0.3;
    const meals = [7 * 60 + 30 + Math.floor(rnd() * 60), 12 * 60 + Math.floor(rnd() * 90), 18 * 60 + Math.floor(rnd() * 90)];
    for (const mealAt of meals) {
      if (rnd() < 0.25) continue; // nicht jede Mahlzeit wird eingetragen
      const food = [pick(FOODS), ...(rnd() > 0.5 ? [pick(FOODS)] : [])].filter((x, k, arr) => arr.indexOf(x) === k);
      const trigger = food.some((f) => f === 'Milchkaffee' || f === 'Linsensuppe');
      push(me, atMinutes(day, mealAt), {
        [id(me, 'Was ist passiert?')]: ['gegessen'],
        [id(me, 'Was gegessen?')]: food.join(', '),
      });
      // Danach: Bauch-Episode mit gewisser Wahrscheinlichkeit, nach Auslösern häufiger und stärker.
      if (rnd() > (trigger ? 0.15 : 0.6)) {
        const pain = clamp(Math.round(1 + (trigger ? 1.2 : 0) + recent + (slept < 6.5 ? 0.5 : 0) + (rnd() - 0.5)), 0, 3);
        if (pain === 0) continue;
        const start = mealAt + 45 + Math.floor(rnd() * 90);
        const dur = Math.round((30 + pain * 35 + rnd() * 40) / 5) * 5;
        const regions = rnd() > 0.5 ? ['6'] : rnd() > 0.5 ? ['1'] : ['1', '6'];
        const nausea = clamp(Math.round(pain * 0.6 + (rnd() - 0.5)), 0, 3);
        push(me, atMinutes(day, start), {
          [id(me, 'Bauchschmerz')]: pain,
          [id(me, 'Uhrzeit von–bis')]: { from: hhmm(start), to: hhmm(start + dur) },
          [id(me, 'Bezug zu Mahlzeiten')]: 'nach der Mahlzeit',
          [id(me, 'Lokalisation')]: regions,
          [id(me, 'Übelkeit')]: nausea === 0 && rnd() > 0.6 ? 0.5 : nausea,
          [id(me, 'Sodbrennen')]: clamp(Math.round(rnd() * 1.3), 0, 3),
          [id(me, 'Erbrechen')]: pain === 3 && rnd() > 0.6 ? 1 : 0,
          ...(rnd() > 0.9 ? { [id(me, 'Notiz')]: 'Stressiger Tag' } : {}),
        });
        // Bei stärkeren Schmerzen manchmal Buscopan – danach meist Besserung.
        if (pain >= 2 && rnd() > 0.35) {
          push(me, atMinutes(day, start + 15), {
            [id(me, 'Was ist passiert?')]: ['Medikament genommen'],
            [id(me, 'Medikamente')]: 'Buscopan 10 mg',
            [id(me, 'Bauchschmerz')]: pain,
          });
          push(me, atMinutes(day, start + 100 + Math.floor(rnd() * 40)), {
            [id(me, 'Bauchschmerz')]: clamp(pain - 1 - (rnd() > 0.5 ? 1 : 0), 0, 3),
            [id(me, 'Übelkeit')]: clamp(nausea - 1, 0, 3),
          });
        }
      }
    }
    // Gelegentlich Beschwerden unabhängig vom Essen oder morgens nüchtern – schwächer.
    if (rnd() > 0.75) {
      const at = 10 * 60 + Math.floor(rnd() * 8 * 60);
      push(me, atMinutes(day, at), {
        [id(me, 'Bauchschmerz')]: clamp(Math.round(0.6 + recent * 0.5 + rnd() * 0.8), 0, 3),
        [id(me, 'Bezug zu Mahlzeiten')]: rnd() > 0.5 ? 'unabhängig' : 'vor der Mahlzeit (noch nichts gegessen)',
        [id(me, 'Stuhlgang')]: clamp(Math.round(2 + (rnd() - 0.4) * 2), 0, 4),
      });
    }

    const sets = rnd() > 0.3 ? 1 + Math.floor(rnd() * 3) : 0;
    for (let s = 0; s < sets; s++) {
      const base = 15 + (days - i) * 0.25;
      push(pushups, atMinutes(day, 7 * 60 + s * 300 + Math.floor(rnd() * 120)), {
        [id(pushups, 'Anzahl')]: Math.round(base + (rnd() - 0.5) * 10),
        [id(pushups, 'Trainingsdauer')]: Math.round(3 + rnd() * 5),
      });
    }
  }
  for (const t of trackers) t.demo = true;
  me.name = 'Mein Befinden (Demo)';
  pushups.name = 'Liegestütze (Demo)';
  return { trackers, entries, health };
}
