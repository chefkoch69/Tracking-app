import { addDays, atMinutes, dayKey, startOfDay } from './dates';
import { uid } from './id';
import { TEMPLATES, trackerFromTemplate } from './templates';
import { demoHealth } from './health';
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

    // Bauch-Episode an ~60 % der Tage, meist nach dem Essen; in den letzten 2 Wochen besser.
    if (rnd() > 0.4) {
      const after = rnd() > 0.45;
      const meds = rnd() > 0.65;
      const food = [pick(FOODS), pick(FOODS)];
      const coffee = food.includes('Milchkaffee');
      const recent = i < 14 ? -0.9 : 0.4; // Beispiel: in den letzten 2 Wochen deutlich besser
      const pain = clamp(Math.round(1 + (after ? 1 : 0) + (coffee ? 0.6 : 0) + recent + (slept < 6.5 ? 0.6 : 0) - (meds ? 0.8 : 0) + (rnd() - 0.5)), 0, 3);
      const start = 11 * 60 + Math.floor(rnd() * 8) * 60;
      const dur = Math.round((30 + pain * 40 + rnd() * 40) / 5) * 5;
      const regions = rnd() > 0.5 ? ['6'] : rnd() > 0.5 ? ['1'] : ['1', '6'];
      if (rnd() > 0.85) regions.push('4');
      const nausea = clamp(Math.round(pain * 0.6 + (rnd() - 0.5)), 0, 3);
      const v: Record<string, FieldValue> = {
        [id(me, 'Bauchschmerz')]: pain,
        [id(me, 'Uhrzeit von–bis')]: { from: hhmm(start), to: hhmm(start + dur) },
        [id(me, 'Bezug zu Mahlzeiten')]: after ? 'nach der Mahlzeit' : rnd() > 0.5 ? 'während der Mahlzeit' : 'unabhängig',
        [id(me, 'Lokalisation')]: regions,
        [id(me, 'Übelkeit')]: nausea === 0 && rnd() > 0.6 ? 0.5 : nausea,
        [id(me, 'Sodbrennen')]: clamp(Math.round(rnd() * 1.3), 0, 3),
        [id(me, 'Erbrechen')]: pain === 3 && rnd() > 0.6 ? 1 : 0,
        [id(me, 'Stuhlgang')]: clamp(Math.round(2 + (rnd() - 0.4) * 2), 0, 4),
      };
      if (after) {
        v[id(me, 'Was ist passiert?')] = ['gegessen'];
        v[id(me, 'Was gegessen?')] = food.join(', ');
      }
      if (meds) v[id(me, 'Medikamente')] = 'Buscopan 10 mg';
      if (rnd() > 0.9) v[id(me, 'Notiz')] = 'Stressiger Tag';
      push(me, atMinutes(day, start + dur), v);
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
