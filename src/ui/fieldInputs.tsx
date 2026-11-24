import { useContext, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { EntryDayContext } from './entryContext';
import { BODY_MAPS } from '../core/bodyMaps';
import { AGGREGATION_LABELS, FIELD_TYPES, fmtLevel, formatDuration, isTimeRange, itemName, listItems, rangeMinutes, scaleLevels, severity, withLevels } from '../core/fieldTypes';
import { useDragReorder } from './useDragReorder';
import { foodGroupsOfList, isFoodField } from '../core/foodGroups';
import type { Aggregation, BodyMapKind, FieldConfig, FieldDef, FieldType, FieldValue, Polarity, ScaleLevel } from '../core/types';
import { BodyMapSvg } from './BodyMap';

/** Ampelfarbe für einen Schweregrad 0 (gut) … 1 (schlecht). */
export function severityColor(t: number): string {
  return `hsl(${Math.round(135 * (1 - t))} 62% 44%)`;
}

/**
 * UI-Hälfte der Feldtyp-Registry: Eingabe-Komponente und
 * Konfigurations-Editor je Feldtyp. `Record<FieldType, …>` erzwingt,
 * dass jeder Baustein beides besitzt.
 */

interface InputProps {
  field: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  id: string;
}

interface ConfigProps {
  config: FieldConfig;
  onChange: (patch: Partial<FieldConfig>) => void;
}

function NumberInput({ field, value, onChange, id }: InputProps) {
  const { min, max, step, unit } = field.config;
  const num = typeof value === 'number' ? value : null;
  const bump = (d: number) => {
    const s = step ?? 1;
    let n = Math.round(((num ?? min ?? 0) + d * s) * 1000) / 1000;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onChange(n);
  };
  return (
    <div className="number-input">
      <button type="button" className="btn ghost" onClick={() => bump(-1)} aria-label="weniger">−</button>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 'any'}
        value={num ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      <button type="button" className="btn ghost" onClick={() => bump(1)} aria-label="mehr">+</button>
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

function ScaleInput({ field, value, onChange, id }: InputProps) {
  const levels = scaleLevels(field.config);
  return (
    <div className="scale" id={id} role="radiogroup" style={{ '--n': levels.length } as React.CSSProperties}>
      {levels.map((l) => {
        const sev = severity(field, l.value);
        const style = sev !== null ? ({ '--step': severityColor(sev) } as React.CSSProperties) : undefined;
        const on = value === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`scale-step ${on ? 'active' : ''} ${sev !== null ? 'graded' : ''} ${Number.isInteger(l.value) ? '' : 'half'}`}
            style={style}
            onClick={() => onChange(on ? null : l.value)}
          >
            <strong>{fmtLevel(l.value)}</strong>
            {l.label && <small>{l.label}</small>}
          </button>
        );
      })}
    </div>
  );
}

function TimeRangeInput({ value, onChange, id }: InputProps) {
  const v = isTimeRange(value) ? value : { from: '', to: '' };
  const now = () => new Date().toTimeString().slice(0, 5);
  const d = rangeMinutes(v);
  const { data, dispatch } = useStore();
  const day = useContext(EntryDayContext);
  const wake = data.health?.[day]?.wake;
  const [askWake, setAskWake] = useState(false);
  const [wakeDraft, setWakeDraft] = useState('07:00');
  const useWake = () => {
    if (wake) onChange({ ...v, from: wake });
    else setAskWake(true);
  };
  return (
    <div className="timerange-wrap">
    <div className="timerange" id={id}>
      <label>
        <small>von</small>
        <span className="inline">
          <input type="time" value={v.from} onChange={(e) => onChange({ ...v, from: e.target.value })} />
          <button type="button" className="btn ghost small" onClick={() => onChange({ ...v, from: now() })}>jetzt</button>
        </span>
      </label>
      <label>
        <small>bis</small>
        <span className="inline">
          <input type="time" value={v.to} onChange={(e) => onChange({ ...v, to: e.target.value })} />
          <button type="button" className="btn ghost small" onClick={() => onChange({ ...v, to: now() })}>jetzt</button>
        </span>
      </label>
      {d !== null && <span className="pill">Dauer {formatDuration(d)}</span>}
    </div>
      <div className="inline">
        <button type="button" className={`chip small ${wake && v.from === wake ? 'active' : ''}`} onClick={useWake}>
          ☀ seit dem Aufstehen{wake ? ` (${wake})` : ''}
        </button>
        {askWake && !wake && (
          <span className="inline wake-ask">
            <label htmlFor={`${id}-wake`} className="muted small">Wann bist du aufgestanden?</label>
            <input id={`${id}-wake`} type="time" value={wakeDraft} onChange={(e) => setWakeDraft(e.target.value)} />
            <button
              type="button"
              className="btn small primary"
              onClick={() => {
                dispatch({ type: 'health/upsert', days: [{ date: day, wake: wakeDraft, source: 'manual' }] });
                onChange({ ...v, from: wakeDraft });
                setAskWake(false);
              }}
            >
              Übernehmen
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function BodyMapInput({ field, value, onChange, id }: InputProps) {
  const kind = field.config.bodyMap ?? 'abdomen';
  const sel = Array.isArray(value) ? value : [];
  const toggle = (r: string) => onChange(sel.includes(r) ? sel.filter((x) => x !== r) : [...sel, r]);
  return (
    <div className="bodymap-input" id={id}>
      <BodyMapSvg kind={kind} selected={sel} onToggle={toggle} color="var(--accent)" />
      <div className="chips">
        {BODY_MAPS[kind].regions.map((r) => (
          <button key={r.id} type="button" aria-pressed={sel.includes(r.id)} className={`chip small ${sel.includes(r.id) ? 'active' : ''}`} onClick={() => toggle(r.id)}>
            {kind === 'abdomen' ? `${r.id} · ` : ''}
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextInput({ field, value, onChange, id }: InputProps) {
  const v = typeof value === 'string' ? value : '';
  if (field.config.multiline) return <textarea id={id} rows={3} value={v} onChange={(e) => onChange(e.target.value)} />;
  if (!field.config.splitList) return <input id={id} type="text" value={v} onChange={(e) => onChange(e.target.value)} />;
  return <ListTextInput field={field} value={v} onChange={onChange} id={id} />;
}

/** Liste (z. B. Essen, Medikamente): frühere Einträge als Ein-Tipp-Vorschläge. */
function ListTextInput({ field, value, onChange, id }: { field: FieldDef; value: string; onChange: (v: FieldValue) => void; id: string }) {
  const { data } = useStore();
  const suggestions = useMemo(() => {
    const seen = new Map<string, { text: string; n: number; last: string }>();
    for (const e of data.entries) {
      const raw = e.values[field.id];
      if (typeof raw !== 'string') continue;
      for (const item of listItems(raw)) {
        const key = itemName(item).toLocaleLowerCase('de-DE');
        const cur = seen.get(key);
        // Den zuletzt verwendeten Wortlaut (inkl. Menge) anbieten.
        if (!cur) seen.set(key, { text: item, n: 1, last: e.timestamp });
        else seen.set(key, { text: e.timestamp > cur.last ? item : cur.text, n: cur.n + 1, last: e.timestamp > cur.last ? e.timestamp : cur.last });
      }
    }
    return [...seen.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last)).slice(0, 10);
  }, [data.entries, field.id]);
  const have = new Set(listItems(value).map((x) => itemName(x).toLocaleLowerCase('de-DE')));
  const open = suggestions.filter(([k]) => !have.has(k));
  const add = (item: string) => onChange(value.trim() ? `${value.trim().replace(/,$/, '')}, ${item}` : item);
  const groups = isFoodField(field) && value.trim() ? foodGroupsOfList(listItems(value)) : [];
  return (
    <div className="list-text">
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      {groups.length > 0 && (
        <p className="food-groups" aria-live="polite">
          <span className="muted">Erkannt:</span>
          {groups.map((g) => (
            <span key={g.key} className="food-group">{g.icon} {g.label}</span>
          ))}
        </p>
      )}
      {open.length > 0 && (
        <div className="chips suggest" aria-label="Zuletzt verwendet">
          {open.map(([k, s]) => (
            <button key={k} type="button" className="chip small" onClick={() => add(s.text)}>＋ {s.text}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectInput({ field, value, onChange, id }: InputProps) {
  const opts = field.config.options ?? [];
  return (
    <div className="chips" id={id} role="radiogroup">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={`chip ${value === o ? 'active' : ''}`}
          onClick={() => onChange(value === o ? null : o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function MultiSelectInput({ field, value, onChange, id }: InputProps) {
  const opts = field.config.options ?? [];
  const sel = Array.isArray(value) ? value : [];
  const toggle = (o: string) => onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
  return (
    <div className="chips" id={id}>
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={sel.includes(o)}
          className={`chip ${sel.includes(o) ? 'active' : ''}`}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function CheckboxInput({ value, onChange, id }: InputProps) {
  return (
    <label className="switch">
      <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      <span>{value === true ? 'Ja' : 'Nein'}</span>
    </label>
  );
}

function DateTimeInput({ value, onChange, id }: InputProps) {
  const v = typeof value === 'string' && value ? toLocal(value) : '';
  return (
    <input
      id={id}
      type="datetime-local"
      value={v}
      onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
    />
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- Konfigurations-Editoren ----------

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="cfg-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

const optNum = (s: string) => (s === '' ? undefined : Number(s));

function RangeConfig({ config, onChange, withUnit }: ConfigProps & { withUnit?: boolean }) {
  return (
    <div className="cfg-grid">
      {withUnit && (
        <Row label="Einheit">
          <input value={config.unit ?? ''} placeholder="z. B. kg, °C, %" onChange={(e) => onChange({ unit: e.target.value || undefined })} />
        </Row>
      )}
      <Row label="Minimum">
        <input type="number" value={config.min ?? ''} onChange={(e) => onChange({ min: optNum(e.target.value) })} />
      </Row>
      <Row label="Maximum">
        <input type="number" value={config.max ?? ''} onChange={(e) => onChange({ max: optNum(e.target.value) })} />
      </Row>
      <Row label="Schrittweite">
        <input type="number" value={config.step ?? ''} step="any" onChange={(e) => onChange({ step: optNum(e.target.value) })} />
      </Row>
    </div>
  );
}

function PolarityConfig({ config, onChange, type }: ConfigProps & { type: FieldType }) {
  const def: Polarity = type === 'scale' ? 'higher-worse' : 'neutral';
  return (
    <Row label="Ein höherer Wert ist …">
      <select value={config.polarity ?? def} onChange={(e) => onChange({ polarity: e.target.value as Polarity })}>
        <option value="higher-worse">schlechter (z. B. Schmerz, Übelkeit)</option>
        <option value="higher-better">besser (z. B. Energie, Schlafqualität)</option>
        <option value="neutral">weder noch (z. B. Gewicht, Temperatur)</option>
      </select>
    </Row>
  );
}

function AggregationConfig({ config, onChange, type }: ConfigProps & { type: FieldType }) {
  const opts: Aggregation[] = ['sum', 'avg', 'max', 'min', 'last'];
  return (
    <Row label="Pro Tag zusammenfassen als">
      <select
        value={config.aggregation ?? FIELD_TYPES[type].defaultAggregation}
        onChange={(e) => onChange({ aggregation: e.target.value as Aggregation })}
      >
        {opts.map((o) => (
          <option key={o} value={o}>{AGGREGATION_LABELS[o]}</option>
        ))}
      </select>
    </Row>
  );
}

/** Editor für Auswahloptionen: umbenennen, entfernen, per Ziehen sortieren. */
function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const { item, handle } = useDragReorder(items, onChange);
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  const dupes = new Set(items.filter((x, i) => x.trim() && items.indexOf(x) !== i));
  return (
    <div className="list-editor">
      <span className="muted">Optionen <small>(ziehen ⠿ zum Sortieren · umbenennen ändert auch bestehende Einträge)</small></span>
      {items.map((it, i) => (
        <div key={i} className="list-item" {...item(i)}>
          <button {...handle(i, `Option „${it}“`)}>⠿</button>
          <input aria-label={`Option ${i + 1}`} value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="btn ghost small" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Option „${it}“ entfernen`}>✕</button>
        </div>
      ))}
      {dupes.size > 0 && <small className="error">Doppelte Option: {[...dupes].join(', ')}</small>}
      <div className="list-item">
        <span className="drag-spacer" />
        <input
          value={draft}
          placeholder={placeholder}
          aria-label="Neue Option"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn small" onClick={add}>Hinzufügen</button>
      </div>
    </div>
  );
}

const SCALE_PRESETS: { label: string; levels: ScaleLevel[] }[] = [
  { label: '0–3 (keine … schwer)', levels: ['keine', 'leicht', 'mittel', 'schwer'].map((label, value) => ({ value, label })) },
  { label: '0–3 mit „sehr leicht“', levels: [{ value: 0, label: 'keine' }, { value: 0.5, label: 'sehr leicht' }, { value: 1, label: 'leicht' }, { value: 2, label: 'mittel' }, { value: 3, label: 'schwer' }] },
  { label: '1–5', levels: ['sehr schlecht', 'schlecht', 'mittel', 'gut', 'sehr gut'].map((label, i) => ({ value: i + 1, label })) },
  { label: '0–10', levels: Array.from({ length: 11 }, (_, value) => ({ value, label: value === 0 ? 'keine' : value === 10 ? 'maximal' : '' })) },
];

/** Stufen-Editor: Wert + Bezeichnung je Stufe, Zwischenstufen, Schnellvorlagen. */
function ScaleConfig({ config, onChange }: ConfigProps) {
  const levels = config.levels?.length ? config.levels : scaleLevels(config);
  const set = (next: ScaleLevel[]) => onChange(withLevels(next));
  const values = levels.map((l) => l.value);
  const dupes = values.some((v, i) => values.indexOf(v) !== i);
  const sorted = [...levels].sort((a, b) => a.value - b.value);
  const insertBetween = (i: number) => {
    const a = sorted[i].value;
    const b = sorted[i + 1].value;
    const mid = Math.round(((a + b) / 2) * 100) / 100;
    if (values.includes(mid)) return;
    set([...sorted.slice(0, i + 1), { value: mid, label: '' }, ...sorted.slice(i + 1)]);
  };
  return (
    <>
      <div className="cfg-presets">
        <span className="muted small">Schnellvorlage:</span>
        {SCALE_PRESETS.map((p) => (
          <button key={p.label} type="button" className="chip small" onClick={() => set(p.levels)}>{p.label}</button>
        ))}
      </div>
      <div className="levels-editor">
        <div className="level-row head muted small">
          <span>Wert</span>
          <span>Bezeichnung</span>
          <span />
        </div>
        {sorted.map((l, i) => (
          <div key={`${i}-${l.value}`} className="level-group">
            <div className="level-row">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                aria-label={`Wert der Stufe ${i + 1}`}
                defaultValue={l.value}
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(',', '.'));
                  if (Number.isFinite(v) && v !== l.value) set(sorted.map((x, j) => (j === i ? { ...x, value: v } : x)));
                }}
              />
              <input
                aria-label={`Bezeichnung der Stufe ${fmtLevel(l.value)}`}
                value={l.label}
                placeholder="z. B. leicht"
                onChange={(e) => set(sorted.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <button type="button" className="btn ghost small" disabled={sorted.length <= 2} onClick={() => set(sorted.filter((_, j) => j !== i))} aria-label={`Stufe ${fmtLevel(l.value)} entfernen`}>✕</button>
            </div>
            {i < sorted.length - 1 && (
              <button type="button" className="between" onClick={() => insertBetween(i)}>
                ＋ Zwischenstufe {fmtLevel(Math.round(((l.value + sorted[i + 1].value) / 2) * 100) / 100)}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn small"
          disabled={sorted.length >= 11}
          onClick={() => set([...sorted, { value: (sorted[sorted.length - 1]?.value ?? -1) + 1, label: '' }])}
        >
          ＋ Stufe am Ende
        </button>
      </div>
      {dupes && <p className="error">Jeder Wert darf nur einmal vorkommen.</p>}
      {sorted.length > 11 && <p className="error">Eine Skala kann höchstens 11 Stufen haben.</p>}
    </>
  );
}

export const FIELD_UI: Record<
  FieldType,
  { Input: (p: InputProps) => ReactNode; Config: (p: ConfigProps) => ReactNode }
> = {
  number: {
    Input: NumberInput,
    Config: (p) => (
      <>
        <RangeConfig {...p} withUnit />
        <div className="cfg-grid">
          <AggregationConfig {...p} type="number" />
          <PolarityConfig {...p} type="number" />
        </div>
      </>
    ),
  },
  measurement: {
    Input: NumberInput,
    Config: (p) => (
      <>
        <RangeConfig {...p} withUnit />
        <div className="cfg-grid">
          <AggregationConfig {...p} type="measurement" />
          <PolarityConfig {...p} type="measurement" />
        </div>
      </>
    ),
  },
  scale: {
    Input: ScaleInput,
    Config: (p) => (
      <>
        <ScaleConfig {...p} />
        <div className="cfg-grid">
          <AggregationConfig {...p} type="scale" />
          <PolarityConfig {...p} type="scale" />
        </div>
      </>
    ),
  },
  text: {
    Input: TextInput,
    Config: ({ config, onChange }) => (
      <>
      <label className="switch">
        <input type="checkbox" checked={!!config.multiline} onChange={(e) => onChange({ multiline: e.target.checked })} />
        <span>Mehrzeilig (Freitext – wird nicht als Kategorie gezählt)</span>
      </label>
      {!config.multiline && (
        <label className="switch">
          <input type="checkbox" checked={!!config.splitList} onChange={(e) => onChange({ splitList: e.target.checked })} />
          <span>Liste (mehrere Einträge mit Komma, z. B. Lebensmittel – einzeln ausgewertet)</span>
        </label>
      )}
      </>
    ),
  },
  select: {
    Input: SelectInput,
    Config: ({ config, onChange }) => (
      <ListEditor items={config.options ?? []} onChange={(options) => onChange({ options })} placeholder="Neue Option" />
    ),
  },
  multiselect: {
    Input: MultiSelectInput,
    Config: ({ config, onChange }) => (
      <ListEditor items={config.options ?? []} onChange={(options) => onChange({ options })} placeholder="Neue Option" />
    ),
  },
  checkbox: { Input: CheckboxInput, Config: () => <p className="muted">Keine weiteren Einstellungen.</p> },
  datetime: { Input: DateTimeInput, Config: () => <p className="muted">Keine weiteren Einstellungen.</p> },
  timerange: {
    Input: TimeRangeInput,
    Config: (p) => (
      <>
        <p className="muted">Ausgewertet wird die Dauer in Minuten.</p>
        <label className="switch">
          <input type="checkbox" checked={!!p.config.fromWake} onChange={(e) => p.onChange({ fromWake: e.target.checked })} />
          <span>Beginn automatisch „seit dem Aufstehen“ (Aufstehzeit aus Apple Health oder „aufgestanden“)</span>
        </label>
        <div className="cfg-grid">
          <Row label="Name in Auswertungen">
            <input value={p.config.metricName ?? ''} placeholder="z. B. Schmerzdauer" onChange={(e) => p.onChange({ metricName: e.target.value || undefined })} />
          </Row>
          <AggregationConfig {...p} type="timerange" />
          <PolarityConfig {...p} type="timerange" />
        </div>
      </>
    ),
  },
  bodymap: {
    Input: BodyMapInput,
    Config: ({ config, onChange }) => (
      <Row label="Schema">
        <select value={config.bodyMap ?? 'abdomen'} onChange={(e) => onChange({ bodyMap: e.target.value as BodyMapKind })}>
          {(Object.keys(BODY_MAPS) as BodyMapKind[]).map((k) => (
            <option key={k} value={k}>{BODY_MAPS[k].label}</option>
          ))}
        </select>
      </Row>
    ),
  },
};

export function FieldInput(props: InputProps) {
  const { Input } = FIELD_UI[props.field.type];
  return <Input {...props} />;
}

export function FieldConfigEditor(props: ConfigProps & { type: FieldType }) {
  const { Config } = FIELD_UI[props.type];
  return <Config config={props.config} onChange={props.onChange} />;
}
