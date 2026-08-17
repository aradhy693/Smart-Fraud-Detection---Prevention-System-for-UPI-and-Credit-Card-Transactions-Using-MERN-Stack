const crypto = require("crypto");
const mongoose = require("mongoose");
const AuthSession = require("../models/AuthSession");
const RefreshToken = require("../models/RefreshToken");
const User = require("../models/User");
const { buildSecurityError, SECURITY_ERROR_CODES } = require("../security/authErrors");
const { getClientIp, isPrivateIpAddress } = require("../utils/network");
const { logAuditEvent } = require("./auditLogService");
const {
  getDeviceFingerprint,
  getUserAgent,
  isSessionExpired,
  parseDurationMs,
  sha256,
  updateSessionAccessToken
} = require("./sessionService");

const DEFAULT_REFRESH_TOKEN_MS = 7 * 24 * 60 * 60 * 1000;

const getRefreshTokenExpirationDate = () => {
  const ttlMs = parseDurationMs(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d", DEFAULT_REFRESH_TOKEN_MS);
  return new Date(Date.now() + ttlMs);
};

const timingSafeEqualString = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const generateRefreshTokenMaterial = (familyId = crypto.randomUUID()) => {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(48).toString("base64url");
  const token = `${familyId}.${tokenId}.${secret}`;

  return {
    familyId,
    tokenId,
    token,
    tokenHash: sha256(token)
  };
};

const parseRefreshToken = (token) => {
  if (typeof token !== "string" || !token.trim()) {
    return null;
  }

  const [familyId, tokenId, secret, ...rest] = token.trim().split(".");
  if (!familyId || !tokenId || !secret || rest.length > 0) {
    return null;
  }

  return {
    familyId,
    tokenId,
    tokenHash: sha256(token.trim())
  };
};

const createRefreshTokenRecord = async ({
  user,
  session,
  req,
  familyId,
  parentTokenId,
  rotationCounter = 0
}) => {
  const material = generateRefreshTokenMaterial(familyId);
  const expiresAt = getRefreshTokenExpirationDate();

  const record = await RefreshToken.create({
    tokenId: material.tokenId,
    familyId: material.familyId,
    sessionId: session._id,
    userId: user._id,
    tokenHash: material.tokenHash,
    parentTokenId,
    rotationCounter,
    expiresAt,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    deviceFingerprint: getDeviceFingerprint(req)
  });

  await AuthSession.updateOne(
    { _id: session._id, userId: user._id },
    {
      $set: {
        refreshTokenFamilyId: material.familyId,
        currentRefreshTokenId: material.tokenId,
        refreshTokenExpiresAt: expiresAt,
        expiresAt
      }
    }
  );

  return {
    refreshToken: material.token,
    refreshTokenId: material.tokenId,
    familyId: material.familyId,
    expiresAt,
    record
  };
};

const createInitialRefreshToken = ({ user, session, req }) =>
  createRefreshTokenRecord({
    user,
    session,
    req,
    rotationCounter: 0
  });

const findRefreshTokenWithHash = async ({ familyId, tokenId }) => {
  const query = RefreshToken.findOne({ familyId, tokenId });
  if (query && typeof query.select === "function") {
    return query.select("+tokenHash");
  }

  return query;
};

const findAnyTokenInFamily = async (familyId) => RefreshToken.findOne({ familyId });

const revokeRefreshTokenFamily = async ({ familyId, reason, reuseDetected = false }) => {
  if (!familyId) {
    return { modifiedCount: 0 };
  }

  const now = new Date();
  const update = {
    $set: {
      isActive: false,
      revokedAt: now,
      revokedReason: reason
    }
  };

  if (reuseDetected) {
    update.$set.reuseDetectedAt = now;
  }

  const result = await RefreshToken.updateMany({ familyId }, update);
  await AuthSession.updateMany(
    { refreshTokenFamilyId: familyId, isActive: true },
    {
      $set: {
        isActive: false,
        revokedAt: now,
        revokedReason: reason
      },
      $addToSet: { anomalyFlags: reason }
    }
  );

  return result;
};

const revokeAllRefreshTokensForUser = async ({ userId, reason = "USER_LOGOUT_ALL" }) => {
  const now = new Date();
  return RefreshToken.updateMany(
    { userId, isActive: true },
    {
      $set: {
        isActive: false,
        revokedAt: now,
        revokedReason: reason
      }
    }
  );
};

const revokeOtherRefreshTokensForUser = async ({
  userId,
  exceptFamilyId,
  reason = "USER_LOGOUT_ALL"
}) => {
  const filter = { userId, isActive: true };

  if (exceptFamilyId) {
    filter.familyId = { $ne: exceptFamilyId };
  }

  const now = new Date();
  return RefreshToken.updateMany(filter, {
    $set: {
      isActive: false,
      revokedAt: now,
      revokedReason: reason
    }
  });
};

const cleanupExpiredRefreshTokens = async ({ userId } = {}) => {
  const filter = {
    isActive: true,
    expiresAt: { $lte: new Date() }
  };

  if (userId) {
    filter.userId = userId;
  }

  const now = new Date();
  return RefreshToken.updateMany(filter, {
    $set: {
      isActive: false,
      revokedAt: now,
      revokedReason: "EXPIRED"
    }
  });
};

const revokeRefreshTokenForSession = async ({ session, reason = "USER_LOGOUT" }) => {
  if (!session?.refreshTokenFamilyId) {
    return { modifiedCount: 0 };
  }

  return revokeRefreshTokenFamily({
    familyId: session.refreshTokenFamilyId,
    reason
  });
};

const buildRefreshError = (reason, statusCode = 401) =>
  buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
    {
      field: "refreshToken",
      message: reason
    }
  ], {
    message: reason,
    statusCode
  });

