const axios = require("axios");
const logger = require("../utils/logger");

const VALID_RISK_LEVELS = new Set(["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"]);
const VALID_ACTIONS = new Set(["ALLOWED", "FLAGGED", "BLOCKED"]);

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const sleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const actionFromRiskLevel = (riskLevel) => {
  if (riskLevel === "HIGH_RISK") return "BLOCKED";
  if (riskLevel === "MEDIUM_RISK") return "FLAGGED";
  return "ALLOWED";
};

const riskLevelFromAction = (action) => {
  if (action === "BLOCKED") return "HIGH_RISK";
  if (action === "FLAGGED") return "MEDIUM_RISK";
  return "LOW_RISK";
};

const normalizePrediction = (data) => {
  const explicitProbability = Number(data?.fraudProbability);
  const rawRiskScore = Number(data?.riskScore);
  const fraudProbability = Number.isFinite(explicitProbability)
    ? explicitProbability
    : rawRiskScore / 100;
  const riskScore = Number.isFinite(rawRiskScore) ? rawRiskScore : fraudProbability * 100;
  const rawDecision = data?.decision;
  const rawRiskLevel = data?.riskLevel || (VALID_RISK_LEVELS.has(rawDecision) ? rawDecision : null);
  const statusDecision = VALID_ACTIONS.has(rawDecision)
    ? rawDecision
    : actionFromRiskLevel(rawRiskLevel);
  const riskLevel = VALID_RISK_LEVELS.has(rawRiskLevel)
    ? rawRiskLevel
    : riskLevelFromAction(statusDecision);

  if (
    !Number.isFinite(fraudProbability) ||
    !Number.isFinite(riskScore) ||
    !VALID_ACTIONS.has(statusDecision) ||
    !VALID_RISK_LEVELS.has(riskLevel)
  ) {
    return null;
  }

  return {
    success: data.success !== false,
    fraudProbability: Math.max(0, Math.min(fraudProbability, 1)),
    riskScore: Math.max(0, Math.min(riskScore, 100)),
    decision: statusDecision,
    status: statusDecision,
    riskLevel,
    modelVersion: data.modelVersion || "unknown",
    featureContributions: data.featureContributions || data.shapExplanation || {},
    shapExplanation: data.shapExplanation || data.featureContributions || {},
    thresholdPolicy: data.thresholdPolicy || {},
    metrics: data.metrics || null,
    serviceAvailable: true
  };
};

const fallbackPrediction = (reason = "AI service unavailable") => ({
  success: false,
  data: {
    fraudProbability: 0,
    riskScore: 0,
    decision: "ALLOWED",
    status: "ALLOWED",
    riskLevel: "LOW_RISK",
    modelVersion: "rules-fallback",
    featureContributions: {},
    shapExplanation: {},
    thresholdPolicy: {},
    metrics: null,
    serviceAvailable: false,
    reason
  }
});

const getFraudPrediction = async (transactionPayload) => {
  const aiEngineUrl = (process.env.AI_ENGINE_URL || "http://localhost:8000").replace(/\/$/, "");
  const timeoutMs = parsePositiveInteger(process.env.AI_REQUEST_TIMEOUT_MS, 4500);
  const attempts = parsePositiveInteger(process.env.AI_REQUEST_RETRY_ATTEMPTS, 2);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await axios.post(`${aiEngineUrl}/predict`, transactionPayload, {
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "X-AI-API-Key": process.env.AI_ENGINE_API_KEY
        }
      });

      const normalized = normalizePrediction(response.data);
      if (!normalized) {
        logger.warn("AI service returned an invalid fraud response", {
          response: response.data
        });
        return fallbackPrediction("AI service returned an invalid response");
      }

      return {
        success: true,
        data: normalized
      };
    } catch (error) {
      lastError = error;
      const statusCode = error.response?.status;
      logger.warn("AI service request attempt failed", {
        attempt,
        attempts,
        message: error.message,
        code: error.code,
        statusCode
      });

      if (statusCode >= 400 && statusCode < 500) {
        break;
      }

      if (attempt < attempts) {
        await sleep(200 * attempt);
      }
    }
  }

  return fallbackPrediction(lastError?.message || "AI service unavailable");
};

module.exports = { getFraudPrediction, normalizePrediction };
