import { useMemo, useState } from 'react';
import { withHealth } from '../../core/diary/health';
import { computeInsights } from '../../core/analysis/insights';
import { MOODS, dayRhythm, daySummary, insightReadiness, type DaySummary } from '../../core/diary/feedback';
import { addDays, dayKey, formatDay, parseDayKey, startOfDay } from '../../core/model/dates';
import { fmtLevel } from '../../core/fields/fieldTypes';
import type { Entry, Tracker } from '../../core/model/types';
import { useStore } from '../../state/store';
import { DataTable } from './DataTable';
import { DayRhythmChart } from '../../components/DayRhythm';
import { severityColor } from '../../components/fieldInputs';
import { InsightList, InsightReadiness } from './Insights';
import { navigate } from '../../app/router';
import { SymptomTrendCard } from './SymptomTrendCard';
import { EntryRow } from '../../components/EntryRow';
import { Doodle } from '../../components/Doodle';
import { MOOD_BLOB } from '../today/QuickCheck';
import { WeekReviewCard } from './WeekReviewCard';

const DAYS = 14;
const moodIcon = (m?: number) => (m ? <Doodle name={`face${m}`} size={30} blob={MOOD_BLOB[m]} /> : undefined);

function dayTitle(key: string): string {
  const today = dayKey(new Date());
  const y = dayKey(addDays(startOfDay(new Date()), -1));
  if (key === today) return 'Heute';
  if (key === y) return 'Gestern';
  return formatDay(parseDayKey(key));
}

/**
 * Verlauf: das Tagebuch. Tage (jeder Tag als Karte, antippen öffnet die Tagesseite),
 * Monat (Kalender mit Farben) und „Was auffällt“.
 */
export function HistoryPage({ day }: { day?: string } = {}) {
  const { data } = useStore();
  const [view, setView] = useState<'list' | 'month' | 'patterns'>('list');
  const [days, setDays] = useState(DAYS);
  const [table, setTable] = useState(false);
  const insights = useMemo(() => {
    const all = withHealth(data);
    return computeInsights(all.trackers, all.entries, new Date());
  }, [data]);
  const trackers = data.trackers.filter((t) => !t.archived);
  const main = trackers.find((t) => t.quick && !t.demo) ?? trackers.find((t) => t.quick);

  if (day) return <DayPage day={day} trackers={trackers} />;

  const keys = [...new Set([...data.entries.map((e) => dayKey(new Date(e.timestamp))), ...Object.keys(data.days ?? {})])].sort().reverse();
  const summaries = keys.slice(0, days).map((k) => daySummary(trackers, data.entries, k, data.health, data.days));

  return (
    <div className="page">
      <section className="hero-band compact">
        <div className="hero-inner">
          <h1>Verlauf</h1>
          <p className="hero-lead">Dein Tagebuch Tag für Tag – antippen, um einen Tag anzusehen.</p>
        </div>
      </section>

      <div className="seg view-switch" role="tablist" aria-label="Ansicht">
        <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Tage</button>
        <button role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Monat</button>
        <button role="tab" aria-selected={view === 'patterns'} className={view === 'patterns' ? 'active' : ''} onClick={() => setView('patterns')}>Was auffällt</button>
      </div>

      {view === 'month' && <MonthView trackers={trackers} />}

      {view === 'patterns' && (
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
      )}

      {view === 'list' && <WeekReviewCard />}

      {view === 'list' &&
        (!summaries.length ? (
          <div className="card empty">
            <div className="empty-icon">📓</div>
            <p>Noch keine Einträge. Was du auf „Heute“ einträgst, steht hier – Tag für Tag.</p>
            <button className="btn primary" onClick={() => navigate('/')}>Zu „Heute“</button>
          </div>
        ) : (
          <div className="day-cards">
            {summaries.map((s) => (
              <DayCard key={s.date} s={s} />
            ))}
            {keys.length > summaries.length && (
              <button className="btn ghost show-more" onClick={() => setDays((d) => d + DAYS)}>Ältere Tage anzeigen</button>
            )}
            <button className="btn ghost show-more" onClick={() => setTable((v) => !v)}>{table ? 'Tabelle ausblenden' : 'Alle Einträge als Tabelle & Export'}</button>
            {table && <DataTable />}
          </div>
        ))}
    </div>
  );
}