const handleRefreshReplay = async ({ req, tokenRecord, familyId, reason }) => {
  const resolvedFamilyId = familyId || tokenRecord?.familyId;

  await revokeRefreshTokenFamily({
    familyId: resolvedFamilyId,
    reason,
    reuseDetected: true
  });

  await logAuditEvent({
    req,
    eventType: "SUSPICIOUS_AUTH",
    outcome: "BLOCKED",
    severity: "CRITICAL",
    actorUserId: tokenRecord?.userId,
    sessionId: tokenRecord?.sessionId,
    tokenId: tokenRecord?.tokenId,
    metadata: {
      reason,
      refreshTokenFamilyId: resolvedFamilyId
    }
  });

  throw buildRefreshError("Refresh token reuse was detected. Session family revoked.");
};

const ensureRefreshTokenIsUsable = async ({ req, tokenRecord, parsedToken }) => {
  if (!tokenRecord) {
    const familyToken = await findAnyTokenInFamily(parsedToken.familyId);
    await handleRefreshReplay({
      req,
      tokenRecord: familyToken,
      familyId: parsedToken.familyId,
      reason: "REFRESH_TOKEN_NOT_FOUND"
    });
  }

  if (!timingSafeEqualString(tokenRecord.tokenHash, parsedToken.tokenHash)) {
    await handleRefreshReplay({
      req,
      tokenRecord,
      familyId: parsedToken.familyId,
      reason: "REFRESH_TOKEN_HASH_MISMATCH"
    });
  }

  if (!tokenRecord.isActive || tokenRecord.usedAt || tokenRecord.revokedAt) {
    await handleRefreshReplay({
      req,
      tokenRecord,
      familyId: parsedToken.familyId,
      reason: "REFRESH_TOKEN_REUSE"
    });
  }

  if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt).getTime() <= Date.now()) {
    await revokeRefreshTokenFamily({
      familyId: parsedToken.familyId,
      reason: "REFRESH_TOKEN_EXPIRED"
    });
    throw buildSecurityError(SECURITY_ERROR_CODES.SESSION_EXPIRED, [
      {
        field: "refreshToken",
        message: "Refresh token has expired."
      }
    ]);
  }
};

const resolveSession = async (tokenRecord) => {
  const query = AuthSession.findOne({
    _id: tokenRecord.sessionId,
    userId: tokenRecord.userId,
    refreshTokenFamilyId: tokenRecord.familyId
  });

  if (query && typeof query.select === "function") {
    return query.select("+tokenHash");
  }

  return query;
};

const resolveUser = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    return null;
  }

  return User.findById(userId).select("-password");
};

const detectRefreshAnomalies = ({ req, session }) => {
  const flags = [];
  const currentDeviceFingerprint = getDeviceFingerprint(req);
  const currentIpAddress = getClientIp(req);

  if (session.deviceFingerprint !== currentDeviceFingerprint) {
    flags.push("REFRESH_DEVICE_MISMATCH");
  }

  if (
    session.ipAddress &&
    session.ipAddress !== currentIpAddress &&
    !isPrivateIpAddress(session.ipAddress) &&
    !isPrivateIpAddress(currentIpAddress)
  ) {
    flags.push("REFRESH_IP_CHANGED");
  }

  return {
    flags,
    currentIpAddress,
    currentDeviceFingerprint
  };
};

const consumeRefreshToken = async (tokenRecord) => {
  const now = new Date();
  const result = await RefreshToken.updateOne(
    {
      _id: tokenRecord._id,
      isActive: true,
      $and: [
        {
          $or: [{ usedAt: { $exists: false } }, { usedAt: null }]
        },
        {
          $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }]
        }
      ]
    },
    {
      $set: {
        isActive: false,
        usedAt: now,
        revokedAt: now,
        revokedReason: "ROTATED"
      }
    }
  );

  const modifiedCount = result.modifiedCount ?? result.nModified ?? result.matchedCount ?? 0;
  return modifiedCount > 0;
};

