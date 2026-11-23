import { useState, type ReactNode } from 'react';
import { AGGREGATION_LABELS, FIELD_TYPES } from '../core/fieldTypes';
import type { Aggregation, FieldConfig, FieldDef, FieldType, FieldValue } from '../core/types';

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
  const min = field.config.min ?? 0;
  const max = field.config.max ?? 3;
  const labels = field.config.scaleLabels ?? [];
  const steps = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
  return (
    <div className="scale" id={id} role="radiogroup">
      {steps.map((s, i) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          className={`scale-step ${value === s ? 'active' : ''}`}
          onClick={() => onChange(value === s ? null : s)}
        >
          <strong>{s}</strong>
          {labels[i] && <small>{labels[i]}</small>}
        </button>
      ))}
    </div>
  );
}

function TextInput({ field, value, onChange, id }: InputProps) {
  const v = typeof value === 'string' ? value : '';
  return field.config.multiline ? (
    <textarea id={id} rows={3} value={v} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input id={id} type="text" value={v} onChange={(e) => onChange(e.target.value)} />
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

/** Editor für Listen (Optionen / Skalenbeschriftungen), eine Zeile je Eintrag. */
function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const title = <span className="muted">Optionen</span>;
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="list-editor">
      {title}
      {items.map((it, i) => (
        <div key={i} className="list-item">
          <input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="btn ghost small" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="entfernen">✕</button>
        </div>
      ))}
      <div className="list-item">
        <input
          value={draft}
          placeholder={placeholder}
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

function ScaleConfig({ config, onChange }: ConfigProps) {
  const min = config.min ?? 0;
  const max = config.max ?? 3;
  const n = Math.max(0, max - min + 1);
  const labels = Array.from({ length: n }, (_, i) => config.scaleLabels?.[i] ?? '');
  return (
    <>
      <div className="cfg-grid">
        <Row label="Von">
          <input type="number" value={min} onChange={(e) => onChange({ min: Number(e.target.value) })} />
        </Row>
        <Row label="Bis">
          <input type="number" value={max} onChange={(e) => onChange({ max: Number(e.target.value) })} />
        </Row>
      </div>
      {n > 0 && n <= 11 && (
        <div className="cfg-labels">
          <span className="muted">Beschriftungen (optional)</span>
          {labels.map((l, i) => (
            <div key={i} className="list-item">
              <span className="scale-num">{min + i}</span>
              <input
                value={l}
                onChange={(e) => {
                  const next = labels.slice();
                  next[i] = e.target.value;
                  onChange({ scaleLabels: next });
                }}
              />
            </div>
          ))}
        </div>
      )}
      {n > 11 && <p className="error">Eine Skala kann höchstens 11 Stufen haben.</p>}
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
        <AggregationConfig {...p} type="number" />
      </>
    ),
  },
  measurement: {
    Input: NumberInput,
    Config: (p) => (
      <>
        <RangeConfig {...p} withUnit />
        <AggregationConfig {...p} type="measurement" />
      </>
    ),
  },
  scale: {
    Input: ScaleInput,
    Config: (p) => (
      <>
        <ScaleConfig {...p} />
        <AggregationConfig {...p} type="scale" />
      </>
    ),
  },
  text: {
    Input: TextInput,
    Config: ({ config, onChange }) => (
      <label className="switch">
        <input type="checkbox" checked={!!config.multiline} onChange={(e) => onChange({ multiline: e.target.checked })} />
        <span>Mehrzeilig (Freitext – wird nicht als Kategorie gezählt)</span>
      </label>
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
};

export function FieldInput(props: InputProps) {
  const { Input } = FIELD_UI[props.field.type];
  return <Input {...props} />;
}

export function FieldConfigEditor(props: ConfigProps & { type: FieldType }) {
  const { Config } = FIELD_UI[props.type];
  return <Config config={props.config} onChange={props.onChange} />;
}
