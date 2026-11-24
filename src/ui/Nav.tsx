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
    key: 'now',
    href: '#/now',
    label: 'Eintragen',
    match: ['now', 'entry'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 8.2v7.6M8.2 12h7.6" />
      </svg>
    ),
  },
  {
    key: 'dashboard',
    href: '#/',
    label: 'Übersicht',
    match: ['dashboard', 'tracker', 'edit', 'new'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M4.5 10.2 12 4l7.5 6.2V19a1 1 0 0 1-1 1H15v-5.5H9V20H5.5a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    key: 'doctor',
    href: '#/arzt',
    label: 'Arzttermin',
    match: ['doctor'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <rect x="4" y="5.5" width="16" height="14.5" rx="2.2" />
        <path d="M8 3.5v4M16 3.5v4M12 10.5v6M9 13.5h6" />
      </svg>
    ),
  },
  {
    key: 'data',
    href: '#/data',
    label: 'Tagebuch',
    match: ['data'],
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M6 4h11.5a1.5 1.5 0 0 1 1.5 1.5V20H7.5A2.5 2.5 0 0 1 5 17.5v-12A1.5 1.5 0 0 1 6.5 4z" />
        <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19M9 8h6M9 11h4" />
      </svg>
    ),
  },
  {
    key: 'more',
    href: '#/settings',
    label: 'Mehr',
    match: ['settings', 'health'],
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
          <a key={t.key} href={t.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
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
