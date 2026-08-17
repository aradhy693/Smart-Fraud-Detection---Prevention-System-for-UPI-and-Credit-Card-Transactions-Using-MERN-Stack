export const statusTone = {
  ALLOWED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  FLAGGED_OTP: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  FLAGGED: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  BLOCKED: "border-rose-400/40 bg-rose-500/15 text-rose-100"
};

export const riskTone = {
  LOW_RISK: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  MEDIUM_RISK: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  HIGH_RISK: "border-rose-400/40 bg-rose-500/15 text-rose-100"
};

export const severityTone = {
  LOW: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  MEDIUM: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  HIGH: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  CRITICAL: "border-rose-400/40 bg-rose-500/15 text-rose-100"
};

export const normalizeStatusLabel = (status) =>
  String(status || "ALLOWED")
    .replace("_OTP", "")
    .replace("_", " ");

export const normalizeRiskLabel = (riskLevel) =>
  String(riskLevel || "LOW_RISK").replace("_", " ");
