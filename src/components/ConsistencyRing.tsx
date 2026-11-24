/** Kreisförmige Anzeige 0..1 (z. B. Regelmäßigkeit). */
export function ConsistencyRing({ value, color, size = 40, label = true }: { value: number; color: string; size?: number; label?: boolean }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <svg className="ring-gauge" width={size} height={size} viewBox="0 0 36 36" role="img" aria-label={`Regelmäßigkeit ${pct} %`}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3.5" />
      <circle
        cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 18 18)"
      />
      {label && (
        <text x="18" y="18.5" textAnchor="middle" dominantBaseline="middle" className="ring-gauge-text">{pct}</text>
      )}
    </svg>
  );
}
