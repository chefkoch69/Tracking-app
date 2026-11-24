import type { Insight } from '../../core/analysis/insights';
import type { Readiness } from '../../core/diary/feedback';
import { useStore } from '../../state/store';
import { navigate } from '../../app/router';

const KIND_ICON: Record<Insight['kind'], string> = {
  trend: '↗',
  correlation: '⇄',
  factor: '✦',
};

/** Die Fragen, die man sich selbst stellt – in dieser Reihenfolge. */
const GROUPS: { key: string; title: string; test: (i: Insight) => boolean }[] = [
  { key: 'bad', title: 'Mögliche Auslöser', test: (i) => i.kind === 'factor' && i.tone === 'bad' },
  { key: 'good', title: 'Was geholfen hat', test: (i) => i.kind === 'factor' && i.tone === 'good' },
  { key: 'trend', title: 'Wie es sich entwickelt', test: (i) => i.kind === 'trend' },
  { key: 'rest', title: 'Was zusammenhängt', test: () => true },
];

function InsightItem({ i, showTracker }: { i: Insight; showTracker: boolean }) {
  const { data } = useStore();
  const t = data.trackers.find((x) => x.id === i.trackerId);
  return (
    <button className={`insight ${i.tone}`} onClick={() => t && navigate(`/t/${t.id}/${i.kind === 'correlation' ? 'compare' : 'stats'}`)}>
      <span className="insight-icon" aria-hidden>{KIND_ICON[i.kind]}</span>
      <span className="insight-body">
        <strong>{i.title}</strong>
        <small>
          {showTracker && t && t.demo ? `${t.icon} ${t.name} · ` : ''}
          {i.detail}
        </small>
      </span>
      <span className="insight-metric">{i.metric}</span>
    </button>
  );
}

export function InsightList({ insights, showTracker = false, grouped = false }: { insights: Insight[]; showTracker?: boolean; grouped?: boolean }) {
  const sections = GROUPS.map((g) => ({ ...g, items: [] as Insight[] }));
  for (const i of insights) sections.find((g) => g.test(i))!.items.push(i);
  const used = sections.filter((s) => s.items.length);
  return (
    <div className="insights">
      {grouped && used.length > 1
        ? used.map((s) => (
            <div key={s.key} className="insight-group">
              <h3 className="insight-group-title">{s.title}</h3>
              {s.items.map((i) => <InsightItem key={i.id} i={i} showTracker={showTracker} />)}
            </div>
          ))
        : insights.map((i) => <InsightItem key={i.id} i={i} showTracker={showTracker} />)}
      <p className="muted small disclaimer">Beobachtungen aus deinen Einträgen – kein Beweis für Ursache und Wirkung und keine medizinische Bewertung.</p>
    </div>
  );
}

/** Solange es noch zu wenig Daten gibt: zeigen, wie weit es noch ist. */
export function InsightReadiness({ readiness }: { readiness: Readiness }) {
  const left = Math.max(0, readiness.need - readiness.days);
  return (
    <div className="readiness">
      <div className="readiness-bar" role="progressbar" aria-valuemin={0} aria-valuemax={readiness.need} aria-valuenow={Math.min(readiness.days, readiness.need)}>
        <span style={{ width: `${Math.min(100, (readiness.days / readiness.need) * 100)}%` }} />
      </div>
      <p>
        <b>{readiness.days} von {readiness.need} Tagen</b>
        {left > 0 ? ` – noch ${left} ${left === 1 ? 'Tag' : 'Tage'} mit Einträgen, dann zeigt die App hier erste Muster.` : ' – noch keine deutlichen Muster. Trag weiter ein, besonders Essen, Medikamente und wie es dir danach geht.'}
      </p>
      <p className="muted small">Hier erscheint zum Beispiel: mögliche Auslöser („Nach Milchkaffee: Bauchschmerz stärker“), was geholfen hat und wie sich Beschwerden entwickeln.</p>
    </div>
  );
}
