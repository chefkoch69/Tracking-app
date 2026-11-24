import { parseDayKey } from '../model/dates';
import { questionList } from '../diary/feedback';
import type { Insight } from './insights';
import { reportText } from './report';
import type { Entry, HealthDay, Profile, Tracker } from '../model/types';

/**
 * Arztzettel: Claude fasst einen Zeitraum des Tagebuchs auf einer Seite zusammen.
 * Der Prompt enthält nur die Einträge (als Textfassung des Berichts), die automatischen
 * Beobachtungen und die eigenen Fragen – und klare Regeln: nichts erfinden, keine Diagnosen.
 */
export function doctorSummaryPrompt(args: {
  trackers: Tracker[];
  entries: Entry[];
  health?: Record<string, HealthDay>;
  from: string;
  to: string;
  profile?: Profile;
  insights: Insight[];
}): string {
  const { trackers, entries, health, from, to, profile, insights } = args;
  const d = (k: string) => parseDayKey(k).toLocaleDateString('de-DE');
  // Ohne bisherige Zusammenfassung, damit Claude nicht die eigene alte Fassung abschreibt.
  const data = reportText(trackers, entries, health, from, to, { ...profile, summary: undefined });
  const questions = questionList(profile?.questions);
  const obs = insights.map((i) => `- ${i.title} (${i.detail})`).join('\n');
  return [
    'Du hilfst, einen Arzttermin vorzubereiten. Unten steht ein selbst geführtes Symptomtagebuch.',
    `Schreibe daraus eine kurze, sachliche Zusammenfassung für die Ärztin bzw. den Arzt (Zeitraum ${d(from)} – ${d(to)}).`,
    '',
    'Regeln:',
    '- Verwende NUR Angaben aus den Daten unten. Nichts ergänzen, nichts schätzen, keine Normalwerte.',
    '- Keine Diagnosen, keine Vermutungen über Ursachen und keine Ratschläge. Zusammenhänge nur als „in den Einträgen beobachtet“.',
    '- Zahlen genau übernehmen (Tage, Stärken 0–3, Uhrzeiten, Dauern). Fehlt etwas, lass den Punkt weg.',
    '- Deutsch, Stichpunkte, höchstens etwa 250 Wörter. Klartext ohne Markdown-Zeichen (keine #, **, Tabellen); Aufzählungen mit „•“.',
    '',
    'Gliederung (Überschrift in einer eigenen Zeile, Abschnitte ohne Inhalt weglassen):',
    'Zeitraum & Datenbasis',
    'Hauptbeschwerden (wie oft, wie stark, wann am Tag, wie lange)',
    'Verlauf',
    'Beobachtungen aus den Einträgen (Essen, Medikamente und ihre Wirkung, Schlaf, Bewegung)',
    questions.length ? '(Die eigenen Fragen stehen separat im Bericht – nicht wiederholen.)' : '',
    '',
    'Automatische Beobachtungen der App (nur übernehmen, wenn sie zu den Daten passen):',
    obs || '- keine',
    '',
    'Tagebuch:',
    data,
  ]
    .join('\n');
}
