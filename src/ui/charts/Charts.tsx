import { useState } from 'react';
import { addDays, dayKey, formatDay, parseDayKey, startOfDay } from '../../core/dates';

/** Leichtgewichtige SVG-Diagramme ohne externe Abhängigkeiten. */

const W = 640;
const H = 240;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

interface Tip {
  x: number;
  y: number;
  text: string;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  const w = Math.max(60, tip.text.length * 6.6 + 12);
  const x = Math.min(Math.max(tip.x - w / 2, 2), W - w - 2);
  const y = tip.y < 40 ? tip.y + 12 : tip.y - 34;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={24} rx={6} className="tip-bg" />
      <text x={x + w / 2} y={y + 16} textAnchor="middle" className="tip-text">{tip.text}</text>
    </g>
  );
}

function YAxis({ ticks, y }: { ticks: number[]; y: (v: number) => number }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{fmt(t)}</text>
        </g>
      ))}
    </g>
  );
}

export interface XYPoint {
  x: number;
  y: number;
  label: string;
}

export function LineChart({ points, color, unit = '', xLabel }: { points: XYPoint[]; color: string; unit?: string; xLabel: (x: number) => string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  if (!points.length) return <Empty />;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const [y0, y1] = [ticks[0], ticks[ticks.length - 1]];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const sx = (v: number) => PAD.l + (x1 === x0 ? (W - PAD.l - PAD.r) / 2 : ((v - x0) / (x1 - x0)) * (W - PAD.l - PAD.r));
  const sy = (v: number) => H - PAD.b - ((v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const xt = [x0, (x0 + x1) / 2, x1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" onMouseLeave={() => setTip(null)}>
      <YAxis ticks={ticks} y={sy} />
      {xt.map((x, i) => (
        <text key={i} x={sx(x)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="axis">
          {xLabel(x)}
        </text>
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={points.length > 80 ? 2 : 3.5}
          fill={color}
          onMouseEnter={() => setTip({ x: sx(p.x), y: sy(p.y), text: `${p.label}: ${fmt(p.y)}${unit ? ' ' + unit : ''}` })}
          onClick={() => setTip({ x: sx(p.x), y: sy(p.y), text: `${p.label}: ${fmt(p.y)}${unit ? ' ' + unit : ''}` })}
        />
      ))}
      <Tooltip tip={tip} />
    </svg>
  );
}

export function BarChart({ bars, color, unit = '' }: { bars: { label: string; short: string; v: number }[]; color: string; unit?: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  if (!bars.length) return <Empty />;
  const ticks = niceTicks(Math.min(0, ...bars.map((b) => b.v)), Math.max(...bars.map((b) => b.v)));
  const [y0, y1] = [ticks[0], ticks[ticks.length - 1]];
  const sy = (v: number) => H - PAD.b - ((v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const bw = (W - PAD.l - PAD.r) / bars.length;
  const every = Math.ceil(bars.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" onMouseLeave={() => setTip(null)}>
      <YAxis ticks={ticks} y={sy} />
      {bars.map((b, i) => {
        const x = PAD.l + i * bw;
        const top = sy(Math.max(0, b.v));
        const h = Math.abs(sy(b.v) - sy(0));
        const t = { x: x + bw / 2, y: top, text: `${b.label}: ${fmt(b.v)}${unit ? ' ' + unit : ''}` };
        return (
          <g key={i}>
            <rect x={x + bw * 0.12} y={top} width={Math.max(1, bw * 0.76)} height={Math.max(h, 0.5)} rx={Math.min(3, bw / 4)} fill={color} onMouseEnter={() => setTip(t)} onClick={() => setTip(t)} />
            {i % every === 0 && (
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="axis">{b.short}</text>
            )}
          </g>
        );
      })}
      <Tooltip tip={tip} />
    </svg>
  );
}

export function ScatterChart({ points, color, xName, yName }: { points: XYPoint[]; color: string; xName: string; yName: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  if (!points.length) return <Empty />;
  const xt = niceTicks(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)));
  const yt = niceTicks(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)));
  const sx = (v: number) => PAD.l + ((v - xt[0]) / (xt[xt.length - 1] - xt[0] || 1)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => H - PAD.b - ((v - yt[0]) / (yt[yt.length - 1] - yt[0] || 1)) * (H - PAD.t - PAD.b);

  // Regressionsgerade
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const slope = sxx ? points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : 0;
  const lx0 = xt[0];
  // Identische Wertepaare (typisch bei Skalen) als größere Blase zusammenfassen.
  const grouped = new Map<string, { x: number; y: number; n: number; label: string }>();
  for (const p of points) {
    const k = `${p.x}|${p.y}`;
    const g = grouped.get(k);
    if (g) g.n++;
    else grouped.set(k, { x: p.x, y: p.y, n: 1, label: p.label });
  }
  const bubbles = [...grouped.values()];
  const lx1 = xt[xt.length - 1];

  return (
    <svg viewBox={`0 -18 ${W} ${H + 32}`} className="chart" role="img" onMouseLeave={() => setTip(null)}>
      <YAxis ticks={yt} y={sy} />
      {xt.map((t) => (
        <text key={t} x={sx(t)} y={H - 10} textAnchor="middle" className="axis">{fmt(t)}</text>
      ))}
      <text x={(W + PAD.l) / 2} y={H + 8} textAnchor="middle" className="axis strong">{xName} →</text>
      <text x={PAD.l - 6} y={-6} className="axis strong">↑ {yName}</text>
      {n >= 3 && sxx > 0 && (
        <line x1={sx(lx0)} y1={sy(my + slope * (lx0 - mx))} x2={sx(lx1)} y2={sy(my + slope * (lx1 - mx))} stroke={color} strokeDasharray="5 4" opacity={0.6} />
      )}
      {bubbles.map((b, i) => {
        const text = b.n > 1 ? `${b.n}× ${fmt(b.x)} / ${fmt(b.y)}` : `${b.label}: ${fmt(b.x)} / ${fmt(b.y)}`;
        const t = { x: sx(b.x), y: sy(b.y), text };
        return <circle key={i} cx={sx(b.x)} cy={sy(b.y)} r={Math.min(16, 3.5 + Math.sqrt(b.n) * 2)} fill={color} opacity={0.5} onMouseEnter={() => setTip(t)} onClick={() => setTip(t)} />;
      })}
      <Tooltip tip={tip} />
    </svg>
  );
}

/** Kalender-Heatmap (Wochen als Spalten, Mo–So als Zeilen). */
export function CalendarHeatmap({
  values,
  weeks = 26,
  color,
  selected,
  onSelect,
  format,
}: {
  values: Map<string, number>;
  weeks?: number;
  color: string;
  selected?: string;
  onSelect?: (key: string) => void;
  format: (v: number) => string;
}) {
  const today = startOfDay(new Date());
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - (weeks - 1) * 7);
  const max = Math.max(1, ...values.values());
  const cell = 14;
  const gap = 3;
  const days: { key: string; col: number; row: number; v?: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const key = dayKey(d);
    days.push({ key, col: Math.floor(i / 7), row: i % 7, v: values.get(key), future: d > today });
  }
  const months: { col: number; label: string }[] = [];
  days.forEach((d) => {
    const date = parseDayKey(d.key);
    if (d.row === 0 && date.getDate() <= 7) months.push({ col: d.col, label: date.toLocaleDateString('de-DE', { month: 'short' }) });
  });
  const width = 24 + weeks * (cell + gap);
  const height = 18 + 7 * (cell + gap);
  return (
    <div className="heatmap-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="heatmap" style={{ minWidth: Math.min(width, 520), maxWidth: width * 1.5 }}>
        {months.map((m) => (
          <text key={m.col} x={24 + m.col * (cell + gap)} y={10} className="axis">{m.label}</text>
        ))}
        {['Mo', '', 'Mi', '', 'Fr', '', 'So'].map((l, i) => (
          <text key={i} x={0} y={18 + i * (cell + gap) + 11} className="axis">{l}</text>
        ))}
        {days.map((d) =>
          d.future ? null : (
            <rect
              key={d.key}
              x={24 + d.col * (cell + gap)}
              y={18 + d.row * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={d.v !== undefined ? color : 'var(--cell-empty)'}
              fillOpacity={d.v !== undefined ? 0.25 + 0.75 * (d.v / max) : 1}
              stroke={selected === d.key ? 'var(--text)' : 'none'}
              strokeWidth={2}
              style={{ cursor: onSelect ? 'pointer' : undefined }}
              onClick={() => onSelect?.(d.key)}
            >
              <title>{`${formatDay(parseDayKey(d.key))}: ${d.v !== undefined ? format(d.v) : 'kein Eintrag'}`}</title>
            </rect>
          ),
        )}
      </svg>
    </div>
  );
}

export function FrequencyBars({ items, color, max = 10 }: { items: { label: string; count: number }[]; color: string; max?: number }) {
  if (!items.length) return <Empty />;
  const top = items.slice(0, max);
  const m = Math.max(...top.map((i) => i.count));
  return (
    <div className="freq">
      {top.map((i) => (
        <div key={i.label} className="freq-row">
          <span className="freq-label" title={i.label}>{i.label}</span>
          <span className="freq-bar">
            <span style={{ width: `${(i.count / m) * 100}%`, background: color }} />
          </span>
          <span className="freq-n">{i.count}×</span>
        </div>
      ))}
      {items.length > max && <p className="muted small">+ {items.length - max} weitere</p>}
    </div>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`)
    .join('');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Empty() {
  return <div className="empty-chart">Noch keine Daten für diese Auswertung.</div>;
}
