/**
 * Automatisch auf dem neuesten Stand: Am iPhone bleibt eine Home-Bildschirm-App oft tagelang
 * im Speicher und lädt nie neu. Darum prüft die App beim Zurückkehren (und alle 30 Minuten),
 * ob es eine neue Version gibt, und lädt dann selbst neu – aber nie, während du tippst.
 */

const CHECK_EVERY = 30 * 60 * 1000;

/** Name der Haupt-Skriptdatei, z. B. „index-AbC123.js“ – ändert sich mit jeder Version. */
function scriptName(html: string): string | null {
  return html.match(/assets\/(index-[\w-]+\.js)/)?.[1] ?? null;
}

function current(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  return s ? scriptName(s.src) : null;
}

function busy(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
}

let last = 0;
async function check() {
  if (Date.now() - last < 60 * 1000) return;
  last = Date.now();
  const mine = current();
  if (!mine) return;
  try {
    const res = await fetch('./', { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' });
    if (!res.ok) return;
    const latest = scriptName(await res.text());
    if (latest && latest !== mine && !busy()) window.location.reload();
  } catch {
    /* offline – später nochmal */
  }
}

export function startAutoUpdate() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('focus', () => void check());
  window.setInterval(() => document.visibilityState === 'visible' && void check(), CHECK_EVERY);
}
