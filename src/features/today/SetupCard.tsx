import { useState } from 'react';
import { TEMPLATES } from '../../core/fields/templates';
import { setupState } from '../../core/fields/trackerEdit';
import { useStore } from '../../state/store';
import { askConfirm } from '../../components/confirm';

/**
 * „App startklar machen“: räumt Reste aus früheren Versionen und Ausprobier-Phasen
 * mit je einem Tipp auf (alter Check-in, separate Tracker, leere Tracker, Beispiele).
 */
export function SetupCard() {
  const { data, dispatch } = useStore();
  const [hidden, setHidden] = useState(false);
  const s = setupState(data.trackers, data.entries, TEMPLATES.find((t) => t.key === 'now')!.build());
  const quick = data.trackers.find((t) => t.quick && !t.demo);
  const steps = [
    s.upgrade && {
      key: 'up',
      text: <>„{s.upgrade.tracker.name}“ zu <b>„Mein Befinden“</b> erweitern – mit Essen, Bauch, Kälte und Abschnitten.</>,
      action: 'Erweitern',
      run: () => dispatch({ type: 'tracker/save', tracker: s.upgrade!.next }),
    },
    ...s.mergeable.map((t) => ({
      key: `m-${t.id}`,
      text: <><b>{t.name}</b> in „{quick?.name}“ übernehmen, damit alles an einem Ort ist.</>,
      action: 'Zusammenführen',
      run: () => quick && dispatch({ type: 'tracker/merge', sourceId: t.id, targetId: quick.id }),
    })),
    s.empty.length > 0 && {
      key: 'empty',
      text: <>Leere Tracker ohne Einträge entfernen: <b>{s.empty.map((t) => t.name).join(', ')}</b></>,
      action: 'Entfernen',
      run: async () => {
        if (await askConfirm(`${s.empty.map((t) => `„${t.name}“`).join(', ')} löschen? Sie haben keine Einträge.`, { okLabel: 'Löschen' }))
          s.empty.forEach((t) => dispatch({ type: 'tracker/delete', id: t.id }));
      },
    },
    s.demos.length > 0 && {
      key: 'demo',
      text: <>Beispieldaten entfernen ({s.demos.map((t) => t.name).join(', ')}) – damit Übersicht und Auswertungen nur deine Daten zeigen.</>,
      action: 'Entfernen',
      run: async () => {
        if (await askConfirm('Alle Beispiel-Tracker und ihre Einträge entfernen? Deine eigenen Daten bleiben.', { okLabel: 'Entfernen' })) dispatch({ type: 'demo/remove' });
      },
    },
  ].filter(Boolean) as { key: string; text: React.ReactNode; action: string; run: () => void }[];

  if (hidden || !steps.length) return null;
  return (
    <section className="card setup-card">
      <div className="section-head">
        <h2>App startklar machen</h2>
        <button className="btn ghost small" onClick={() => setHidden(true)}>Später</button>
      </div>
      <ol className="setup-steps">
        {steps.map((st) => (
          <li key={st.key}>
            <span>{st.text}</span>
            <button className="btn small primary" onClick={st.run}>{st.action}</button>
          </li>
        ))}
      </ol>
      <p className="muted small">Deine Einträge bleiben bei allen Schritten erhalten.</p>
    </section>
  );
}
