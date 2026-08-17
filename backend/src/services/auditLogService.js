const AuditLog = require("../models/AuditLog");
const { getClientIp } = require("../utils/network");
const logger = require("../utils/logger");

const normalizeMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
};

const buildRequestAuditContext = (req) => ({
  ipAddress: req ? getClientIp(req) : undefined,
  userAgent: req?.headers?.["user-agent"] || "unknown",
  sessionId: req?.authSession?._id,
  tokenId: req?.authTokenId
});

const logAuditEvent = async ({
  req,
  eventType,
  outcome,
  severity = "LOW",
  actorUserId,
  actorEmail,
  targetUserId,
  ipAddress,
  userAgent,
  sessionId,
  tokenId,
  metadata
}) => {
  const requestContext = buildRequestAuditContext(req);

  try {
    await AuditLog.create({
      eventType,
      outcome,
      severity,
      actorUserId: actorUserId || req?.user?._id,
      actorEmail,
      targetUserId,
      ipAddress: ipAddress || requestContext.ipAddress,
      userAgent: userAgent || requestContext.userAgent,
      sessionId: sessionId || requestContext.sessionId,
      tokenId: tokenId || requestContext.tokenId,
      metadata: normalizeMetadata(metadata)
    });
  } catch (error) {
    logger.warn("Failed to persist security audit event", {
      eventType,
      outcome,
      severity,
      message: error.message
    });
  }
};

module.exports = {
  logAuditEvent
};
