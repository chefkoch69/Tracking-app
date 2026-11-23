import type { Insight } from '../core/insights';
import { useStore } from '../state/store';
import { navigate } from './router';

const KIND_ICON: Record<Insight['kind'], string> = {
  trend: '↗',
  correlation: '⇄',
  factor: '✦',
};

export function InsightList({ insights, showTracker = false }: { insights: Insight[]; showTracker?: boolean }) {
  const { data } = useStore();
  return (
    <div className="insights">
      {insights.map((i) => {
        const t = data.trackers.find((x) => x.id === i.trackerId);
        return (
          <button key={i.id} className={`insight ${i.tone}`} onClick={() => t && navigate(`/t/${t.id}/${i.kind === 'correlation' ? 'compare' : 'stats'}`)}>
            <span className="insight-icon">{KIND_ICON[i.kind]}</span>
            <span className="insight-body">
              <strong>{i.title}</strong>
              <small>
                {showTracker && t ? `${t.icon} ${t.name} · ` : ''}
                {i.detail}
              </small>
            </span>
            <span className="insight-metric">{i.metric}</span>
          </button>
        );
      })}
      <p className="muted small disclaimer">Beobachtungen aus deinen Daten – kein Beweis für Ursache und Wirkung und keine medizinische Bewertung.</p>
    </div>
  );
}
