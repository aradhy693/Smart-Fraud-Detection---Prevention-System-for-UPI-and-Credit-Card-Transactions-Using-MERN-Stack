const asyncHandler = require("../middleware/asyncHandler");
const { logAuditEvent } = require("../services/auditLogService");
const aiPlatform = require("../services/aiPlatformService");

const auditAiAction = ({ req, action, metadata = {}, severity = "LOW" }) =>
  logAuditEvent({
    req,
    eventType: "ADMIN_ACTION",
    outcome: "SUCCESS",
    severity,
    actorUserId: req.user?._id,
    actorEmail: req.user?.email,
    metadata: {
      action,
      ...metadata
    }
  });

exports.getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await aiPlatform.getAiDashboard();
  return res.status(200).json(dashboard);
});

exports.getModels = asyncHandler(async (req, res) => {
  const registry = await aiPlatform.getModelRegistry();
  return res.status(200).json(registry);
});

exports.promoteModel = asyncHandler(async (req, res) => {
  const result = await aiPlatform.promoteModel(req.params.version);
  await auditAiAction({
    req,
    action: "PROMOTE_AI_MODEL",
    severity: "HIGH",
    metadata: { version: req.params.version }
  });
  return res.status(200).json(result);
});

exports.rollbackModel = asyncHandler(async (req, res) => {
  const result = await aiPlatform.rollbackModel(req.body?.targetVersion || null);
  await auditAiAction({
    req,
    action: "ROLLBACK_AI_MODEL",
    severity: "HIGH",
    metadata: { targetVersion: req.body?.targetVersion || null }
  });
  return res.status(200).json(result);
});

exports.getFeatures = asyncHandler(async (req, res) => {
  const features = await aiPlatform.getFeatureStore();
  return res.status(200).json(features);
});

exports.getDrift = asyncHandler(async (req, res) => {
  const drift = await aiPlatform.getDriftReport(req.query.limit);
  return res.status(200).json(drift);
});

exports.getPredictions = asyncHandler(async (req, res) => {
  const predictions = await aiPlatform.getPredictionHistory(req.query.limit);
  return res.status(200).json(predictions);
});

exports.getExplainability = asyncHandler(async (req, res) => {
  const explanation = await aiPlatform.getExplainability(req.params.predictionId);
  return res.status(200).json(explanation);
});

exports.getHealth = asyncHandler(async (req, res) => {
  const health = await aiPlatform.getPlatformHealth();
  return res.status(200).json(health);
});

exports.submitFeedback = asyncHandler(async (req, res) => {
  const result = await aiPlatform.submitFeedback({
    ...req.body,
    analystId: req.user?._id?.toString()
  });
  await auditAiAction({
    req,
    action: "SUBMIT_AI_FEEDBACK",
    metadata: {
      predictionId: req.body?.predictionId,
      label: req.body?.label
    }
  });
  return res.status(200).json(result);
});

exports.retrain = asyncHandler(async (req, res) => {
  const result = await aiPlatform.retrainModel(Boolean(req.body?.background));
  await auditAiAction({
    req,
    action: "RETRAIN_AI_MODEL",
    severity: "HIGH",
    metadata: { background: Boolean(req.body?.background) }
  });
  return res.status(200).json(result);
});

exports.batchPredict = asyncHandler(async (req, res) => {
  const result = await aiPlatform.batchPredict(req.body?.transactions || []);
  return res.status(200).json(result);
});

exports.queuePrediction = asyncHandler(async (req, res) => {
  const result = await aiPlatform.queuePrediction(req.body || {});
  return res.status(202).json(result);
});

exports.getPredictionJob = asyncHandler(async (req, res) => {
  const result = await aiPlatform.getPredictionJob(req.params.jobId);
  return res.status(200).json(result);
});