function DayCard({ s }: { s: DaySummary }) {
  const shown = s.symptoms.slice(0, 3);
  return (
    <button className="card day-card" onClick={() => navigate(`/data?d=${s.date}`)}>
      <span className="dc-mood" aria-hidden>{moodIcon(s.mood) ?? <span className="dc-mood-empty" />}</span>
      <span className="dc-body">
        <span className="dc-top">
          <strong>{dayTitle(s.date)}</strong>
          <small className="muted">{[s.wake && `☀ ${s.wake}`, s.sleepHours !== undefined && `☾ ${fmtLevel(s.sleepHours)} h`].filter(Boolean).join('  ')}</small>
        </span>
        {shown.length > 0 ? (
          <span className="dc-syms">
            {shown.map((x) => (
              <span key={x.label} className="dc-sym">
                <b style={{ background: severityColor(x.level) }}>{fmtLevel(x.value)}</b>
                {x.label}
              </span>
            ))}
            {s.symptoms.length > 3 && <span className="dc-sym more">+{s.symptoms.length - 3}</span>}
          </span>
        ) : (
          s.entries > 0 && <span className="dc-ok">✓ ohne Beschwerden</span>
        )}
        {s.note && <small className="dc-note">„{s.note}“</small>}
      </span>
      <span className="dc-chev" aria-hidden>›</span>
    </button>
  );
}

/** Monatskalender: Farbe = stärkste Beschwerde des Tages, Gesicht = „Wie war der Tag?“. */
function MonthView({ trackers }: { trackers: Tracker[] }) {
  const { data } = useStore();
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const today = dayKey(now);
  const cells = Array.from({ length: count }, (_, i) => dayKey(new Date(first.getFullYear(), first.getMonth(), i + 1)));
  return (
    <section className="card month-card">
      <div className="month-head">
        <button className="btn ghost small icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label="Vorheriger Monat">‹</button>
        <strong>{first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong>
        <button className="btn ghost small icon-btn" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} aria-label="Nächster Monat">›</button>
      </div>
      <div className="month-grid">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
          <small key={d} className="mg-wd">{d}</small>
        ))}
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {cells.map((k) => {
          const s = daySummary(trackers, data.entries, k, data.health, data.days);
          const has = s.entries > 0 || s.mood !== undefined;
          return (
            <button
              key={k}
              className={`mg-day ${k === today ? 'today' : ''} ${has ? 'has' : ''}`}
              disabled={k > today}
              style={s.worst ? { background: severityColor(s.worst.level), color: '#fff' } : undefined}
              onClick={() => navigate(`/data?d=${k}`)}
              aria-label={`${formatDay(parseDayKey(k))}${s.worst ? `, ${s.worst.label} ${s.worst.text}` : ''}`}
            >
              <span>{Number(k.slice(8))}</span>
              {s.mood && <i aria-hidden><Doodle name={`face${s.mood}`} size={14} /></i>}
            </button>
          );
        })}
      </div>
      <p className="muted small">Farbe: stärkste Beschwerde des Tages (grün leicht → rot schwer). Gesicht: wie der Tag insgesamt war.</p>
    </section>
  );
}

