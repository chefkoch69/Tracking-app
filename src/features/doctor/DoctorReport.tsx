import { useEffect, useMemo, useRef, useState } from 'react';
import { SymptomTrendCard } from '../history/SymptomTrendCard';
import { entriesOf } from '../../core/analysis/analytics';
import { addDays, dayKey, parseDayKey, startOfDay } from '../../core/model/dates';
import { fmtLevel } from '../../core/fields/fieldTypes';
import { factorInsights, trendInsights } from '../../core/analysis/insights';
import { inRange, reportText, symptomSummary } from '../../core/analysis/report';
import { useStore } from '../../state/store';
import { ReportActions } from './ReportActions';
import { ReportSheet } from '../builder/views/ReportSheet';
import { appointmentLabel, questionList } from '../../core/diary/feedback';
import { useDictation } from '../../platform/useDictation';
import { doctorSummaryPrompt } from '../../core/analysis/doctorSummary';
import { claudeUse } from '../../platform/claudeRuntime';
import { copyText } from '../../platform/save';
import { notify } from '../../components/confirm';

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
          <h1>Arzttermin</h1>
          <p className="hero-lead">Alles für den Arztbesuch: Termin, deine Fragen, eine Zusammenfassung und der Bericht mit allen Einträgen.</p>
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

      <SummaryCard
        from={from}
        to={to}
        hasEntries={trackers.some((t) => inRange(entriesOf(t, data.entries), from, to).length > 0)}
        prompt={() =>
          doctorSummaryPrompt({ trackers, entries: data.entries, health: showHealth ? data.health : undefined, from, to, profile: data.profile, insights })
        }
      />

      <article className="report card" ref={sheet}>
        <header className="report-head">
          <h2>Symptomtagebuch</h2>
          <div className="report-meta">
            <span>Name: <b>{data.profile?.name || '________________'}</b></span>
            <span>geboren: <b>{data.profile?.birthdate ? fmtDay(data.profile.birthdate) : '__________'}</b></span>
            <span>Zeitraum: <b>{fmtDay(from)} – {fmtDay(to)}</b></span>
          </div>
        </header>

        {data.profile?.summary?.trim() && (
          <section className="report-section report-summary">
            <h3>Zusammenfassung</h3>
            <div className="summary-text">{data.profile.summary.trim()}</div>
          </section>
        )}

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

const SUMMARY_ERRORS: Record<string, string> = {
  not_granted: 'Claude ist für diese Seite nicht erlaubt. Du kannst den Bericht unten als Text kopieren und in einen Chat mit Claude einfügen.',
  sampling_disabled: 'Claude ist für dein Konto hier nicht verfügbar. Kopiere den Bericht als Text und füge ihn in einen Chat mit Claude ein.',
  rate_limited: 'Gerade zu viele Anfragen oder dein Nutzungslimit ist erreicht. Bitte später nochmal.',
  refused: 'Claude konnte daraus keine Zusammenfassung schreiben.',
  session_expired: 'Bitte in claude.ai neu anmelden.',
};

/**
 * Arztzettel mit Claude: eine Seite Zusammenfassung des gewählten Zeitraums – nur aus den
 * Einträgen, ohne Diagnosen. Bearbeitbar, wird mit den Daten gespeichert und steht im Bericht.
 */
