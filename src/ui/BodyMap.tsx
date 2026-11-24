import type { ReactNode } from 'react';
import { BODY_MAPS } from '../core/bodyMaps';
import type { BodyMapKind } from '../core/types';

/**
 * Interaktives Lokalisationsschema. Wird für die Eingabe (Regionen antippen)
 * und für Auswertungen (Häufigkeit als Einfärbung) verwendet.
 */
interface Props {
  kind: BodyMapKind;
  selected?: string[];
  /** 0..1 je Region – für Häufigkeits-Heatmaps. */
  intensity?: Record<string, number>;
  color?: string;
  onToggle?: (id: string) => void;
  size?: 'normal' | 'small';
}

type Shape = { id: string; el: (p: ShapeProps) => ReactNode; label?: [number, number] };
type ShapeProps = { fill: string; fillOpacity: number; className: string; onClick?: () => void };

const ABDOMEN_OUTLINE = 'M44,18 Q110,2 176,18 Q192,70 190,120 Q196,196 168,232 L52,232 Q24,196 30,120 Q28,70 44,18 Z';

const ABDOMEN: Shape[] = [
  { id: '2', label: [56, 84], el: (p) => <rect x={0} y={0} width={110} height={124} {...p} /> },
  { id: '3', label: [164, 84], el: (p) => <rect x={110} y={0} width={110} height={124} {...p} /> },
  { id: '4', label: [60, 192], el: (p) => <rect x={0} y={124} width={110} height={120} {...p} /> },
  { id: '5', label: [160, 192], el: (p) => <rect x={110} y={124} width={110} height={120} {...p} /> },
  { id: '1', label: [110, 54], el: (p) => <path d="M68,10 H152 V58 A42,42 0 0 1 68,58 Z" {...p} /> },
  { id: '6', label: [110, 154], el: (p) => <circle cx={110} cy={150} r={38} {...p} /> },
];

const r = (x: number, y: number, w: number, h: number, rx: number) => (p: ShapeProps) => (
  <rect x={x} y={y} width={w} height={h} rx={rx} {...p} />
);
const e = (cx: number, cy: number, rx: number, ry: number) => (p: ShapeProps) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...p} />
);

const BODY: Shape[] = [
  { id: 'head', el: e(100, 36, 23, 27) },
  { id: 'neck', el: r(90, 62, 20, 18, 5) },
  { id: 'arm-r', el: r(37, 98, 22, 98, 11) },
  { id: 'arm-l', el: r(141, 98, 22, 98, 11) },
  { id: 'hand-r', el: e(47, 210, 11, 15) },
  { id: 'hand-l', el: e(153, 210, 11, 15) },
  { id: 'shoulder-r', el: e(62, 92, 20, 13) },
  { id: 'shoulder-l', el: e(138, 92, 20, 13) },
  { id: 'chest', el: r(68, 82, 64, 56, 14) },
  { id: 'belly', el: r(70, 140, 60, 46, 10) },
  { id: 'pelvis', el: r(68, 188, 64, 36, 16) },
  { id: 'thigh-r', el: r(70, 226, 28, 80, 13) },
  { id: 'thigh-l', el: r(102, 226, 28, 80, 13) },
  { id: 'knee-r', el: e(84, 316, 14, 11) },
  { id: 'knee-l', el: e(116, 316, 14, 11) },
  { id: 'leg-r', el: r(73, 328, 22, 54, 10) },
  { id: 'leg-l', el: r(105, 328, 22, 54, 10) },
  { id: 'foot-r', el: e(82, 390, 15, 8) },
  { id: 'foot-l', el: e(118, 390, 15, 8) },
];

