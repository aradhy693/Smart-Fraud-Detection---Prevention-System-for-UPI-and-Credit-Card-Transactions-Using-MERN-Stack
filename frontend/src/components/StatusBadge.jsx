import { normalizeRiskLabel, normalizeStatusLabel, riskTone, severityTone, statusTone } from "../utils/risk";

export default function StatusBadge({ value, type = "status" }) {
  const toneMap = type === "risk" ? riskTone : type === "severity" ? severityTone : statusTone;
  const label = type === "risk" ? normalizeRiskLabel(value) : normalizeStatusLabel(value);
  const className = toneMap[value] || "border-slate-400/25 bg-slate-400/10 text-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] ${className}`}
    >
      {label}
    </span>
  );
}
