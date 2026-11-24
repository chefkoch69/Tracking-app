import { useEffect } from 'react';
import type { Route } from './router';

/**
 * Hauptnavigation: oben als Leiste (breite Bildschirme), unten als Tab-Leiste (Handy).
 * Fünf feste Ziele – Eintragen steht vorne, weil es am häufigsten gebraucht wird.
 */

type Tab = { key: string; href: string; label: string; icon: React.ReactNode; match: Route['name'][] };

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const TABS: Tab[] = [
  {
    key: 'dashboard',
    href: '#/',
    label: 'Heute',
    match: ['dashboard'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
      </svg>
    ),
  },
  {
    key: 'data',
    href: '#/data',
    label: 'Verlauf',
    match: ['data'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4 19.5h16" />
        <path d="M5.5 15.5l4-4.5 3.5 3 5.5-6.5" />
      </svg>
    ),
  },
  {
    key: 'now',
    href: '#/now',
    label: 'Eintragen',
    match: ['now', 'entry'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2.4}>
        <path d="M12 5.5v13M5.5 12h13" />
      </svg>
    ),
  },
  {
    key: 'try',
    href: '#/try',
    label: 'Ausprobieren',
    match: ['try'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M9.5 3.5h5M10.5 3.5v6L5.2 18.3A1.5 1.5 0 0 0 6.5 20.5h11a1.5 1.5 0 0 0 1.3-2.2L13.5 9.5v-6" />
        <path d="M7.6 14.5h8.8" />
      </svg>
    ),
  },
  {
    key: 'more',
    href: '#/settings',
    label: 'Mehr',
    match: ['settings', 'health', 'doctor', 'tracker', 'edit', 'new'],
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5.5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="18.5" cy="12" r="1.8" />
      </svg>
    ),
  },
];

export function TopNav({ route }: { route: Route }) {
  return (
    <nav aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <a key={t.key} href={t.href} className={t.match.includes(route.name) ? 'active' : ''} aria-current={t.match.includes(route.name) ? 'page' : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}

export function TabBar({ route }: { route: Route }) {
  return (
    <nav className="tabbar no-print" aria-label="Hauptnavigation">
      {TABS.map((t) => {
        const active = t.match.includes(route.name);
        return (
          <a key={t.key} href={t.href} className={`${active ? 'active' : ''} ${t.key === 'now' ? 'tab-add' : ''}`} aria-current={active ? 'page' : undefined}>
            <span className="tab-icon" aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

/**
 * Solange ein Textfeld den Fokus hat (Tastatur offen), wird die Tab-Leiste ausgeblendet –
 * so bleibt „Speichern“ direkt über der Tastatur erreichbar. Wieder eingeblendet wird erst
 * nach dem Tippen: Würde sich das Layout zwischen Drücken und Loslassen verschieben,
 * landete der Tipp (z. B. auf „Speichern“) neben dem Knopf.
 */
export function useTypingClass() {
  useEffect(() => {
    const isField = (el: Element | null) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
      return el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color'].includes((el as HTMLInputElement).type);
    };
    let pointerDown = false;
    let timer = 0;
    const later = () => {
      if (pointerDown) {
        timer = window.setTimeout(later, 120);
        return;
      }
      if (!isField(document.activeElement)) document.body.classList.remove('typing');
    };
    const sync = () => {
      window.clearTimeout(timer);
      if (isField(document.activeElement)) document.body.classList.add('typing');
      else if (document.body.classList.contains('typing')) timer = window.setTimeout(later, 350);
    };
    const down = () => {
      pointerDown = true;
    };
    const up = () => {
      window.setTimeout(() => {
        pointerDown = false;
      }, 0);
    };
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', sync);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', sync);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.body.classList.remove('typing');
    };
  }, []);
}
