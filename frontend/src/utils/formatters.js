export const formatCurrency = (value) =>
  `INR ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0
  })}`;

export const formatPercent = (value, digits = 0) => {
  const normalized = Number(value || 0);
  const ratio = normalized > 1 ? normalized / 100 : normalized;
  return `${(ratio * 100).toFixed(digits)}%`;
};

export const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");

export const formatDateTime = (value) => {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

export const compactDateTime = (value) => {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short"
  }).format(date);
};

export const getTransactionId = (transaction) =>
  transaction?.transactionId ||
  transaction?.transactionReference ||
  transaction?._id ||
  transaction?.id ||
  "Unknown";

export const getTransactionAmount = (transaction) =>
  Number(transaction?.transactionAmount || transaction?.amount || 0);

export const getTransactionStatus = (transaction) =>
  transaction?.transactionStatus || transaction?.status || "ALLOWED";

export const getRiskLevel = (transaction) =>
  transaction?.fraudDecision ||
  transaction?.decision ||
  transaction?.riskLevel ||
  (getTransactionStatus(transaction) === "BLOCKED" ? "HIGH_RISK" : "LOW_RISK");

export const getFraudScore = (transaction) => {
  const score =
    transaction?.fraudRiskScore ??
    transaction?.fraudProbability ??
    transaction?.aiFraudProbability ??
    0;
  return Number(score || 0);
};

export const getAiProbability = (transaction) =>
  Number(transaction?.aiFraudProbability ?? transaction?.aiProbability ?? 0);
