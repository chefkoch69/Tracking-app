import { useState } from 'react';
import { describeCorrelation, numericFields, pairMetrics, pearson, type MetricRef } from '../../../core/analysis/analytics';
import { formatDateTime, formatDay, parseDayKey } from '../../../core/model/dates';
import type { Tracker } from '../../../core/model/types';
import { useStore } from '../../../state/store';
import { withHealth } from '../../../core/diary/health';
import { ScatterChart } from '../../../components/Charts';
import { NeedsNumeric } from '../../../components/entryViews';

const enc = (m: MetricRef) => `${m.trackerId}|${m.fieldId}`;
const dec = (s: string): MetricRef => {
  const [trackerId, fieldId] = s.split('|');
  return { trackerId, fieldId };
};

/**
 * Vergleich zweier beliebiger Messgrößen – innerhalb eines Trackers
 * (z. B. Raumtemperatur ↔ Kälteempfinden) oder trackerübergreifend
 * (z. B. Schlafdauer aus "Schlaf" ↔ Erschöpfung aus "Morgen-Check-in").
 */
export function CompareView({ tracker }: { tracker: Tracker }) {
  const { data: raw } = useStore();
  const data = withHealth(raw);
  const own = numericFields(tracker);
  const all = data.trackers.flatMap((t) => numericFields(t).map((f) => ({ t, f })));
  // Standard: ein Messwert (z. B. Temperatur, Schlafdauer) gegen eine Skala/Zahl.
  const firstA = own.find((f) => f.type === 'measurement') ?? own[0];
  const firstB = own.find((f) => f !== firstA && f.type !== firstA?.type) ?? own.find((f) => f !== firstA);
  const [a, setA] = useState(() => (firstA ? enc({ trackerId: tracker.id, fieldId: firstA.id }) : ''));
  const [b, setB] = useState(() => {
    if (firstB) return enc({ trackerId: tracker.id, fieldId: firstB.id });
    const other = all.find((x) => x.t.id !== tracker.id);
    return other ? enc({ trackerId: other.t.id, fieldId: other.f.id }) : '';
  });
  const [lag, setLag] = useState(0);

  if (!own.length || all.length < 2) return <NeedsNumeric />;

  const ra = dec(a);
  const rb = dec(b || a);
  const name = (r: MetricRef) => {
    const t = data.trackers.find((x) => x.id === r.trackerId);
    const f = t?.fields.find((x) => x.id === r.fieldId);
    return t && f ? (t.id === tracker.id ? f.label : `${f.label} (${t.name})`) : '?';
  };
  const paired = pairMetrics(data.trackers, data.entries, ra, rb, lag);
  const r = pearson(paired.pairs.map((p) => p.x), paired.pairs.map((p) => p.y));

  const options = (
    <>
      {data.trackers.map((t) => {
        const fs = numericFields(t);
        if (!fs.length) return null;
        return (
          <optgroup key={t.id} label={`${t.icon} ${t.name}`}>
            {fs.map((f) => (
              <option key={f.id} value={enc({ trackerId: t.id, fieldId: f.id })}>
                {f.label}
                {f.config.unit ? ` (${f.config.unit})` : ''}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );

  return (
    <div className="card">
      <div className="controls">
        <label className="cfg-row">
          <span>Wert A (waagerecht)</span>
          <select value={a} onChange={(e) => setA(e.target.value)}>{options}</select>
        </label>
        <label className="cfg-row">
          <span>Wert B (senkrecht)</span>
          <select value={b} onChange={(e) => setB(e.target.value)}>{options}</select>
        </label>
        <label className="cfg-row">
          <span>B zeitversetzt</span>
          <select value={lag} onChange={(e) => setLag(Number(e.target.value))}>
            <option value={0}>gleicher Tag</option>
            <option value={1}>B am Folgetag</option>
            <option value={2}>B zwei Tage später</option>
          </select>
        </label>
      </div>
      <ScatterChart
        points={paired.pairs.map((p) => ({
          x: p.x,
          y: p.y,
          label: paired.basis === 'entry' ? formatDateTime(new Date(p.label)) : formatDay(parseDayKey(p.label)),
        }))}
        color={tracker.color}
        xName={name(ra)}
        yName={name(rb)}
      />
      <div className="correlation">
        <b>{r === null ? 'r = –' : `r = ${r.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`}</b>
        <span>{describeCorrelation(r)}</span>
      </div>
      <p className="muted small">
        {paired.pairs.length} Datenpaare · gepaart {paired.basis === 'entry' ? 'je Eintrag' : 'nach Tageswerten'}
      </p>
    </div>
  );
}
