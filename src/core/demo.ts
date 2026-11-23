import { addDays, atMinutes, dayKey, startOfDay } from './dates';
import { uid } from './id';
import { TEMPLATES, trackerFromTemplate } from './templates';
import { demoHealth } from './health';
import type { Entry, FieldValue, HealthDay, Tracker } from './types';

/** Erzeugt plausible Beispieldaten, um die Auswertungen auszuprobieren. */
export function generateDemo(days = 60, now = new Date()): { trackers: Tracker[]; entries: Entry[]; health: Record<string, HealthDay> } {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const tpl = (k: string) => trackerFromTemplate(TEMPLATES.find((t) => t.key === k)!);

  const morning = tpl('morning');
  const pushups = tpl('pushups');
  const belly = tpl('abdominal');
  const trackers = [belly, morning, pushups];
  const entries: Entry[] = [];
  const health = demoHealth(days, now, rnd);
  const byLabel = (t: Tracker, l: string) => t.fields.find((f) => f.label === l)!.id;

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(startOfDay(now), -i);
    if (i === 0 && now.getHours() < 7) continue;

    if (rnd() > 0.08) {
      const temp = Math.round((17 + rnd() * 5) * 2) / 2;
      const sleep = Math.round((5 + rnd() * 3.5) * 4) / 4;
      const tired = clamp(Math.round((8 - sleep) * 0.9 + (rnd() - 0.5) * 1.2), 0, 3);
      const cold = clamp(Math.round((21 - temp) * 0.7 + (rnd() - 0.5)), 0, 3);
      const v: Record<string, FieldValue> = {
        [byLabel(morning, 'Übelkeit')]: clamp(Math.round(rnd() * 1.6), 0, 3),
        [byLabel(morning, 'Bauchschmerzen')]: clamp(Math.round(rnd() * 1.4), 0, 3),
        [byLabel(morning, 'Erschöpfung')]: tired,
        [byLabel(morning, 'Kälteempfinden')]: cold,
        [byLabel(morning, 'Tinnitus')]: clamp(Math.round(rnd() * 2), 0, 3),
        [byLabel(morning, 'Schlafqualität')]: clamp(Math.round(sleep / 2.5 + (rnd() - 0.5)), 0, 3),
        [byLabel(morning, 'Schlafdauer')]: sleep,
        [byLabel(morning, 'Raumtemperatur')]: temp,
        [byLabel(morning, 'Luftfeuchtigkeit')]: Math.round(40 + rnd() * 25),
        [byLabel(morning, 'Besonderheiten')]: rnd() > 0.85 ? 'Unruhige Nacht' : '',
      };
      const t = atMinutes(day, 6 * 60 + 40 + Math.floor(rnd() * 25));
      entries.push({ id: uid(), trackerId: morning.id, timestamp: t.toISOString(), values: v });
    }

    // Bauchschmerztagebuch: an ~60 % der Tage eine Episode, in den letzten 2 Wochen besser.
    if (rnd() > 0.4) {
      const after = rnd() > 0.45;
      const meds = rnd() > 0.65;
      const recent = i < 14 ? -0.7 : 0;
      const slept = health[dayKey(day)]?.sleepHours ?? 7;
      const tired = slept < 6.5 ? 0.6 : 0;
      const pain = clamp(Math.round(1 + (after ? 1 : 0) + recent + tired - (meds ? 0.8 : 0) + (rnd() - 0.5)), 0, 3);
      const start = 11 * 60 + Math.floor(rnd() * 8) * 60;
      const dur = Math.round((30 + pain * 40 + rnd() * 40) / 5) * 5;
      const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const regions = rnd() > 0.5 ? ['6'] : rnd() > 0.5 ? ['1'] : ['1', '6'];
      if (rnd() > 0.85) regions.push('4');
      const when = atMinutes(day, start + dur);
      if (when <= now) {
        entries.push({
          id: uid(),
          trackerId: belly.id,
          timestamp: when.toISOString(),
          values: {
            [byLabel(belly, 'Bauchschmerz')]: pain,
            [byLabel(belly, 'Uhrzeit von–bis')]: { from: hhmm(start), to: hhmm(start + dur) },
            [byLabel(belly, 'Bezug zu Mahlzeiten')]: after ? 'nach der Mahlzeit' : rnd() > 0.5 ? 'während der Mahlzeit' : 'unabhängig',
            [byLabel(belly, 'Lokalisation')]: regions,
            [byLabel(belly, 'Übelkeit')]: clamp(Math.round(pain * 0.6 + (rnd() - 0.5)), 0, 3),
            [byLabel(belly, 'Sodbrennen')]: clamp(Math.round(rnd() * 1.3), 0, 3),
            [byLabel(belly, 'Erbrechen')]: pain === 3 && rnd() > 0.6 ? 1 : 0,
            [byLabel(belly, 'Stuhlgang')]: clamp(Math.round(2 + (rnd() - 0.4) * 2), 0, 4),
            [byLabel(belly, 'Medikamente')]: meds ? 'Buscopan 10 mg' : '',
            [byLabel(belly, 'Besonderheiten')]: rnd() > 0.9 ? 'Stressiger Tag' : '',
          },
        });
      }
    }

    const sets = rnd() > 0.3 ? 1 + Math.floor(rnd() * 3) : 0;
    for (let s = 0; s < sets; s++) {
      const base = 15 + (days - i) * 0.25;
      const t = atMinutes(day, 7 * 60 + s * 300 + Math.floor(rnd() * 120));
      if (t > now) continue;
      entries.push({
        id: uid(),
        trackerId: pushups.id,
        timestamp: t.toISOString(),
        values: {
          [byLabel(pushups, 'Anzahl')]: Math.round(base + (rnd() - 0.5) * 10),
          [byLabel(pushups, 'Trainingsdauer')]: Math.round(3 + rnd() * 5),
          [byLabel(pushups, 'Anmerkungen')]: '',
        },
      });
    }
  }
  for (const t of trackers) t.demo = true;
  belly.name = 'Bauchschmerztagebuch (Demo)';
  morning.name = 'Morgen-Check-in (Demo)';
  pushups.name = 'Liegestütze (Demo)';
  return { trackers, entries, health };
}
