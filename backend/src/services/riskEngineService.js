const Transaction = require("../models/Transaction");
const calculateDistanceKm = require("../utils/distanceCalculator");
const { isPrivateIpAddress } = require("../utils/network");

const VELOCITY_WINDOW_MINUTES = 10;
const VELOCITY_FLAG_COUNT = 3;
const IMPOSSIBLE_TRAVEL_DISTANCE_KM = 800;
const FAILURE_WINDOW_MINUTES = 60;

const decisionFromScore = (score) => {
  if (score >= 75) return "HIGH_RISK";
  if (score >= 40) return "MEDIUM_RISK";
  return "LOW_RISK";
};

const buildIdentityQuery = ({ user, deviceId, ipAddress }) => {
  const identifiers = [];

  if (user?._id) {
    identifiers.push({ userId: user._id });
  }

  if (deviceId) {
    identifiers.push({ deviceId });
  }

  if (ipAddress) {
    identifiers.push({ ipAddress });
  }

  if (identifiers.length === 0) {
    return null;
  }

  return { $or: identifiers };
};

const calculateVelocity = async ({ user, deviceId, ipAddress }) => {
  const identityQuery = buildIdentityQuery({ user, deviceId, ipAddress });
  if (!identityQuery) {
    return { recentCount: 0, velocityScore: 0 };
  }

  const since = new Date(Date.now() - VELOCITY_WINDOW_MINUTES * 60 * 1000);
  const recentCount = await Transaction.countDocuments({
    ...identityQuery,
    timestamp: { $gte: since }
  });

  return {
    recentCount,
    velocityScore: Math.min(recentCount * 20, 100)
  };
};

const calculateRecentFailures = async ({ user, deviceId, ipAddress }) => {
  const identityQuery = buildIdentityQuery({ user, deviceId, ipAddress });
  if (!identityQuery) {
    return 0;
  }

  const since = new Date(Date.now() - FAILURE_WINDOW_MINUTES * 60 * 1000);
  return Transaction.countDocuments({
    ...identityQuery,
    status: { $in: ["BLOCKED", "FLAGGED_OTP"] },
    timestamp: { $gte: since }
  });
};

const getLastKnownTransaction = async ({ user, deviceId, ipAddress }) => {
  const identityQuery = buildIdentityQuery({ user, deviceId, ipAddress });
  if (!identityQuery) {
    return null;
  }

  return Transaction.findOne(identityQuery).sort({ timestamp: -1 });
};

const hasValidCoordinates = (location) =>
  Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));

const calculateIpRisk = ({ ipAddress, ipMetadata }) => {
  if (Number.isFinite(Number(ipMetadata?.ipRisk))) {
    return Math.max(0, Math.min(Number(ipMetadata.ipRisk), 100));
  }

  if (!ipAddress || isPrivateIpAddress(ipAddress)) {
    return 5;
  }

  if (!ipMetadata) {
    return 35;
  }

  let risk = 10;
  if (ipMetadata.proxy) risk += 35;
  if (ipMetadata.hosting) risk += 25;
  if (!ipMetadata.city || ipMetadata.city === "Unknown") risk += 12;
  if (ipMetadata.country && ipMetadata.country !== "India") risk += 8;

  return Math.max(0, Math.min(risk, 100));
};

const hourRiskContribution = (hourOfDay, amount) => {
  if ((hourOfDay <= 5 || hourOfDay >= 23) && amount >= 20000) {
    return 15;
  }

  if (hourOfDay <= 5 || hourOfDay >= 23) {
    return 6;
  }

  return 0;
};

const calculateRuleRisk = async ({ user, transactionAmount, deviceId, geoLocation, ipAddress, ipMetadata }) => {
  const amount = Number(transactionAmount);
  let score = 0;
  const reasons = {};
  let distanceKm = 0;
  const hourOfDay = new Date().getHours();

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      riskScore: 100,
      decision: "HIGH_RISK",
      velocityScore: 0,
      velocityCount: 0,
      distanceKm: 0,
      reasons: { invalidAmount: 100 },
      riskFeatures: {
        transactionVelocity: 0,
        ipRisk: 100,
        deviceRisk: 100,
        geoDistance: 0,
        impossibleTravel: false,
        hourOfDay,
        repeatedFailures: 0,
        newDeviceFlag: false
      }
    };
  }

  if (amount > 50000) {
    score = 100;
    reasons.highAmount = 100;
  } else if (amount >= 25000) {
    score += 20;
    reasons.elevatedAmount = 20;
  }

  const [{ recentCount, velocityScore }, lastTransaction, repeatedFailures] = await Promise.all([
    calculateVelocity({ user, deviceId, ipAddress }),
    getLastKnownTransaction({ user, deviceId, ipAddress }),
    calculateRecentFailures({ user, deviceId, ipAddress })
  ]);

  if (recentCount >= VELOCITY_FLAG_COUNT) {
    score += 40;
    reasons.velocity = 40;
  } else if (recentCount > 0) {
    const velocityContribution = Math.min(recentCount * 10, 30);
    score += velocityContribution;
    reasons.velocity = velocityContribution;
  }

  let deviceRisk = 0;
  let newDeviceFlag = false;

  if (lastTransaction?.deviceId && deviceId && lastTransaction.deviceId !== deviceId) {
    score += 20;
    deviceRisk = 85;
    newDeviceFlag = true;
    reasons.deviceMismatch = 20;
  }

  if (hasValidCoordinates(lastTransaction?.location) && hasValidCoordinates(geoLocation)) {
    distanceKm = calculateDistanceKm(lastTransaction.location, geoLocation);
    if (distanceKm > IMPOSSIBLE_TRAVEL_DISTANCE_KM) {
      score += 45;
      reasons.impossibleTravel = 45;
    }
  }

  const ipRisk = calculateIpRisk({ ipAddress, ipMetadata });
  if (ipRisk >= 80) {
    score += 25;
    reasons.ipRisk = 25;
  } else if (ipRisk >= 55) {
    score += 12;
    reasons.ipRisk = 12;
  }

  if (repeatedFailures >= 3) {
    score += 35;
    reasons.repeatedFailures = 35;
  } else if (repeatedFailures > 0) {
    const failureContribution = Math.min(repeatedFailures * 12, 30);
    score += failureContribution;
    reasons.repeatedFailures = failureContribution;
  }

  const timingRisk = hourRiskContribution(hourOfDay, amount);
  if (timingRisk > 0) {
    score += timingRisk;
    reasons.transactionTiming = timingRisk;
  }

  if (lastTransaction && !lastTransaction.deviceId && deviceId) {
    deviceRisk = Math.max(deviceRisk, 35);
  }

  const cappedScore = Math.min(score, 100);

  return {
    riskScore: cappedScore,
    decision: decisionFromScore(cappedScore),
    velocityScore,
    velocityCount: recentCount,
    distanceKm,
    repeatedFailures,
    reasons,
    riskFeatures: {
      transactionVelocity: recentCount,
      ipRisk,
      deviceRisk,
      geoDistance: Number(distanceKm.toFixed(2)),
      impossibleTravel: Boolean(reasons.impossibleTravel),
      hourOfDay,
      repeatedFailures,
      newDeviceFlag
    }
  };
};

module.exports = {
  FAILURE_WINDOW_MINUTES,
  VELOCITY_FLAG_COUNT,
  VELOCITY_WINDOW_MINUTES,
  calculateIpRisk,
  calculateRecentFailures,
  calculateVelocity,
  decisionFromScore,
  calculateRuleRisk
};