const rotateRefreshToken = async ({ refreshToken, req, jwtSecret }) => {
  const parsedToken = parseRefreshToken(refreshToken);
  if (!parsedToken) {
    throw buildRefreshError("Refresh token is missing or malformed.");
  }

  const tokenRecord = await findRefreshTokenWithHash(parsedToken);
  await ensureRefreshTokenIsUsable({ req, tokenRecord, parsedToken });

  const session = await resolveSession(tokenRecord);
  if (!session || !session.isActive || session.revokedAt) {
    await handleRefreshReplay({
      req,
      tokenRecord,
      familyId: parsedToken.familyId,
      reason: "REFRESH_SESSION_INACTIVE"
    });
  }

  if (isSessionExpired(session)) {
    await revokeRefreshTokenFamily({
      familyId: parsedToken.familyId,
      reason: "REFRESH_TOKEN_EXPIRED"
    });
    throw buildSecurityError(SECURITY_ERROR_CODES.SESSION_EXPIRED, [
      {
        field: "refreshToken",
        message: "Refresh session has expired."
      }
    ]);
  }

  const user = await resolveUser(tokenRecord.userId);
  if (!user || user.role !== session.role) {
    await handleRefreshReplay({
      req,
      tokenRecord,
      familyId: parsedToken.familyId,
      reason: "REFRESH_USER_INVALID"
    });
  }

  const anomalies = detectRefreshAnomalies({ req, session });
  if (anomalies.flags.includes("REFRESH_DEVICE_MISMATCH")) {
    await handleRefreshReplay({
      req,
      tokenRecord,
      familyId: parsedToken.familyId,
      reason: "REFRESH_DEVICE_MISMATCH"
    });
  }

  if (anomalies.flags.length > 0) {
    await AuthSession.updateOne(
      { _id: session._id },
      {
        $addToSet: {
          anomalyFlags: { $each: anomalies.flags }
        },
        $set: {
          lastSeenAt: new Date()
        }
      }
    );
    await logAuditEvent({
      req,
      eventType: "SUSPICIOUS_AUTH",
      outcome: "SUCCESS",
      severity: "MEDIUM",
      actorUserId: user._id,
      sessionId: session._id,
      tokenId: tokenRecord.tokenId,
      metadata: {
        reason: "REFRESH_ANOMALY",
        flags: anomalies.flags,
        currentIpAddress: anomalies.currentIpAddress
      }
    });
  }

  const consumed = await consumeRefreshToken(tokenRecord);
  if (!consumed) {
    await handleRefreshReplay({
      req,
      tokenRecord,
      familyId: parsedToken.familyId,
      reason: "REFRESH_TOKEN_RACE_REUSE"
    });
  }

  const nextRefreshToken = await createRefreshTokenRecord({
    user,
    session,
    req,
    familyId: tokenRecord.familyId,
    parentTokenId: tokenRecord.tokenId,
    rotationCounter: (tokenRecord.rotationCounter || 0) + 1
  });

  await RefreshToken.updateOne(
    { _id: tokenRecord._id },
    {
      $set: {
        replacedByTokenId: nextRefreshToken.refreshTokenId
      }
    }
  );

  const accessToken = await updateSessionAccessToken({
    sessionId: session._id,
    user,
    jwtSecret
  });

  await logAuditEvent({
    req,
    eventType: "LOGIN_SUCCESS",
    outcome: "SUCCESS",
    severity: "LOW",
    actorUserId: user._id,
    actorEmail: user.email,
    sessionId: session._id,
    tokenId: accessToken.tokenId,
    metadata: {
      reason: "REFRESH_TOKEN_ROTATION",
      refreshTokenFamilyId: tokenRecord.familyId,
      previousRefreshTokenId: tokenRecord.tokenId,
      nextRefreshTokenId: nextRefreshToken.refreshTokenId
    }
  });

  return {
    accessToken: accessToken.token,
    accessTokenId: accessToken.tokenId,
    accessTokenExpiresAt: accessToken.expiresAt,
    refreshToken: nextRefreshToken.refreshToken,
    refreshTokenId: nextRefreshToken.refreshTokenId,
    refreshTokenExpiresAt: nextRefreshToken.expiresAt,
    session,
    user
  };
};

module.exports = {
  cleanupExpiredRefreshTokens,
  createInitialRefreshToken,
  generateRefreshTokenMaterial,
  getRefreshTokenExpirationDate,
  parseRefreshToken,
  revokeAllRefreshTokensForUser,
  revokeOtherRefreshTokensForUser,
  revokeRefreshTokenFamily,
  revokeRefreshTokenForSession,
  rotateRefreshToken
};
