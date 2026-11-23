import { useMemo, useRef, useState } from 'react';
import { SymptomTrendCard } from './SymptomTrendCard';
import { entriesOf } from '../core/analytics';
import { addDays, dayKey, parseDayKey, startOfDay } from '../core/dates';
import { fmtLevel } from '../core/fieldTypes';
import { factorInsights, trendInsights } from '../core/insights';
import { inRange, reportText, symptomSummary } from '../core/report';
import { useStore } from '../state/store';
import { ReportActions } from './ReportActions';
import { ReportSheet } from './views/ReportSheet';
import { appointmentLabel, questionList } from '../core/feedback';
import { useDictation } from './useDictation';

/**
 * Arztbericht: alle (gewählten) Tracker eines Zeitraums auf einen Blick –
 * Übersicht je Symptom, Auffälligkeiten, Tagestabellen, Gesundheitsdaten.
 */
export function DoctorReport() {
  const { data, dispatch } = useStore();
  const today = dayKey(new Date());
  const [from, setFrom] = useState(() => dayKey(addDays(startOfDay(new Date()), -13)));
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState<'entries' | 'days'>('days');
  const withData = data.trackers.filter((t) => !t.archived && data.entries.some((e) => e.trackerId === t.id));
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set(withData.filter((t) => t.demo && withData.some((x) => !x.demo)).map((t) => t.id)));
  const [showHealth, setShowHealth] = useState(true);
  const [showInsights, setShowInsights] = useState(true);
  const sheet = useRef<HTMLElement>(null);

  const trackers = withData.filter((t) => !excluded.has(t.id));
  // Beispiel-Gesundheitsdaten nur zeigen, wenn auch Beispiel-Tracker im Bericht sind.
  const demoIncluded = trackers.some((t) => t.demo);
  const healthDays = Object.values(data.health ?? {})
    .filter((h) => h.date >= from && h.date <= to && (demoIncluded || h.source !== 'demo'))
    .sort((a, b) => a.date.localeCompare(b.date));
  const summary = useMemo(() => symptomSummary(trackers, data.entries, from, to), [trackers, data.entries, from, to]);
  const insights = useMemo(() => {
    if (!showInsights) return [];
    const ranged = inRange(data.entries, from, to);
    return [
      ...trackers.flatMap((t) => factorInsights(t, ranged).slice(0, 2)),
      ...trackers.flatMap((t) => trendInsights(t, data.entries, parseDayKey(to))),
    ]
      .filter((i, idx, arr) => arr.findIndex((x) => x.id === i.id) === idx)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 6);
  }, [showInsights, data, from, to, trackers]);
  const questions = questionList(data.profile?.questions);
  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const fmtDay = (k: string) => parseDayKey(k).toLocaleDateString('de-DE');

  return (
    <div className="page">
      <section className="hero-band compact no-print">
        <div className="hero-inner">
          <h1>Arztbericht</h1>
          <p className="hero-lead">Alle Daten eines Zeitraums auf einem Blatt – zum Ausdrucken, als Datei oder als Text.</p>
        </div>
      </section>

      <QuestionsCard />

      <div className="card no-print report-controls">
        <div className="controls">
          <label className="cfg-row">
            <span>Von</span>
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </label>
          <label className="cfg-row">
            <span>Bis</span>
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </label>
          <label className="cfg-row">
            <span>Name</span>
            <input value={data.profile?.name ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { name: e.target.value } })} />
          </label>
          <label className="cfg-row">
            <span>Geboren</span>
            <input type="date" value={data.profile?.birthdate ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { birthdate: e.target.value } })} />
          </label>
        </div>
        <div className="chips">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} className="chip small" onClick={() => { setFrom(dayKey(addDays(startOfDay(new Date()), -(d - 1)))); setTo(today); }}>letzte {d} Tage</button>
          ))}
        </div>
        <div className="report-options">
          <span className="muted small">Enthalten:</span>
          {withData.map((t) => (
            <label key={t.id} className="switch small">
              <input type="checkbox" checked={!excluded.has(t.id)} onChange={() => toggle(t.id)} />
              <span>{t.icon} {t.name}</span>
            </label>
          ))}
          <label className="switch small">
            <input type="checkbox" checked={showHealth} onChange={(e) => setShowHealth(e.target.checked)} />
            <span>❤️ Gesundheitsdaten</span>
          </label>
          <label className="switch small">
            <input type="checkbox" checked={showInsights} onChange={(e) => setShowInsights(e.target.checked)} />
            <span>✦ Auffälligkeiten</span>
          </label>
          <span className="seg">
            <button className={mode === 'days' ? 'active' : ''} onClick={() => setMode('days')}>Tageswerte</button>
            <button className={mode === 'entries' ? 'active' : ''} onClick={() => setMode('entries')}>jeder Eintrag</button>
          </span>
        </div>
        <ReportActions
          title={`Symptomtagebuch ${fmtDay(from)}–${fmtDay(to)}`}
          filename={`Arztbericht-${from}-bis-${to}`}
          sheet={sheet}
          text={() => reportText(trackers, data.entries, showHealth ? data.health : undefined, from, to, data.profile)}
        />
      </div>

      <article className="report card" ref={sheet}>
        <header className="report-head">
          <h2>Symptomtagebuch</h2>
          <div className="report-meta">
            <span>Name: <b>{data.profile?.name || '________________'}</b></span>
            <span>geboren: <b>{data.profile?.birthdate ? fmtDay(data.profile.birthdate) : '__________'}</b></span>
            <span>Zeitraum: <b>{fmtDay(from)} – {fmtDay(to)}</b></span>
          </div>
        </header>

        {questions.length > 0 && (
          <section className="report-section report-questions">
            <h3>Meine Fragen</h3>
            <ol>
              {questions.map((q, i) => <li key={i}>{q}</li>)}
            </ol>
          </section>
        )}

        {summary.length > 0 && (
          <section className="report-section">
            <h3>Übersicht</h3>
            <div className="report-table-wrap">
              <table className="report-table summary-table">
                <thead>
                  <tr>
                    <th>Beschwerde / Messwert</th>
                    <th>Tage mit Beschwerden</th>
                    <th>Ø Tageshöchstwert</th>
                    <th>Höchstwert</th>
                    <th>ggü. Zeitraum davor</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r) => (
                    <tr key={`${r.tracker.id}-${r.field.id}`}>
                      <th>
                        {r.label} <small>{trackers.length > 1 ? `(${r.tracker.name.replace(/\s*\(Demo\)$/, '')})` : ''}</small>
                      </th>
                      <td>{r.daysWith} von {r.daysTracked}</td>
                      <td>{fmtLevel(Math.round((r.avg ?? 0) * 10) / 10)}{r.unit ? ` ${r.unit}` : ''}</td>
                      <td>{fmtLevel(r.max ?? 0)}{r.unit ? ` ${r.unit}` : ''}</td>
                      <td className={r.trend ? `trend ${r.trend}` : ''}>
                        {r.trend === 'better' ? '▼ besser' : r.trend === 'worse' ? '▲ schlechter' : r.trend === 'same' ? '= gleich' : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">„Tage mit Beschwerden“: Tage mit einem Wert über dem Skalenminimum, bezogen auf die Tage, an denen der Wert erfasst wurde.</p>
          </section>
        )}

        {insights.length > 0 && (
          <section className="report-section">
            <h3>Auffälligkeiten</h3>
            <ul className="report-insights">
              {insights.map((i) => (
                <li key={i.id}><b>{i.title}</b> – {i.detail}</li>
              ))}
            </ul>
            <p className="muted small">Automatisch aus den Einträgen berechnete Beobachtungen, keine Diagnose.</p>
          </section>
        )}

        {trackers.map((t) => {
          const es = inRange(entriesOf(t, data.entries), from, to);
          if (!es.length) return null;
          return (
            <section key={t.id} className="report-section">
              <h3>{t.icon} {t.name.replace(/\s*\(Demo\)$/, '')} <small className="muted">· {es.length} Einträge</small></h3>
              <SymptomTrendCard
                tracker={t}
                compact
                title="Verlauf der Beschwerden"
                end={parseDayKey(to)}
                days={Math.min(31, Math.max(7, Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86400000) + 1))}
              />
              <ReportSheet tracker={t} entries={es} mode={mode} />
            </section>
          );
        })}

        {showHealth && healthDays.length > 0 && (
          <section className="report-section">
            <h3>❤️ Gesundheitsdaten</h3>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Tag</th><th>Aufgestanden</th><th>Schlaf</th><th>Schritte</th>
                    {healthDays.some((h) => h.exerciseMin !== undefined || h.activeKcal !== undefined) && <th>Bewegung</th>}
                    {healthDays.some((h) => h.weight !== undefined) && <th>Gewicht</th>}
                    {healthDays.some((h) => h.bodyFat !== undefined) && <th>Körperfett</th>}
                    <th>Ruhepuls</th>
                  </tr>
                </thead>
                <tbody>
                  {healthDays.map((h) => (
                    <tr key={h.date}>
                      <th>{parseDayKey(h.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</th>
                      <td>{h.wake ?? '–'}</td>
                      <td>{h.sleepHours !== undefined ? `${fmtLevel(h.sleepHours)} h` : '–'}</td>
                      <td>{h.steps?.toLocaleString('de-DE') ?? '–'}</td>
                      {healthDays.some((x) => x.exerciseMin !== undefined || x.activeKcal !== undefined) && (
                        <td>{[h.exerciseMin !== undefined && `${h.exerciseMin} min`, h.activeKcal !== undefined && `${h.activeKcal} kcal`].filter(Boolean).join(' · ') || '–'}</td>
                      )}
                      {healthDays.some((x) => x.weight !== undefined) && <td>{h.weight !== undefined ? `${fmtLevel(h.weight)} kg` : '–'}</td>}
                      {healthDays.some((x) => x.bodyFat !== undefined) && <td>{h.bodyFat !== undefined ? `${fmtLevel(h.bodyFat)} %` : '–'}</td>}
                      <td>{h.restingHr ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!trackers.some((t) => inRange(entriesOf(t, data.entries), from, to).length) && <p className="muted">Keine Einträge im gewählten Zeitraum.</p>}
        <p className="report-foot muted small">Erstellt am {new Date().toLocaleDateString('de-DE')} mit „Build Your Own Tracker“. Selbst erfasste Angaben.</p>
      </article>
    </div>
  );
}

/** Termin und Fragen – damit beim Arzt nichts vergessen wird. Fragen stehen oben im Bericht. */
function QuestionsCard() {
  const { data, dispatch } = useStore();
  const today = dayKey(new Date());
  const q = data.profile?.questions ?? '';
  const set = (questions: string) => dispatch({ type: 'profile/update', patch: { questions } });
  const dict = useDictation((piece) => set(`${q}${q && !q.endsWith('\n') ? '\n' : ''}${piece.trim()}`));
  const date = data.profile?.appointment;
  return (
    <section className="card no-print questions-card">
      <div className="questions-head">
        <h2>Termin & Fragen</h2>
        <label className="appt-date">
          <span>Termin</span>
          <input type="date" value={date ?? ''} min={date && date < today ? undefined : today} onChange={(e) => dispatch({ type: 'profile/update', patch: { appointment: e.target.value || undefined } })} />
        </label>
        {date && <span className="pill">{appointmentLabel(date, new Date())}</span>}
      </div>
      <label htmlFor="questions" className="muted small">Was möchtest du fragen? Eine Frage pro Zeile – sie stehen oben im Bericht.</label>
      <textarea
        id="questions"
        rows={4}
        value={q}
        placeholder={'z. B. Kann es eine Unverträglichkeit sein?\nWarum bin ich nach dem Essen so erschöpft?'}
        onChange={(e) => set(e.target.value)}
      />
      {dict.available && (
        <div className="actions">
          <button type="button" className={`btn small mic ${dict.listening ? 'on' : ''}`} onClick={() => (dict.listening ? dict.stop() : dict.start())}>
            {dict.listening ? '■ Stopp' : '🎙 Frage diktieren'}
          </button>
        </div>
      )}
    </section>
  );
}
