const { getFraudPrediction } = require("../services/aiService");
const { fetchIPLocation } = require("../services/geoLocationService");
const { calculateRuleRisk } = require("../services/riskEngineService");
const AppError = require("../utils/AppError");
const { getClientIp } = require("../utils/network");

const normalizeGeoLocation = (location) => ({
  latitude: Number.isFinite(Number(location?.latitude)) ? Number(location.latitude) : 0,
  longitude: Number.isFinite(Number(location?.longitude)) ? Number(location.longitude) : 0,
  city: location?.city || "Unknown",
  country: location?.country || "Unknown"
});

const statusFromRiskLevel = (riskLevel) => {
  if (riskLevel === "HIGH_RISK") {
    return "BLOCKED";
  }

  if (riskLevel === "MEDIUM_RISK") {
    return "FLAGGED_OTP";
  }

  return "ALLOWED";
};

const getAlertType = (reasons) => {
  if (reasons.aiHighConfidence) return "AI_HIGH_CONFIDENCE";
  if (reasons.highAmount) return "HIGH_RISK_TRANSACTION";
  if (reasons.impossibleTravel) return "IMPOSSIBLE_TRAVEL";
  if (reasons.deviceMismatch) return "DEVICE_MISMATCH";
  if (reasons.velocity) return "VELOCITY_SPIKE";
  if (reasons.ipRisk) return "GEOLOCATION_ANOMALY";
  return "HIGH_RISK_TRANSACTION";
};

const getSeverity = (status, score) => {
  if (status === "BLOCKED" || score >= 90) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
};

const riskLevelFromStatusDecision = (decision) => {
  if (decision === "BLOCKED") return "HIGH_RISK";
  if (decision === "FLAGGED") return "MEDIUM_RISK";
  return "LOW_RISK";
};

const fraudEngine = async (req, res, next) => {
  try {
    const { amount, paymentMethod, deviceId, location } = req.body;
    const ipAddress = getClientIp(req);

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new AppError("Transaction amount is invalid", 400, "INVALID_TRANSACTION_AMOUNT");
    }

    let geoLocation = normalizeGeoLocation(location);

    let geoResult = null;
    if (ipAddress) {
      geoResult = await fetchIPLocation(ipAddress);
      if (geoResult.success && geoResult.data) {
        geoLocation = normalizeGeoLocation(geoResult.data);
      }
    }

    const ruleRisk = await calculateRuleRisk({
      user: req.user,
      transactionAmount: amount,
      deviceId,
      geoLocation,
      ipAddress,
      ipMetadata: geoResult?.data || null
    });

    const riskFeatures = ruleRisk.riskFeatures || {
      transactionVelocity: ruleRisk.velocityCount || 0,
      ipRisk: Number(geoResult?.data?.ipRisk || 0),
      deviceRisk: 0,
      geoDistance: ruleRisk.distanceKm || 0,
      impossibleTravel: Boolean(ruleRisk.reasons?.impossibleTravel),
      hourOfDay: new Date().getHours(),
      repeatedFailures: 0,
      newDeviceFlag: false
    };

    const aiPayload = {
      userId: req.user?._id ? req.user._id.toString() : "guest",
      paymentType: paymentMethod === "CREDIT_CARD" ? "CARD" : "UPI",
      transactionAmount: Number(amount),
      deviceId: deviceId || "unknown",
      ipAddress: ipAddress || "0.0.0.0",
      geoLocation,
      transactionVelocity: riskFeatures.transactionVelocity,
      velocityScore: ruleRisk.velocityScore,
      ipRisk: riskFeatures.ipRisk,
      deviceRisk: riskFeatures.deviceRisk,
      geoDistance: riskFeatures.geoDistance,
      impossibleTravel: riskFeatures.impossibleTravel,
      hourOfDay: riskFeatures.hourOfDay,
      repeatedFailures: riskFeatures.repeatedFailures,
      newDeviceFlag: riskFeatures.newDeviceFlag
    };

    const aiResult = await getFraudPrediction(aiPayload);
    const aiAvailable = Boolean(aiResult.success);

    const rawAiDecision = aiAvailable
      ? aiResult.data.status || aiResult.data.decision
      : null;
    const aiDecision = aiAvailable
      ? rawAiDecision === "HIGH_RISK"
        ? "BLOCKED"
        : rawAiDecision === "MEDIUM_RISK"
          ? "FLAGGED"
          : rawAiDecision === "LOW_RISK"
            ? "ALLOWED"
            : rawAiDecision
      : "UNAVAILABLE";
    const aiScore = aiAvailable ? Number(aiResult.data.riskScore) : 0;
    const reportedAiProbability = aiAvailable ? Number(aiResult.data.fraudProbability) : 0;
    const aiFraudProbability = Number.isFinite(reportedAiProbability)
      ? reportedAiProbability
      : Math.max(0, Math.min(aiScore / 100, 1));
    const aiRiskLevel = aiAvailable
      ? aiResult.data.riskLevel || riskLevelFromStatusDecision(aiDecision)
      : null;
    const localDecision = ruleRisk.decision;
    const localScore = Number(ruleRisk.riskScore);
    const finalScore = Math.max(localScore, aiScore);
    let finalDecision = "LOW_RISK";
    const reasons = { ...ruleRisk.reasons };

    if (aiScore >= 75) {
      reasons.aiHighConfidence = Math.round(aiScore);
    }

    if (Number(amount) > 50000 || localDecision === "HIGH_RISK" || aiRiskLevel === "HIGH_RISK") {
      finalDecision = "HIGH_RISK";
    } else if (localDecision === "MEDIUM_RISK" || aiRiskLevel === "MEDIUM_RISK") {
      finalDecision = "MEDIUM_RISK";
    } else if (!aiAvailable) {
      finalDecision = "MEDIUM_RISK";
      reasons.aiServiceUnavailable = true;
    }

    const status = statusFromRiskLevel(finalDecision);
    const fraudScore = Math.max(0, Math.min(finalScore / 100, 1));

    req.fraudReport = {
      fraudScore,
      status,
      decision: finalDecision,
      aiDecision,
      aiFraudProbability,
      aiRiskScore: Math.max(0, Math.min(aiScore, 100)),
      alertType: getAlertType(reasons),
      severity: getSeverity(status, finalScore),
      reasons,
      velocityScore: ruleRisk.velocityScore,
      velocityCount: ruleRisk.velocityCount,
      distanceKm: ruleRisk.distanceKm,
      repeatedFailures: riskFeatures.repeatedFailures,
      riskSignals: {
        ...riskFeatures,
        aiServiceAvailable: aiAvailable
      },
      modelVersion: aiAvailable ? aiResult.data.modelVersion : "rules-fallback",
      featureContributions: aiResult.data.featureContributions || {},
      aiServiceAvailable: aiAvailable
    };

    req.normalizedTransaction = {
      ...req.body,
      ipAddress,
      location: geoLocation,
      aiFraudProbability,
      aiRiskScore: Math.max(0, Math.min(aiScore, 100)),
      aiDecision,
      riskLevel: finalDecision,
      modelVersion: req.fraudReport.modelVersion,
      riskSignals: req.fraudReport.riskSignals
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = fraudEngine;
