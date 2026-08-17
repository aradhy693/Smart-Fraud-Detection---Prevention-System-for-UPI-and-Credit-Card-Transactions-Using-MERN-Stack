const axios = require("axios");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getAiBaseUrl = () => (process.env.AI_ENGINE_URL || "http://localhost:8000").replace(/\/$/, "");

const requestAiPlatform = async ({ method = "GET", path, data, params }) => {
  const timeout = parsePositiveInteger(process.env.AI_PLATFORM_TIMEOUT_MS, 6000);
  try {
    const response = await axios({
      method,
      url: `${getAiBaseUrl()}${path}`,
      data,
      params,
      timeout,
      headers: {
        "Content-Type": "application/json",
        "X-AI-API-Key": process.env.AI_ENGINE_API_KEY
      }
    });
    return response.data;
  } catch (error) {
    logger.warn("AI platform request failed", {
      method,
      path,
      code: error.code,
      statusCode: error.response?.status,
      message: error.message
    });

    throw new AppError(
      "AI platform request failed",
      error.response?.status || 502,
      "AI_PLATFORM_UNAVAILABLE",
      [
        {
          field: "aiPlatform",
          message: error.response?.data?.message || error.message
        }
      ]
    );
  }
};

const getAiDashboard = () => requestAiPlatform({ path: "/ai/dashboard" });
const getModelRegistry = () => requestAiPlatform({ path: "/ai/models" });
const getFeatureStore = () => requestAiPlatform({ path: "/ai/features" });
const getDriftReport = (limit) => requestAiPlatform({ path: "/ai/drift", params: { limit } });
const getPredictionHistory = (limit) => requestAiPlatform({ path: "/ai/predictions", params: { limit } });
const getPlatformHealth = () => requestAiPlatform({ path: "/ai/health" });
const getExplainability = (predictionId) =>
  requestAiPlatform({ path: `/ai/explainability/${encodeURIComponent(predictionId)}` });
const promoteModel = (version) =>
  requestAiPlatform({ method: "POST", path: `/ai/models/${encodeURIComponent(version)}/promote` });
const rollbackModel = (targetVersion) =>
  requestAiPlatform({ method: "POST", path: "/ai/models/rollback", data: { targetVersion } });
const submitFeedback = (payload) =>
  requestAiPlatform({ method: "POST", path: "/ai/feedback", data: payload });
const retrainModel = (background = false) =>
  requestAiPlatform({ method: "POST", path: "/ai/retrain", params: { background } });
const batchPredict = (transactions) =>
  requestAiPlatform({ method: "POST", path: "/ai/batch-predict", data: { transactions } });
const queuePrediction = (payload) =>
  requestAiPlatform({ method: "POST", path: "/ai/predict-async", data: payload });
const getPredictionJob = (jobId) =>
  requestAiPlatform({ path: `/ai/prediction-jobs/${encodeURIComponent(jobId)}` });

module.exports = {
  batchPredict,
  getAiDashboard,
  getDriftReport,
  getExplainability,
  getFeatureStore,
  getModelRegistry,
  getPlatformHealth,
  getPredictionHistory,
  getPredictionJob,
  promoteModel,
  queuePrediction,
  requestAiPlatform,
  retrainModel,
  rollbackModel,
  submitFeedback
};
