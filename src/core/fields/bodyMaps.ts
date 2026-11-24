import type { BodyMapKind } from '../model/types';

/**
 * Lokalisationsschemata. Ansicht immer von vorne: die rechte Körperseite
 * erscheint links im Bild (wie im ärztlichen Lokalisationsschema).
 */
export interface BodyRegion {
  id: string;
  label: string;
  /** Kurzbezeichnung für Tabellen/Berichte. */
  short: string;
}

export const BODY_MAPS = {
  abdomen: {
    label: 'Bauch (6 Regionen)',
    regions: [
      { id: '1', short: '1', label: 'Oberbauch Mitte' },
      { id: '2', short: '2', label: 'Oberbauch rechts' },
      { id: '3', short: '3', label: 'Oberbauch links' },
      { id: '4', short: '4', label: 'Unterbauch rechts' },
      { id: '5', short: '5', label: 'Unterbauch links' },
      { id: '6', short: '6', label: 'Nabelregion' },
    ],
  },
  body: {
    label: 'Ganzer Körper',
    regions: [
      { id: 'head', short: 'Kopf', label: 'Kopf' },
      { id: 'neck', short: 'Hals', label: 'Hals/Nacken' },
      { id: 'shoulder-r', short: 'Sch. re', label: 'Schulter rechts' },
      { id: 'shoulder-l', short: 'Sch. li', label: 'Schulter links' },
      { id: 'chest', short: 'Brust', label: 'Brust' },
      { id: 'belly', short: 'Bauch', label: 'Bauch' },
      { id: 'pelvis', short: 'Becken', label: 'Becken/Leiste' },
      { id: 'arm-r', short: 'Arm re', label: 'Arm rechts' },
      { id: 'arm-l', short: 'Arm li', label: 'Arm links' },
      { id: 'hand-r', short: 'Hand re', label: 'Hand rechts' },
      { id: 'hand-l', short: 'Hand li', label: 'Hand links' },
      { id: 'thigh-r', short: 'OS re', label: 'Oberschenkel rechts' },
      { id: 'thigh-l', short: 'OS li', label: 'Oberschenkel links' },
      { id: 'knee-r', short: 'Knie re', label: 'Knie rechts' },
      { id: 'knee-l', short: 'Knie li', label: 'Knie links' },
      { id: 'leg-r', short: 'US re', label: 'Unterschenkel rechts' },
      { id: 'leg-l', short: 'US li', label: 'Unterschenkel links' },
      { id: 'foot-r', short: 'Fuß re', label: 'Fuß rechts' },
      { id: 'foot-l', short: 'Fuß li', label: 'Fuß links' },
    ],
  },
} as Record<BodyMapKind, { label: string; regions: BodyRegion[] }>;

export const HEAD_MAP = {
  label: 'Kopf',
  regions: [
    { id: 'stirn', short: 'Stirn', label: 'Stirn' },
    { id: 'augen', short: 'Augen', label: 'Augen / Nasenwurzel' },
    { id: 'schlaefe-r', short: 'Schl. re', label: 'Schläfe rechts' },
    { id: 'schlaefe-l', short: 'Schl. li', label: 'Schläfe links' },
    { id: 'kiefer', short: 'Kiefer', label: 'Kiefer / Gesicht' },
    { id: 'scheitel', short: 'Scheitel', label: 'Scheitel (oben)' },
    { id: 'hinterkopf', short: 'Hinterkopf', label: 'Hinterkopf' },
    { id: 'nacken', short: 'Nacken', label: 'Nacken' },
    { id: 'seite-r', short: 'einseitig re', label: 'ganze rechte Seite' },
    { id: 'seite-l', short: 'einseitig li', label: 'ganze linke Seite' },
    { id: 'ganz', short: 'ganz', label: 'ganzer Kopf' },
  ],
};
BODY_MAPS.head = HEAD_MAP;

export function regionLabel(kind: BodyMapKind, id: string): string {
  return BODY_MAPS[kind].regions.find((r) => r.id === id)?.label ?? id;
}
