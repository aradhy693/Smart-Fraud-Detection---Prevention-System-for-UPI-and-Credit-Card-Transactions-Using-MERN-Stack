const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const AuthSession = require("../models/AuthSession");
const { getClientIp } = require("../utils/network");
const { getDeviceFingerprint, getUserAgentFromRequest } = require("../utils/deviceFingerprint");
const { buildSecurityError, SECURITY_ERROR_CODES } = require("../security/authErrors");
const { createSecurityEvent } = require("./securityEventService");

const DEFAULT_ACCESS_TOKEN_MS = 15 * 60 * 1000;
const DEFAULT_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const getSessionExpirationDate = () => {
  const ttlMs = parseDurationMs(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d", DEFAULT_SESSION_MS);
  return new Date(Date.now() + ttlMs);
};

const getEffectiveSessionExpiry = (session) => {
  if (!session) {
    return null;
  }

  const expiry = session.refreshTokenExpiresAt || session.expiresAt;
  return expiry ? new Date(expiry) : null;
};

const isSessionExpired = (session) => {
  const expiry = getEffectiveSessionExpiry(session);
  return Boolean(expiry && expiry.getTime() <= Date.now());
};

const parseDurationMs = (value, fallback = DEFAULT_SESSION_MS) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value * 1000;
  }

  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const match = trimmed.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
};

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const getUserAgent = (req) => getUserAgentFromRequest(req);

const getAccessTokenExpirationDate = () => {
  const ttlMs = parseDurationMs(
    process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "15m",
    DEFAULT_ACCESS_TOKEN_MS
  );
  return new Date(Date.now() + ttlMs);
};

const createAccessTokenForSession = ({ user, sessionId, jwtSecret }) => {
  const tokenId = crypto.randomUUID();
  const payload = {
    id: user._id.toString(),
    role: user.role,
    sid: sessionId.toString()
  };
  const token = jwt.sign(payload, jwtSecret, {
    algorithm: "HS256",
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "15m",
    jwtid: tokenId
  });
  const expiresAt = getAccessTokenExpirationDate();

  return {
    token,
    tokenHash: sha256(token),
    tokenId,
    expiresAt
  };
};

const createAuthSession = async ({
  user,
  req,
  jwtSecret,
  device,
  mfaRequired = false,
  mfaVerified = false,
  riskScore = 0,
  riskLevel = "LOW"
}) => {
  const issuedAt = new Date();
  const sessionId = new mongoose.Types.ObjectId();
  const accessToken = createAccessTokenForSession({ user, sessionId, jwtSecret });
  const sessionExpiresAt = getSessionExpirationDate();

  const session = await AuthSession.create({
    _id: sessionId,
    userId: user._id,
    tokenId: accessToken.tokenId,
    tokenHash: accessToken.tokenHash,
    role: user.role,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    deviceFingerprint: getDeviceFingerprint(req),
    deviceId: device?.deviceId,
    mfaRequired,
    mfaVerified,
    mfaVerifiedAt: mfaVerified ? issuedAt : undefined,
    deviceBound: true,
    sessionRiskScore: riskScore,
    riskLevel,
    issuedAt,
    expiresAt: sessionExpiresAt,
    refreshTokenExpiresAt: sessionExpiresAt,
    lastSeenAt: issuedAt
  });

  return {
    token: accessToken.token,
    session,
    tokenId: accessToken.tokenId,
    expiresAt: accessToken.expiresAt
  };
};

const resolveQuery = async (query, selectExpression) => {
  if (query && typeof query.select === "function") {
    return query.select(selectExpression);
  }

  return query;
};

