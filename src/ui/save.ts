import { download } from '../core/storage';
import { claudeUse, hasClaudeRuntime } from './claudeRuntime';

export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

/**
 * Datei speichern: in der claude.ai-Vorschau über den Baustein "downloads"
 * (mit Bestätigung), sonst als normaler Browser-Download.
 */
export async function saveFile(filename: string, content: string, mime: string): Promise<SaveOutcome> {
  if (hasClaudeRuntime()) {
    const d = await claudeUse('downloads');
    if (!d) return 'unavailable';
    try {
      await d.save({ filename, data: content });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  download(filename, content, mime);
  return 'saved';
}

/** Text in die Zwischenablage; false, wenn das hier nicht erlaubt ist. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Alle Stylesheets der Seite als Text – damit ein exportierter Bericht gleich aussieht. */
export function collectCss(): string {
  return Array.from(document.styleSheets)
    .map((s) => {
      try {
        return Array.from(s.cssRules).map((r) => r.cssText).join('\n');
      } catch {
        return '';
      }
    })
    .join('\n');
}

/** Eigenständige HTML-Datei aus einem Bericht-Element (hell, druckfertig). */
export function standaloneHtml(title: string, element: HTMLElement): string {
  const esc = (s: string) => s.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
  return `<!doctype html><html lang="de" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${collectCss()}
body{background:#fff;padding:16px}.report{box-shadow:none;border:0}.no-print{display:none!important}</style></head><body><main>${element.outerHTML}</main></body></html>`;
}