/** Ein Tag als Seite: Gesamteindruck, Armband-Werte, Tagesverlauf und alle Einträge. */
function DayPage({ day, trackers }: { day: string; trackers: Tracker[] }) {
  const { data, dispatch } = useStore();
  const s = daySummary(trackers, data.entries, day, data.health, data.days);
  const main = trackers.find((t) => t.quick && !t.demo) ?? trackers.find((t) => t.quick);
  const items: { e: Entry; t: Tracker }[] = data.entries
    .filter((e) => dayKey(new Date(e.timestamp)) === day)
    .flatMap((e) => {
      const t = trackers.find((x) => x.id === e.trackerId);
      return t ? [{ e, t }] : [];
    })
    .sort((a, b) => a.e.timestamp.localeCompare(b.e.timestamp));
  const rhythm = main ? dayRhythm(main, data.entries, parseDayKey(day)) : null;
  const prev = dayKey(addDays(parseDayKey(day), -1));
  const next = dayKey(addDays(parseDayKey(day), 1));
  const isToday = day === dayKey(new Date());
  const [note, setNote] = useState(s.note ?? '');
  const long = parseDayKey(day).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const t = dayTitle(day);
  return (
    <div className="page">
      <section className="hero-band compact">
        <div className="hero-inner">
          <div className="day-nav">
            <button className="btn small outline-white icon-btn" onClick={() => navigate(`/data?d=${prev}`)} aria-label="Vorheriger Tag">‹</button>
            <h1>{t === 'Heute' || t === 'Gestern' ? `${t}, ${parseDayKey(day).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}` : long}</h1>
            <button className="btn small outline-white icon-btn" disabled={isToday} onClick={() => navigate(`/data?d=${next}`)} aria-label="Nächster Tag">›</button>
          </div>
          {(s.wake || s.sleepHours !== undefined || s.steps !== undefined) && (
            <div className="wake-chip">
              {s.wake && <span className="wake-pill static">☀ aufgewacht {s.wake}</span>}
              {s.sleepHours !== undefined && <span className="wake-pill static">☾ {fmtLevel(s.sleepHours)} h Schlaf</span>}
              {s.steps !== undefined && <span className="wake-pill static">👣 {s.steps.toLocaleString('de-DE')} Schritte</span>}
            </div>
          )}
        </div>
      </section>

      <section className="card day-mood">
        <h2>Wie war der Tag?</h2>
        <div className="mood-row" role="radiogroup" aria-label="Wie war der Tag?">
          {MOODS.map((m) => (
            <button
              key={m.value}
              role="radio"
              aria-checked={s.mood === m.value}
              className={`mood-btn ${s.mood === m.value ? 'on' : ''}`}
              onClick={() => dispatch({ type: 'day/update', date: day, patch: { mood: s.mood === m.value ? undefined : m.value } })}
            >
              <Doodle name={`face${m.value}`} size={34} blob={s.mood === m.value ? MOOD_BLOB[m.value] : undefined} />
              <small>{m.label}</small>
            </button>
          ))}
        </div>
        <input
          value={note}
          placeholder="Ein Satz zum Tag – z. B. stressiger Termin, gut geschlafen …"
          aria-label="Ein Satz zum Tag"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (s.note ?? '') && dispatch({ type: 'day/update', date: day, patch: { note: note.trim() || undefined } })}
        />
      </section>

      {rhythm && (rhythm.rows.length > 0 || rhythm.events.length > 0) && (
        <section className="card">
          <h2>Tagesverlauf</h2>
          <DayRhythmChart rhythm={rhythm} onPick={(id) => main && navigate(`/t/${main.id}/entry/${id}`)} />
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Einträge</h2>
          <button className="btn small" onClick={() => navigate(isToday ? '/now' : `/now?at=${day}`)}>＋ Eintragen</button>
        </div>
        {items.length ? (
          <ul className="entry-list">
            {items.map(({ e, t: tr }) => (
              <EntryRow key={e.id} tracker={tr} entry={e} showTracker={trackers.length > 1} />
            ))}
          </ul>
        ) : (
          <p className="muted">An diesem Tag hast du nichts eingetragen.</p>
        )}
      </section>

    </div>
  );
}
