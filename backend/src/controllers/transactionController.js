const Transaction = require("../models/Transaction");
const FraudAlert = require("../models/FraudAlert");
const AppError = require("../utils/AppError");
const asyncHandler = require("../middleware/asyncHandler");
const { buildFraudAnalytics, toPlainReasons } = require("../services/fraudAnalyticsService");
const {
  emitBlockedTransaction,
  emitFraudAlert,
  emitNewTransaction,
  emitSuspiciousTransaction
} = require("../services/socketService");

const formatTransaction = (transaction) => {
  const decision = transaction.status === "BLOCKED" ? "HIGH_RISK" : (transaction.status === "FLAGGED_OTP" ? "MEDIUM_RISK" : "LOW_RISK");
  const transactionId = transaction.transactionReference || transaction._id;
  return {
    _id: transaction._id,
    transactionId,
    transactionReference: transaction.transactionReference,
    paymentType: transaction.paymentMethod === "CREDIT_CARD" ? "CARD" : transaction.paymentMethod,
    transactionAmount: transaction.amount,
    amount: transaction.amount,
    city: transaction.location?.city || "Unknown",
    geoLocation: {
      city: transaction.location?.city || "Unknown",
      latitude: transaction.location?.latitude,
      longitude: transaction.location?.longitude
    },
    decision: decision,
    fraudDecision: decision,
    fraudRiskScore: transaction.fraudScore,
    aiFraudProbability: transaction.aiFraudProbability || 0,
    aiRiskScore: transaction.aiRiskScore || 0,
    aiDecision: transaction.aiDecision || "UNAVAILABLE",
    modelVersion: transaction.modelVersion || "rules-fallback",
    riskSignals: transaction.riskSignals || {},
    riskReasons: toPlainReasons(transaction.riskReasons),
    transactionStatus: transaction.status,
    status: transaction.status,
    timestamp: transaction.timestamp
  };
};

exports.formatTransaction = formatTransaction;

exports.createTransaction = asyncHandler(async (req, res) => {
  if (!req.fraudReport) {
    throw new AppError("Fraud report was not generated", 500, "FRAUD_REPORT_MISSING");
  }

  const {
    amount,
    paymentMethod,
    identifier,
    ipAddress,
    location,
    deviceId,
    aiFraudProbability,
    aiRiskScore,
    aiDecision,
    riskLevel,
    modelVersion,
    riskSignals
  } =
    req.normalizedTransaction || req.body;
  const { fraudScore, status, reasons, alertType, severity } = req.fraudReport;

  const transaction = await Transaction.create({
    userId: req.user?._id || null,
    amount,
    paymentMethod,
    identifier,
    ipAddress,
    location,
    deviceId,
    fraudScore,
    aiFraudProbability,
    aiRiskScore,
    aiDecision,
    riskLevel,
    modelVersion,
    status,
    riskReasons: reasons,
    riskSignals
  });

  const formatted = formatTransaction(transaction);

  if (status === "BLOCKED" || status === "FLAGGED_OTP") {
    const alert = await FraudAlert.create({
      transactionId: transaction._id,
      userId: req.user?._id || null,
      alertType,
      severity,
      message: `Transaction ${transaction.transactionReference || transaction._id} of INR ${amount} via ${paymentMethod} was ${status === "BLOCKED" ? "blocked" : "flagged for OTP verification"} with AI confidence ${Math.round((aiFraudProbability || 0) * 100)}%`,
      status: "OPEN",
      aiConfidence: aiFraudProbability || 0,
      riskScore: Math.round((fraudScore || 0) * 100),
      metadata: {
        modelVersion,
        aiDecision,
        riskLevel,
        riskSignals
      }
    });

    const populatedAlert = await FraudAlert.findById(alert._id)
      .populate("userId", "name email role")
      .populate("transactionId");

    emitFraudAlert(populatedAlert || alert, req.io);
    emitSuspiciousTransaction(transaction, req.io);
    if (status === "BLOCKED") {
      emitBlockedTransaction(transaction, req.io);
    }
  }

  emitNewTransaction(formatted, req.io);

  return res.status(201).json({
    success: true,
    message: "Transaction processed successfully",
    data: formatted,
    fraudReport: {
      status: req.fraudReport.status,
      decision: req.fraudReport.decision,
      fraudScore: req.fraudReport.fraudScore,
      aiFraudProbability: req.fraudReport.aiFraudProbability,
      aiRiskScore: req.fraudReport.aiRiskScore,
      aiDecision: req.fraudReport.aiDecision,
      modelVersion: req.fraudReport.modelVersion,
      reasons: req.fraudReport.reasons,
      riskSignals: req.fraudReport.riskSignals
    }
  });
});

exports.getTransactions = asyncHandler(async (req, res) => {
  const transactions = await Transaction.find().sort({ timestamp: -1 }).limit(100);
  const formatted = transactions.map(formatTransaction);
  return res.status(200).json({
    success: true,
    transactions: formatted
  });
});

exports.getAdminDashboard = asyncHandler(async (req, res) => {
  const [transactions, alerts] = await Promise.all([
    Transaction.find().sort({ timestamp: -1 }).limit(500),
    FraudAlert.find().sort({ createdAt: -1 }).limit(100)
  ]);
  const formatted = transactions.map(formatTransaction);
  const analytics = buildFraudAnalytics(transactions, alerts);

  return res.status(200).json({
    success: true,
    summary: analytics.summary,
    riskTrends: analytics.riskTrends,
    suspiciousGeolocationActivity: analytics.suspiciousGeolocationActivity,
    recentAlerts: analytics.recentAlerts,
    aiConfidenceLevels: analytics.aiConfidenceLevels,
    data: formatted
  });
});
