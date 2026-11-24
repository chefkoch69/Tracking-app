/**
 * Zugriff auf die Laufzeit-Bausteine der claude.ai-Vorschau (nur dort vorhanden).
 * Außerhalb davon gibt es kein window.claude – alles fällt dann auf lokal zurück.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function claudeUse(name: string): Promise<Any | null> {
  const c = (window as Any).claude;
  if (!c || typeof c.use !== 'function') return Promise.resolve(null);
  try {
    return Promise.resolve(c.use(name)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

export const hasClaudeRuntime = () => typeof (window as Any).claude?.use === 'function';
