const toPlainReasons = (riskReasons) => {
  if (!riskReasons) {
    return {};
  }

  if (riskReasons instanceof Map) {
    return Object.fromEntries(riskReasons);
  }

  if (typeof riskReasons.toObject === "function") {
    return riskReasons.toObject();
  }

  return { ...riskReasons };
};

const getDateBucket = (date) => new Date(date).toISOString().slice(0, 10);

const round = (value, decimals = 2) => Number(Number(value || 0).toFixed(decimals));

const buildRiskTrends = (transactions) => {
  const byDate = new Map();

  transactions.forEach((transaction) => {
    const bucket = getDateBucket(transaction.timestamp || transaction.createdAt || Date.now());
    const existing =
      byDate.get(bucket) ||
      {
        date: bucket,
        total: 0,
        allowed: 0,
        flagged: 0,
        blocked: 0,
        cumulativeAiConfidence: 0
      };

    existing.total += 1;
    if (transaction.status === "BLOCKED") existing.blocked += 1;
    else if (transaction.status === "FLAGGED_OTP") existing.flagged += 1;
    else existing.allowed += 1;
    existing.cumulativeAiConfidence += Number(transaction.aiFraudProbability || 0);

    byDate.set(bucket, existing);
  });

  return Array.from(byDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-14)
    .map((trend) => ({
      date: trend.date,
      total: trend.total,
      allowed: trend.allowed,
      flagged: trend.flagged,
      blocked: trend.blocked,
      averageAiConfidence: trend.total ? round(trend.cumulativeAiConfidence / trend.total, 4) : 0
    }));
};

const buildSuspiciousGeolocationActivity = (transactions) => {
  const grouped = new Map();

  transactions
    .filter((transaction) => {
      const reasons = toPlainReasons(transaction.riskReasons);
      return (
        Boolean(reasons.impossibleTravel) ||
        Boolean(transaction.riskSignals?.impossibleTravel) ||
        Number(transaction.riskSignals?.geoDistance || 0) > 800
      );
    })
    .forEach((transaction) => {
      const location = transaction.location || {};
      const key = `${location.city || "Unknown"}, ${location.country || "Unknown"}`;
      const current =
        grouped.get(key) ||
        {
          location: key,
          city: location.city || "Unknown",
          country: location.country || "Unknown",
          count: 0,
          maxDistanceKm: 0,
          maxRiskScore: 0,
          latestAt: null
        };

      current.count += 1;
      current.maxDistanceKm = Math.max(
        current.maxDistanceKm,
        Number(transaction.riskSignals?.geoDistance || 0)
      );
      current.maxRiskScore = Math.max(current.maxRiskScore, Number(transaction.fraudScore || 0) * 100);
      current.latestAt = transaction.timestamp || transaction.createdAt || current.latestAt;
      grouped.set(key, current);
    });

  return Array.from(grouped.values())
    .sort((left, right) => right.count - left.count || right.maxRiskScore - left.maxRiskScore)
    .slice(0, 10)
    .map((entry) => ({
      ...entry,
      maxDistanceKm: round(entry.maxDistanceKm),
      maxRiskScore: round(entry.maxRiskScore)
    }));
};

const buildAiConfidenceLevels = (transactions) => {
  const levels = {
    low: 0,
    medium: 0,
    high: 0
  };
  const byModelVersion = new Map();
  let cumulativeConfidence = 0;

  transactions.forEach((transaction) => {
    const confidence = Number(transaction.aiFraudProbability || 0);
    cumulativeConfidence += confidence;

    if (confidence >= 0.75) levels.high += 1;
    else if (confidence >= 0.4) levels.medium += 1;
    else levels.low += 1;

    const modelVersion = transaction.modelVersion || "unknown";
    const existing = byModelVersion.get(modelVersion) || { modelVersion, count: 0, cumulativeConfidence: 0 };
    existing.count += 1;
    existing.cumulativeConfidence += confidence;
    byModelVersion.set(modelVersion, existing);
  });

  return {
    levels,
    averageConfidence: transactions.length ? round(cumulativeConfidence / transactions.length, 4) : 0,
    byModelVersion: Array.from(byModelVersion.values()).map((entry) => ({
      modelVersion: entry.modelVersion,
      count: entry.count,
      averageConfidence: entry.count ? round(entry.cumulativeConfidence / entry.count, 4) : 0
    }))
  };
};

const formatRecentAlert = (alert) => ({
  id: alert._id,
  alertType: alert.alertType,
  severity: alert.severity,
  status: alert.status,
  message: alert.message,
  aiConfidence: alert.aiConfidence || 0,
  riskScore: alert.riskScore || 0,
  createdAt: alert.createdAt
});

const buildFraudAnalytics = (transactions, alerts = []) => {
  const totalVolume = transactions.reduce(
    (accumulator, transaction) => accumulator + Number(transaction.amount || 0),
    0
  );
  const flaggedTransactions = transactions.filter((transaction) => transaction.status === "FLAGGED_OTP").length;
  const blockedTransactions = transactions.filter((transaction) => transaction.status === "BLOCKED").length;
  const highConfidenceAiTransactions = transactions.filter(
    (transaction) => Number(transaction.aiFraudProbability || 0) >= 0.75
  ).length;

  return {
    summary: {
      totalTransactions: transactions.length,
      totalMonitoredVolume: round(totalVolume),
      flaggedTransactions,
      blockedTransactions,
      totalBlockedTransactions: blockedTransactions,
      highRiskTransactions: flaggedTransactions + blockedTransactions,
      highConfidenceAiTransactions,
      openAlerts: alerts.filter((alert) => ["OPEN", "REVIEWING"].includes(alert.status)).length
    },
    riskTrends: buildRiskTrends(transactions),
    suspiciousGeolocationActivity: buildSuspiciousGeolocationActivity(transactions),
    aiConfidenceLevels: buildAiConfidenceLevels(transactions),
    recentAlerts: alerts.slice(0, 10).map(formatRecentAlert)
  };
};

module.exports = {
  buildAiConfidenceLevels,
  buildFraudAnalytics,
  buildRiskTrends,
  buildSuspiciousGeolocationActivity,
  toPlainReasons
};
