import { useEffect } from 'react';
import { parseHealthText } from '../core/health';
import { useStore } from '../state/store';
import { useSyncStatus } from './cloudSync';
import { IS_WORKER } from './env';

/**
 * Was der Apple-Health-Kurzbefehl an den Server geschickt hat, beim Öffnen (und beim
 * Zurückkehren in die App) übernehmen – danach aus dem Eingang löschen.
 */
export function useHealthInbox() {
  const { dispatch } = useStore();
  const sync = useSyncStatus();
  const ready = sync.status === 'synced';
  useEffect(() => {
    if (!IS_WORKER || !ready) return;
    let busy = false;
    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch('/api/health-inbox', { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return;
        const { items } = (await res.json()) as { items: { id: string; text: string }[] };
        for (const it of items) {
          const days = parseHealthText(it.text);
          if (days.length) dispatch({ type: 'health/upsert', days: days.map((d) => ({ ...d, source: 'health' })) });
          await fetch(`/api/health-inbox?id=${encodeURIComponent(it.id)}`, { method: 'DELETE', credentials: 'same-origin' });
        }
      } catch {
        /* beim nächsten Mal */
      } finally {
        busy = false;
      }
    };
    void pull();
    const onVis = () => document.visibilityState === 'visible' && void pull();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [ready, dispatch]);
}