const validateAuthSession = async ({ decoded, token, req }) => {
  if (!decoded?.jti || !decoded?.sid || !mongoose.isValidObjectId(decoded.sid)) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "Token is missing a valid session binding." }
    ]);
  }

  const session = await resolveQuery(
    AuthSession.findOne({
      _id: decoded.sid,
      userId: decoded.id,
      tokenId: decoded.jti
    }),
    "+tokenHash"
  );

  if (!session) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "Token session was not found." }
    ]);
  }

  if (!session.isActive || session.revokedAt) {
    throw buildSecurityError(SECURITY_ERROR_CODES.SESSION_EXPIRED, [
      { field: "session", message: "Session is no longer active." }
    ]);
  }

  if (isSessionExpired(session)) {
    await AuthSession.updateOne(
      { _id: session._id },
      { $set: { isActive: false, revokedAt: new Date(), revokedReason: "EXPIRED" } }
    );
    throw buildSecurityError(SECURITY_ERROR_CODES.SESSION_EXPIRED, [
      { field: "session", message: "Session has expired." }
    ]);
  }

  if (session.tokenHash !== sha256(token)) {
    await AuthSession.updateOne(
      { _id: session._id },
      {
        $set: {
          isActive: false,
          revokedAt: new Date(),
          revokedReason: "TOKEN_HASH_MISMATCH"
        },
        $addToSet: { anomalyFlags: "TOKEN_HASH_MISMATCH" }
      }
    );
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "Token replay or tampering was detected." }
    ]);
  }

  const currentFingerprint = getDeviceFingerprint(req);
  const anomalyFlags = [];
  if (session.deviceFingerprint !== currentFingerprint) {
    anomalyFlags.push("DEVICE_FINGERPRINT_CHANGED");
  }

  if (session.deviceBound && anomalyFlags.includes("DEVICE_FINGERPRINT_CHANGED")) {
    await AuthSession.updateOne(
      { _id: session._id },
      {
        $set: {
          isActive: false,
          revokedAt: new Date(),
          revokedReason: "DEVICE_CLONE_ATTEMPT"
        },
        $addToSet: { anomalyFlags: "DEVICE_CLONE_ATTEMPT" }
      }
    );
    await createSecurityEvent({
      req,
      eventType: "DEVICE_CLONE_ATTEMPT",
      severity: "CRITICAL",
      userId: session.userId,
      sessionId: session._id,
      deviceId: session.deviceId,
      riskScore: 100,
      riskLevel: "HIGH",
      metadata: {
        reason: "SESSION_DEVICE_FINGERPRINT_MISMATCH"
      }
    });
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "device", message: "Session device binding failed." }
    ]);
  }

  if (anomalyFlags.length > 0) {
    await AuthSession.updateOne(
      { _id: session._id },
      {
        $set: { lastSeenAt: new Date() },
        $addToSet: { anomalyFlags: { $each: anomalyFlags } }
      }
    );
  } else {
    await AuthSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } });
  }

  return {
    session,
    anomalyFlags
  };
};

const revokeAuthSession = async ({ sessionId, userId, tokenId, reason = "USER_LOGOUT" }) => {
  const filter = {
    isActive: true
  };

  if (sessionId) {
    filter._id = sessionId;
  }

  if (userId) {
    filter.userId = userId;
  }

  if (tokenId) {
    filter.tokenId = tokenId;
  }

  return AuthSession.updateOne(filter, {
    $set: {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason
    }
  });
};

const updateSessionAccessToken = async ({ sessionId, user, jwtSecret }) => {
  const accessToken = createAccessTokenForSession({ user, sessionId, jwtSecret });

  await AuthSession.updateOne(
    { _id: sessionId, userId: user._id, isActive: true },
    {
      $set: {
        tokenId: accessToken.tokenId,
        tokenHash: accessToken.tokenHash,
        role: user.role,
        lastSeenAt: new Date()
      }
    }
  );

  return {
    token: accessToken.token,
    tokenId: accessToken.tokenId,
    expiresAt: accessToken.expiresAt
  };
};

const revokeAllUserSessions = async ({ userId, exceptSessionId, reason = "USER_LOGOUT_ALL" }) => {
  const filter = {
    userId,
    isActive: true
  };

  if (exceptSessionId) {
    filter._id = { $ne: exceptSessionId };
  }

  return AuthSession.updateMany(filter, {
    $set: {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason
    }
  });
};

const cleanupExpiredSessions = async ({ userId } = {}) => {
  const now = new Date();
  const filter = {
    isActive: true,
    $or: [
      { refreshTokenExpiresAt: { $lte: now } },
      {
        $and: [
          {
            $or: [{ refreshTokenExpiresAt: { $exists: false } }, { refreshTokenExpiresAt: null }]
          },
          { expiresAt: { $lte: now } }
        ]
      }
    ]
  };

  if (userId) {
    filter.userId = userId;
  }

  return AuthSession.updateMany(filter, {
    $set: {
      isActive: false,
      revokedAt: now,
      revokedReason: "EXPIRED"
    }
  });
};

const listActiveSessionsForUser = async (userId) => {
  const now = new Date();

  return AuthSession.find({
    userId,
    isActive: true,
    $or: [
      { refreshTokenExpiresAt: { $gt: now } },
      {
        $and: [
          {
            $or: [{ refreshTokenExpiresAt: { $exists: false } }, { refreshTokenExpiresAt: null }]
          },
          { expiresAt: { $gt: now } }
        ]
      }
    ]
  })
    .select("-tokenHash")
    .sort({ lastSeenAt: -1 })
    .limit(20);
};

module.exports = {
  cleanupExpiredSessions,
  createAccessTokenForSession,
  createAuthSession,
  getAccessTokenExpirationDate,
  getDeviceFingerprint,
  getEffectiveSessionExpiry,
  getSessionExpirationDate,
  getUserAgent,
  isSessionExpired,
  listActiveSessionsForUser,
  parseDurationMs,
  revokeAllUserSessions,
  revokeAuthSession,
  sha256,
  updateSessionAccessToken,
  validateAuthSession
};