function SummaryCard({ from, to, prompt, hasEntries }: { from: string; to: string; prompt: () => string; hasEntries: boolean }) {
  const { data, dispatch } = useStore();
  const saved = data.profile?.summary ?? '';
  const [draft, setDraft] = useState(saved);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'writing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [can, setCan] = useState<boolean | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => {
    claudeUse('sample').then((s) => setCan(!!s));
  }, []);
  // Änderungen von einem anderen Gerät übernehmen, solange hier nichts läuft.
  useEffect(() => {
    if (phase === 'idle') setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const store = (summary: string, range?: { summaryFrom: string; summaryTo: string }) =>
    dispatch({ type: 'profile/update', patch: { summary: summary || undefined, ...(range ?? {}) } });
  const fmt = (k: string) => parseDayKey(k).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  const madeFor = data.profile?.summaryFrom && data.profile?.summaryTo ? `${fmt(data.profile.summaryFrom)}–${fmt(data.profile.summaryTo)}` : null;
  const stale = !!saved && (data.profile?.summaryFrom !== from || data.profile?.summaryTo !== to);

  const run = async () => {
    const sample = await claudeUse('sample');
    if (!sample) {
      setCan(false);
      return;
    }
    setError(null);
    setPhase('thinking');
    ctl.current = new AbortController();
    try {
      const { text, truncated } = await sample(prompt(), {
        signal: ctl.current.signal,
        cache: false,
        onText: ({ text }: { text: string }) => {
          setPhase('writing');
          setDraft(text);
        },
      });
      setDraft(text.trim());
      store(text.trim(), { summaryFrom: from, summaryTo: to });
      if (truncated) setError('Die Zusammenfassung wurde abgeschnitten. Wähle einen kürzeren Zeitraum und versuch es nochmal.');
    } catch (e) {
      const err = e as { code?: string; text?: string };
      const code = err?.code ?? 'upstream_error';
      setDraft(saved);
      if (code !== 'cancelled') setError(SUMMARY_ERRORS[code] ?? 'Das hat gerade nicht geklappt. Bitte nochmal versuchen.');
      if (code === 'not_granted' || code === 'sampling_disabled') setCan(false);
    } finally {
      setPhase('idle');
    }
  };

  return (
    <section className="card no-print summary-card">
      <div className="section-head">
        <h2>✦ Arztzettel mit Claude</h2>
        {madeFor && <span className={`pill ${stale ? 'warn-pill' : ''}`}>für {madeFor}</span>}
      </div>
      <p className="muted small">
        Claude fasst den gewählten Zeitraum auf einer Seite zusammen – nur aus deinen Einträgen, ohne Diagnosen. Lies ihn vor
        dem Termin durch und ändere, was nicht stimmt. Dafür gehen die Einträge des Zeitraums an Claude (über dein Konto).
      </p>
      {can === false && (
        <div className="bridge active">
          <p className="muted small">
            Über die Claude-App: „Für Claude kopieren“ antippen, in der Claude-App in einen neuen Chat einfügen und senden.
            Claudes Antwort kopieren und unten einfügen – dann steht sie im Bericht.
          </p>
          <div className="actions start">
            <button
              className="btn primary"
              disabled={!hasEntries}
              onClick={async () => {
                const p = prompt();
                if (await copyText(p)) await notify('Kopiert. Öffne die Claude-App, füge den Text in einen neuen Chat ein und sende ihn. Kopiere dann Claudes Antwort und füge sie hier ins Feld ein.');
                else await notify('Die Zwischenablage ist hier gesperrt. Markiere den Text und kopiere ihn selbst:', p);
              }}
            >
              ✦ Für Claude kopieren
            </button>
          </div>
        </div>
      )}
      {(draft || phase !== 'idle' || can === false) && (
        <textarea
          className="summary-edit"
          rows={draft ? 14 : 4}
          value={draft}
          readOnly={phase !== 'idle'}
          placeholder={can === false ? 'Claudes Zusammenfassung hier einfügen' : undefined}
          aria-label="Zusammenfassung"
          onChange={(e) => {
            setDraft(e.target.value);
            store(e.target.value, saved ? undefined : { summaryFrom: from, summaryTo: to });
          }}
        />
      )}
      {phase === 'thinking' && <p className="thinking">Claude liest dein Tagebuch …</p>}
      {stale && phase === 'idle' && <p className="muted small">Der Zeitraum oben hat sich geändert – erstelle die Zusammenfassung neu, damit sie passt.</p>}
      <div className="actions start">
        {phase !== 'idle' ? (
          <button className="btn ghost" onClick={() => ctl.current?.abort()}>Stopp</button>
        ) : (
          can !== false && (
            <button className="btn primary" disabled={!hasEntries} onClick={run}>
              {draft ? 'Neu erstellen' : '✦ Zusammenfassung erstellen'}
            </button>
          )
        )}
        {draft && phase === 'idle' && (
          <>
            <button
              className="btn"
              onClick={async () => {
                if (await copyText(draft)) await notify('Zusammenfassung kopiert.');
                else await notify('Die Zwischenablage ist hier gesperrt. Markiere den Text und kopiere ihn selbst:', draft);
              }}
            >
              Kopieren
            </button>
            <button
              className="btn ghost danger"
              onClick={() => {
                setDraft('');
                dispatch({ type: 'profile/update', patch: { summary: undefined, summaryFrom: undefined, summaryTo: undefined } });
              }}
            >
              Entfernen
            </button>
          </>
        )}
      </div>
      {!hasEntries && <p className="muted small">Im gewählten Zeitraum gibt es noch keine Einträge.</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
