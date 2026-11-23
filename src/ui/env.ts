/**
 * Build-Ziel. "artifact" = eingebettete Vorschau-Seite, in der Drucken,
 * Datei-Downloads und Systembenachrichtigungen blockiert sind.
 */
export const IS_ARTIFACT = import.meta.env.VITE_TARGET === 'artifact';
export const CAN_PRINT = !IS_ARTIFACT;
