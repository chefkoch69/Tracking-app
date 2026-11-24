import { useEffect } from 'react';
import { TEMPLATES } from '../core/templates';
import { applyUpgrades, hasUpgrades, templateUpgrades } from '../core/trackerEdit';
import { useStore } from '../state/store';
import { useSyncStatus } from './cloudSync';

const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');

/**
 * Hält „Mein Befinden“ auf dem Stand der Vorlage: neue Felder, Abschnitte und aufklappende
 * Details kommen automatisch dazu – Einträge und eigene Felder bleiben unverändert.
 * Erst, wenn der Abgleich mit dem Online-Speicher steht (sonst würde ein alter Stand hochgeladen).
 */
export function useAutoUpgrade() {
  const { data, dispatch } = useStore();
  const sync = useSyncStatus();
  const ready = sync.status === 'synced' || sync.status === 'local';
  useEffect(() => {
    if (!ready) return;
    const tpl = TEMPLATES.find((t) => t.key === 'now')!.build();
    for (const t of data.trackers) {
      if (!t.quick || t.demo || t.archived) continue;
      const related = t.fields.filter((f) => tpl.fields.some((tf) => norm(tf.label) === norm(f.label))).length >= 3;
      if (!related) continue;
      const up = templateUpgrades(t, tpl);
      const rename = t.name === 'Befinden jetzt';
      if (!hasUpgrades(up) && !rename) continue;
      const next = applyUpgrades(t, up, tpl);
      dispatch({ type: 'tracker/save', tracker: rename ? { ...next, name: 'Mein Befinden', icon: t.icon === '⚡' ? '💙' : t.icon, color: '#2f63f0' } : next });
    }
  }, [data.trackers, ready, dispatch]);
}
