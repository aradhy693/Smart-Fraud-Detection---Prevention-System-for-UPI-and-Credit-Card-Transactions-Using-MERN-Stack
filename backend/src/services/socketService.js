const logger = require("../utils/logger");

const getSocketEmitter = (io) => io || null;
const toPlainReasons = (riskReasons) => {
  if (!riskReasons) return {};
  if (riskReasons instanceof Map) return Object.fromEntries(riskReasons);
  if (typeof riskReasons.toObject === "function") return riskReasons.toObject();
  return { ...riskReasons };
};

const buildTransactionEventPayload = (transaction, eventType) => ({
  eventType,
  transactionId: transaction.transactionReference || transaction._id,
  id: transaction._id,
  userId: transaction.userId || null,
  amount: transaction.amount,
  paymentType: transaction.paymentMethod,
  status: transaction.status,
  riskLevel: transaction.riskLevel,
  fraudProbability: transaction.fraudScore,
  aiFraudProbability: transaction.aiFraudProbability || 0,
  aiRiskScore: transaction.aiRiskScore || 0,
  aiDecision: transaction.aiDecision || "UNAVAILABLE",
  modelVersion: transaction.modelVersion || "rules-fallback",
  riskReasons: toPlainReasons(transaction.riskReasons),
  riskSignals: transaction.riskSignals || {},
  geoLocation: transaction.location || null,
  timestamp: transaction.timestamp || new Date()
});

const emitToSecurityRooms = (emitter, eventName, payload, rooms = ["admin-dashboard"]) => {
  if (typeof emitter.to === "function") {
    rooms.forEach((room) => {
      emitter.to(room).emit(eventName, payload);
    });
    return true;
  }

  emitter.emit(eventName, payload);
  return true;
};

const emitNewTransaction = (transaction, io) => {
  const emitter = getSocketEmitter(io);
  if (!emitter) {
    logger.warn("Socket emitter unavailable for new transaction event");
    return false;
  }

  return emitToSecurityRooms(emitter, "new-transaction", transaction);
};

const emitFraudAlert = (alert, io) => {
  const emitter = getSocketEmitter(io);
  if (!emitter) {
    logger.warn("Socket emitter unavailable for fraud alert event");
    return false;
  }

  if (typeof emitter.to === "function") {
    emitter.to("admin-dashboard").emit("fraud-alert", alert);
    return true;
  }

  emitter.emit("fraud-alert", alert);
  return true;
};

const emitSuspiciousTransaction = (transaction, io) => {
  const emitter = getSocketEmitter(io);
  if (!emitter) {
    logger.warn("Socket emitter unavailable for suspicious transaction event");
    return false;
  }

  const payload = buildTransactionEventPayload(transaction, "suspicious-transaction");
  return emitToSecurityRooms(emitter, "suspicious-transaction", payload);
};

const emitBlockedTransaction = (transaction, io) => {
  const emitter = getSocketEmitter(io);
  if (!emitter) {
    logger.warn("Socket emitter unavailable for blocked transaction event");
    return false;
  }

  const payload = buildTransactionEventPayload(transaction, "blocked-transaction");
  return emitToSecurityRooms(emitter, "blocked-transaction", payload);
};

const emitSocEvent = (eventName, payload, io) => {
  const emitter = getSocketEmitter(io);
  if (!emitter) {
    logger.warn("Socket emitter unavailable for SOC event", { eventName });
    return false;
  }

  emitter.emit(eventName, payload);
  if (typeof emitter.to === "function") {
    emitter.to("soc-dashboard").emit(eventName, payload);
    emitter.to("admin-dashboard").emit(eventName, payload);
  }
  return true;
};

const emitAiPlatformEvent = (eventName, payload, io) => {
  const emitter = getSocketEmitter(io);
  if (!emitter) {
    logger.warn("Socket emitter unavailable for AI platform event", { eventName });
    return false;
  }

  emitter.emit(eventName, payload);
  if (typeof emitter.to === "function") {
    emitter.to("ai-dashboard").emit(eventName, payload);
    emitter.to("admin-dashboard").emit(eventName, payload);
  }
  return true;
};

module.exports = {
  buildTransactionEventPayload,
  emitAiPlatformEvent,
  emitBlockedTransaction,
  emitFraudAlert,
  emitNewTransaction,
  emitSocEvent,
  emitSuspiciousTransaction
};
