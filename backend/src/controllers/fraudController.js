const mongoose = require("mongoose");
const FraudAlert = require("../models/FraudAlert");
const Transaction = require("../models/Transaction");
const AppError = require("../utils/AppError");
const asyncHandler = require("../middleware/asyncHandler");
const { buildFraudAnalytics } = require("../services/fraudAnalyticsService");
const { logAuditEvent } = require("../services/auditLogService");

exports.getFraudAlerts = asyncHandler(async (req, res) => {
  const alerts = await FraudAlert.find()
    .populate("userId", "name email role")
    .populate("transactionId")
    .sort({ createdAt: -1 })
    .limit(100);

  return res.status(200).json({ success: true, alerts });
});

exports.updateAlertStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError("Alert id is invalid", 400, "INVALID_ALERT_ID");
  }

  const alert = await FraudAlert.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true, runValidators: true }
  );

  if (!alert) {
    throw new AppError("Alert not found", 404, "ALERT_NOT_FOUND");
  }

  await logAuditEvent({
    req,
    eventType: "ADMIN_ACTION",
    outcome: "SUCCESS",
    severity: "MEDIUM",
    actorUserId: req.user?._id,
    actorEmail: req.user?.email,
    metadata: {
      action: "UPDATE_FRAUD_ALERT_STATUS",
      alertId: req.params.id,
      status: req.body.status
    }
  });

  return res.status(200).json({ success: true, alert });
});

exports.getFraudStats = asyncHandler(async (req, res) => {
  const [totalTransactions, flaggedTransactions, blockedTransactions, openAlerts, transactions, alerts] =
    await Promise.all([
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: "FLAGGED_OTP" }),
      Transaction.countDocuments({ status: "BLOCKED" }),
      FraudAlert.countDocuments({ status: { $in: ["OPEN", "REVIEWING"] } }),
      Transaction.find().sort({ timestamp: -1 }).limit(500),
      FraudAlert.find().sort({ createdAt: -1 }).limit(100)
    ]);
  const analytics = buildFraudAnalytics(transactions, alerts);

  return res.status(200).json({
    success: true,
    stats: {
      totalTransactions,
      highRiskTransactions: flaggedTransactions + blockedTransactions,
      blockedTransactions,
      flaggedTransactions,
      openAlerts,
      highConfidenceAiTransactions: analytics.summary.highConfidenceAiTransactions,
      averageAiConfidence: analytics.aiConfidenceLevels.averageConfidence
    },
    riskTrends: analytics.riskTrends,
    suspiciousGeolocationActivity: analytics.suspiciousGeolocationActivity,
    recentAlerts: analytics.recentAlerts,
    aiConfidenceLevels: analytics.aiConfidenceLevels
  });
});
