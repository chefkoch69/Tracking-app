import { useEffect } from 'react';
import { dayKey } from '../core/model/dates';
import { useStore } from '../state/store';

/**
 * Erinnerungen aufs Handy (Web Push, iPhone ab iOS 16.4 als Home-Bildschirm-App) und eine Zahl
 * am App-Symbol, solange heute noch nichts eingetragen ist.
 */

export interface PushState {
  publicKey: string | null;
  devices: number;
  times: string[];
  enabled?: boolean;
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function loadPush(): Promise<PushState | null> {
  try {
    const r = await fetch('/api/push', { credentials: 'same-origin' });
    return r.ok ? ((await r.json()) as PushState) : null;
  } catch {
    return null;
  }
}

function keyBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Muss direkt aus einem Tipp aufgerufen werden (iPhone fragt sonst nicht nach Erlaubnis). */
export async function enablePush(publicKey: string, times: string[]): Promise<'ok' | 'denied' | 'error'> {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
    const r = await fetch('/api/push', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), times, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: true }),
    });
    return r.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function savePushSettings(patch: { times?: string[]; enabled?: boolean }): Promise<boolean> {
  const r = await fetch('/api/push', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null);
  return !!r?.ok;
}

export async function testPush(): Promise<number | null> {
  const r = await fetch('/api/push/test', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
  return r?.ok ? ((await r.json()) as { sent: number }).sent : null;
}

/** Zahl am App-Symbol: 1, solange heute nichts eingetragen ist. */
export function useAppBadge() {
  const { data } = useStore();
  const today = dayKey(new Date());
  const loggedToday = data.entries.some((e) => dayKey(new Date(e.timestamp)) === today) || !!data.days?.[today]?.mood;
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    if (loggedToday) void nav.clearAppBadge?.().catch(() => undefined);
    else if (new Date().getHours() >= 8) void nav.setAppBadge(1).catch(() => undefined);
  }, [loggedToday, today]);
}