// Kopf: links von vorne, rechts von hinten (links im Bild = rechte Kopfseite).
const HEAD_FRONT_CLIP = 'M60,12 C88,12 104,36 104,66 C104,98 86,124 60,124 C34,124 16,98 16,66 C16,36 32,12 60,12 Z';
const HEAD_BACK_CLIP = 'M180,12 C208,12 224,36 224,66 C224,98 206,124 180,124 C154,124 136,98 136,66 C136,36 152,12 180,12 Z';
const HEAD: Shape[] = [
  { id: 'stirn', el: r(10, 8, 100, 36, 0) },
  { id: 'augen', el: r(10, 44, 100, 24, 0) },
  { id: 'kiefer', el: r(10, 68, 100, 62, 0) },
  { id: 'schlaefe-r', el: r(10, 30, 22, 44, 0) },
  { id: 'schlaefe-l', el: r(88, 30, 22, 44, 0) },
  { id: 'scheitel', el: r(130, 8, 100, 34, 0) },
  { id: 'hinterkopf', el: r(130, 42, 100, 88, 0) },
];

export function BodyMapSvg({ kind, selected = [], intensity, color = 'var(--primary)', onToggle, size = 'normal' }: Props) {
  const regions = BODY_MAPS[kind].regions;
  const name = (id: string) => regions.find((x) => x.id === id)?.label ?? id;
  const shapes = kind === 'abdomen' ? ABDOMEN : kind === 'head' ? HEAD : BODY;

  const props = (id: string): ShapeProps => {
    const on = selected.includes(id);
    const t = intensity?.[id];
    return {
      fill: on || t ? color : 'var(--surface)',
      fillOpacity: on ? 0.85 : t ? 0.15 + 0.8 * t : 1,
      className: `region ${on ? 'on' : ''} ${onToggle ? 'clickable' : ''}`,
      onClick: onToggle ? () => onToggle(id) : undefined,
    };
  };

  const body = shapes.map((s) => (
    <g key={s.id}>
      {s.el(props(s.id))}
      <title>{name(s.id)}</title>
    </g>
  ));

  return (
    <div className={`bodymap ${size}`}>
      {kind === 'abdomen' ? (
        <svg viewBox="0 0 220 244" role="group" aria-label="Lokalisationsschema Bauch">
          <defs>
            <clipPath id="abdomen-clip">
              <path d={ABDOMEN_OUTLINE} />
            </clipPath>
          </defs>
          <g clipPath="url(#abdomen-clip)">{body}</g>
          <path d={ABDOMEN_OUTLINE} fill="none" className="outline" />
          <circle cx={110} cy={166} r={2.5} className="navel" />
          {ABDOMEN.map((s) => (
            <text key={s.id} x={s.label![0]} y={s.label![1]} className={`region-num ${selected.includes(s.id) ? 'on' : ''}`} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
              {s.id}
            </text>
          ))}
        </svg>
      ) : kind === 'head' ? (
        <svg viewBox="0 0 240 162" role="group" aria-label="Kopf von vorne und von hinten">
          <defs>
            <clipPath id="head-front-clip"><path d={HEAD_FRONT_CLIP} /></clipPath>
            <clipPath id="head-back-clip"><path d={HEAD_BACK_CLIP} /></clipPath>
          </defs>
          <g clipPath="url(#head-front-clip)">{body.filter((_, i) => i < 5)}</g>
          <g clipPath="url(#head-back-clip)">{body.filter((_, i) => i >= 5)}</g>
          <path d={HEAD_FRONT_CLIP} fill="none" className="outline" />
          <path d={HEAD_BACK_CLIP} fill="none" className="outline" />
          <g>
            <rect x={160} y={124} width={40} height={24} rx={8} {...props('nacken')} />
            <title>{name('nacken')}</title>
          </g>
          <ellipse cx={14} cy={70} rx={5} ry={11} className="outline" fill="none" />
          <ellipse cx={106} cy={70} rx={5} ry={11} className="outline" fill="none" />
          <text x={60} y={150} textAnchor="middle" className="map-caption">vorne</text>
          <text x={180} y={160} textAnchor="middle" className="map-caption">hinten</text>
        </svg>
      ) : (
        <svg viewBox="0 0 200 404" role="group" aria-label="Lokalisationsschema Körper">
          {body}
        </svg>
      )}
      <small className="bodymap-hint muted">{kind === 'head' ? 'Antippen, wo es weh tut · links im Bild = deine rechte Seite' : 'Ansicht von vorne · links im Bild = deine rechte Seite'}</small>
    </div>
  );
}
