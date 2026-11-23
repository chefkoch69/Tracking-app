import { useRef, useState } from 'react';
import { entriesOf } from '../../core/analytics';
import { addDays, dayKey, parseDayKey, startOfDay } from '../../core/dates';
import { inRange, reportText } from '../../core/report';
import type { Tracker } from '../../core/types';
import { useStore } from '../../state/store';
import { ReportActions } from '../ReportActions';
import { ReportSheet } from './ReportSheet';
import { NoData } from './shared';

/** Bericht für einen Tracker. Für alle Tracker zusammen gibt es den „Arztbericht“. */
export function ReportView({ tracker }: { tracker: Tracker }) {
  const { data, dispatch } = useStore();
  const all = entriesOf(tracker, data.entries);
  const today = dayKey(new Date());
  const [from, setFrom] = useState(() => dayKey(addDays(startOfDay(new Date()), -13)));
  const [to, setTo] = useState(today);
  const [mode, setMode] = useState<'entries' | 'days'>(tracker.quick ? 'days' : 'entries');
  const sheet = useRef<HTMLElement>(null);
  if (!all.length) return <NoData tracker={tracker} />;
  const entries = inRange(all, from, to);
  const name = tracker.name.replace(/\s*\(Demo\)$/, '');

  return (
    <div className="report-wrap">
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
            <span>Name (für den Bericht)</span>
            <input value={data.profile?.name ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { name: e.target.value } })} />
          </label>
          <label className="cfg-row">
            <span>Geboren</span>
            <input type="date" value={data.profile?.birthdate ?? ''} onChange={(e) => dispatch({ type: 'profile/update', patch: { birthdate: e.target.value } })} />
          </label>
        </div>
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <span className="chips">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} className="chip small" onClick={() => { setFrom(dayKey(addDays(startOfDay(new Date()), -(d - 1)))); setTo(today); }}>{d} Tage</button>
            ))}
            <span className="seg">
              <button className={mode === 'entries' ? 'active' : ''} onClick={() => setMode('entries')}>je Eintrag</button>
              <button className={mode === 'days' ? 'active' : ''} onClick={() => setMode('days')}>je Tag</button>
            </span>
          </span>
          <ReportActions
            title={name}
            filename={`${name}-${from}-bis-${to}`}
            sheet={sheet}
            text={() => reportText([tracker], data.entries, undefined, from, to, data.profile)}
          />
        </div>
        <p className="muted small">Alle Tracker zusammen in einem Bericht: <a href="#/arzt">Arztbericht</a>.</p>
      </div>

      <article className="report card" ref={sheet}>
        <header className="report-head">
          <h2>{name}</h2>
          <div className="report-meta">
            <span>Name: <b>{data.profile?.name || '________________'}</b></span>
            <span>geboren: <b>{data.profile?.birthdate ? parseDayKey(data.profile.birthdate).toLocaleDateString('de-DE') : '__________'}</b></span>
            <span>Zeitraum: <b>{parseDayKey(from).toLocaleDateString('de-DE')} – {parseDayKey(to).toLocaleDateString('de-DE')}</b></span>
            <span>{entries.length} Einträge</span>
          </div>
        </header>
        <ReportSheet tracker={tracker} entries={entries} mode={mode} />
        <p className="report-foot muted small">Erstellt am {new Date().toLocaleDateString('de-DE')} mit „Build Your Own Tracker“.</p>
      </article>
    </div>
  );
}
