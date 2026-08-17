const SecurityEvent = require("../models/SecurityEvent");
const { getClientIp } = require("../utils/network");
const { logAuditEvent } = require("./auditLogService");
const logger = require("../utils/logger");

const auditEventForSecurityEvent = (eventType) => {
  if (
    [
      "ACCOUNT_TAKEOVER_SUSPECTED",
      "NEW_DEVICE_LOGIN",
      "MFA_BYPASS_ATTEMPT",
      "DEVICE_CLONE_ATTEMPT",
      "MFA_ENABLED",
      "MFA_DISABLED",
      "RECOVERY_CODE_USED",
      "TRUSTED_DEVICE_CHANGED",
      "HIGH_THREAT_IP",
      "VPN_LOGIN",
      "TOR_DETECTION",
      "IMPOSSIBLE_TRAVEL",
      "CRITICAL_FRAUD",
      "THREAT_ALERT"
    ].includes(eventType)
  ) {
    return eventType;
  }

  return "SUSPICIOUS_AUTH";
};

const createSecurityEvent = async ({
  req,
  eventType,
  severity = "LOW",
  userId,
  sessionId,
  deviceId,
  riskScore = 0,
  riskLevel = "LOW",
  metadata = {}
}) => {
  try {
    const event = await SecurityEvent.create({
      eventType,
      severity,
      userId: userId || req?.user?._id,
      sessionId,
      deviceId,
      ipAddress: req ? getClientIp(req) : undefined,
      riskScore,
      riskLevel,
      metadata
    });

    await logAuditEvent({
      req,
      eventType: auditEventForSecurityEvent(eventType),
      outcome: severity === "CRITICAL" || severity === "HIGH" ? "BLOCKED" : "SUCCESS",
      severity,
      actorUserId: userId || req?.user?._id,
      sessionId,
      metadata: {
        securityEventId: event._id,
        eventType,
        riskScore,
        riskLevel,
        ...metadata
      }
    });

    return event;
  } catch (error) {
    logger.warn("Failed to persist security event", {
      eventType,
      severity,
      message: error.message
    });
    return null;
  }
};

module.exports = {
  createSecurityEvent
};
