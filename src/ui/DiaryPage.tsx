import { useMemo, useState } from 'react';
import { withHealth } from '../core/health';
import { computeInsights } from '../core/insights';
import { insightReadiness } from '../core/feedback';
import { InsightList, InsightReadiness } from './Insights';
import { SymptomTrendCard } from './SymptomTrendCard';
import { dayKey, formatDay, parseDayKey } from '../core/dates';
import { fmtLevel, scaleLevels, severity } from '../core/fieldTypes';
import type { Entry, Tracker } from '../core/types';
import { useStore } from '../state/store';
import { DataTable } from './DataTable';
import { navigate } from './router';
import { EntryCard } from './views/shared';

const DAYS = 14;

function dayTitle(key: string): string {
  const today = dayKey(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return 'Heute';
  if (key === dayKey(y)) return 'Gestern';
  return formatDay(parseDayKey(key));
}

/** Stärkste Beschwerde eines Tages, z. B. „Bauchschmerz 2 · mittel“. */
function worstOfDay(items: { e: Entry; t: Tracker }[]): string | null {
  let best: { label: string; v: number; sev: number; text: string } | null = null;
  for (const { e, t } of items) {
    for (const f of t.fields) {
      if (f.type !== 'scale') continue;
      const v = e.values[f.id];
      if (typeof v !== 'number') continue;
      const sev = severity(f, v);
      if (sev === null || sev === 0) continue;
      if (!best || sev > best.sev) {
        const l = scaleLevels(f.config).find((x) => x.value === v)?.label;
        best = { label: f.label, v, sev, text: l ? `${fmtLevel(v)} · ${l}` : fmtLevel(v) };
      }
    }
  }
  return best ? `am stärksten: ${best.label} ${best.text}` : null;
}

/**
 * Tagebuch: alles, was du eingetragen hast – Tag für Tag, neueste zuerst. Zum Nachsehen und
 * Korrigieren. Die Tabelle (suchen, sortieren, exportieren) ist eine Ansicht davon.
 */
export function DiaryPage() {
  const { data } = useStore();
  const [view, setView] = useState<'list' | 'patterns' | 'table'>('list');
  const insights = useMemo(() => {
    const all = withHealth(data);
    return computeInsights(all.trackers, all.entries, new Date());
  }, [data]);
  const main = data.trackers.find((t) => t.quick && !t.demo && !t.archived) ?? data.trackers.find((t) => t.quick && !t.archived);
  const [days, setDays] = useState(DAYS);
  const trackers = data.trackers.filter((t) => !t.archived);
  const items = data.entries
    .flatMap((e) => {
      const t = trackers.find((x) => x.id === e.trackerId);
      return t ? [{ e, t }] : [];
    })
    .sort((a, b) => b.e.timestamp.localeCompare(a.e.timestamp));
  const groups = new Map<string, { e: Entry; t: Tracker }[]>();
  for (const it of items) {
    const k = dayKey(new Date(it.e.timestamp));
    if (!groups.has(k) && groups.size >= days) break;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const allDays = new Set(items.map((it) => dayKey(new Date(it.e.timestamp)))).size;
  const several = new Set(items.map((it) => it.t.id)).size > 1;

  return (
    <div className="page">
      <section className="hero-band compact">
        <div className="hero-inner">
          <h1>Verlauf</h1>
          <p className="hero-lead">Dein Tagebuch Tag für Tag, wie sich Beschwerden entwickeln und was auffällt.</p>
        </div>
      </section>

      <div className="seg view-switch" role="tablist" aria-label="Ansicht">
        <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Tage</button>
        <button role="tab" aria-selected={view === 'patterns'} className={view === 'patterns' ? 'active' : ''} onClick={() => setView('patterns')}>Was auffällt</button>
        <button role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Tabelle</button>
      </div>

      {view === 'table' ? (
        <DataTable />
      ) : view === 'patterns' ? (
        <>
          {main && <SymptomTrendCard tracker={main} />}
          <section className="card">
            <div className="section-head">
              <h2>Was auffällt</h2>
              <small className="muted">aus deinen Einträgen</small>
            </div>
            {insights.length > 0 ? <InsightList insights={insights} showTracker grouped /> : <InsightReadiness readiness={insightReadiness(data.trackers, data.entries, new Date())} />}
          </section>
        </>
      ) : !items.length ? (
        <div className="card empty">
          <div className="empty-icon">📓</div>
          <p>Noch keine Einträge. Was du unter „Eintragen“ speicherst, steht hier – Tag für Tag.</p>
          <button className="btn primary" onClick={() => navigate('/now')}>Jetzt eintragen</button>
        </div>
      ) : (
        <div className="history diary">
          {[...groups].map(([k, es]) => {
            const worst = worstOfDay(es);
            return (
              <section key={k} className="day-group">
                <h3 className="day-head">
                  {dayTitle(k)}{' '}
                  <small className="muted">
                    {es.length} {es.length === 1 ? 'Eintrag' : 'Einträge'}
                    {worst ? ` · ${worst}` : ''}
                  </small>
                </h3>
                <div className="timeline-rail">
                  {es.map(({ e, t }) => (
                    <div key={e.id}>
                      {several && <small className="diary-tracker">{t.icon} {t.name}</small>}
                      <EntryCard tracker={t} entry={e} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {allDays > groups.size && (
            <button className="btn ghost show-more" onClick={() => setDays((d) => d + DAYS)}>
              Ältere Tage anzeigen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
