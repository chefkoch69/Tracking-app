import { useEffect, useState } from 'react';
import { formatClock } from '../core/dates';
import { dueSlot, reminderToFire, slotKey } from '../core/schedule';
import type { Tracker } from '../core/types';
import { useStore } from '../state/store';

/**
 * Löst Benachrichtigungen aus, solange die App geöffnet ist (auch im
 * Hintergrund-Tab). Für echte Push-Benachrichtigungen bei geschlossener
 * App wäre ein Server (Web Push) oder eine native Hülle nötig.
 */

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

async function show(tracker: Tracker, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const opts: NotificationOptions = { body, tag: `tracker-${tracker.id}`, data: { url: `#/t/${tracker.id}/entry` } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(`${tracker.icon} ${tracker.name}`, opts);
      return;
    }
  } catch {
    /* Fallback unten */
  }
  const n = new Notification(`${tracker.icon} ${tracker.name}`, opts);
  n.onclick = () => {
    window.focus();
    window.location.hash = `/t/${tracker.id}/entry`;
  };
}

/** Taktgeber: aktualisiert "jetzt" regelmäßig. */
export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    const vis = () => setNow(new Date());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [intervalMs]);
  return now;
}

export function useReminderEngine() {
  const { data, dispatch } = useStore();
  const now = useNow(20000);
  useEffect(() => {
    for (const t of data.trackers) {
      const decision = reminderToFire(t, data.entries, data.reminders[t.id], now);
      if (!decision) continue;
      dispatch({ type: 'reminder/update', trackerId: t.id, patch: { lastFiredKey: decision.key } });
      const body =
        decision.attempt > 0
          ? `Erinnerung (${decision.attempt}. Wiederholung): Eintrag für ${formatClock(decision.slot)} ist noch offen.`
          : `Zeit für deinen Eintrag (${formatClock(decision.slot)}).`;
      void show(t, body);
    }
  }, [now, data.trackers, data.entries, data.reminders, dispatch]);
}

/** Alle aktuell fälligen Tracker (für Banner im Dashboard). */
export function useDueTrackers(now: Date) {
  const { data } = useStore();
  return data.trackers.flatMap((t) => {
    const due = dueSlot(t, data.entries, now);
    if (!due) return [];
    const st = data.reminders[t.id];
    const key = slotKey(due.slot);
    if (st?.skippedSlot === key) return [];
    const snoozedUntil = st?.snooze?.slot === key ? new Date(st.snooze.until) : null;
    return [{ tracker: t, slot: due.slot, snoozedUntil: snoozedUntil && snoozedUntil > now ? snoozedUntil : null }];
  });
}
