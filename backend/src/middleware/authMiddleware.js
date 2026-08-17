const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { getRequiredEnv } = require("../config/env");
const { logAuditEvent } = require("../services/auditLogService");
const { revokeAuthSession, validateAuthSession } = require("../services/sessionService");
const { buildSecurityError, SECURITY_ERROR_CODES } = require("../security/authErrors");
const { ACCESS_TOKEN_COOKIE_NAME } = require("../security/cookieConfig");
const { getCookieValue } = require("../security/cookieParser");
const { SECURITY_STAFF_ROLES, SOC_MANAGER_ROLES, SOC_WRITE_ROLES } = require("../security/roles");
const asyncHandler = require("./asyncHandler");
const logger = require("../utils/logger");

const getBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const requireJwtSecret = () => {
  return getRequiredEnv("JWT_SECRET");
};

const getAccessTokenFromRequest = (req) =>
  getBearerToken(req.headers.authorization) || getCookieValue(req, ACCESS_TOKEN_COOKIE_NAME);

const authenticateRequest = async (req, { auditFailures = true } = {}) => {
  const token = getAccessTokenFromRequest(req);
  if (process.env.NODE_ENV !== "production") {
    logger.info("Auth request received", {
      path: req.originalUrl,
      method: req.method,
      hasAuthorizationHeader: Boolean(getBearerToken(req.headers.authorization)),
      hasAccessCookie: Boolean(getCookieValue(req, ACCESS_TOKEN_COOKIE_NAME)),
      hasToken: Boolean(token)
    });
  }

  if (!token) {
    if (auditFailures) {
      await logAuditEvent({
        req,
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        severity: "MEDIUM",
        metadata: { reason: "TOKEN_MISSING" }
      });
    }
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "authorization", message: "Access token is required." }
    ]);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, requireJwtSecret(), { algorithms: ["HS256"] });
    if (process.env.NODE_ENV !== "production") {
      logger.info("Auth token decoded", {
        path: req.originalUrl,
        userId: decoded.id,
        sessionId: decoded.sid,
        tokenId: decoded.jti,
        role: decoded.role
      });
    }
  } catch (error) {
    if (auditFailures) {
      await logAuditEvent({
        req,
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        severity: error.name === "TokenExpiredError" ? "LOW" : "HIGH",
        metadata: { reason: error.name }
      });
    }

    if (error.name === "TokenExpiredError") {
      throw buildSecurityError(SECURITY_ERROR_CODES.SESSION_EXPIRED);
    }

    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN);
  }

  if (!decoded?.id || !mongoose.isValidObjectId(decoded.id)) {
    if (auditFailures) {
      await logAuditEvent({
        req,
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        severity: "HIGH",
        tokenId: decoded?.jti,
        metadata: { reason: "INVALID_TOKEN_SUBJECT" }
      });
    }
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "sub", message: "Token subject is invalid." }
    ]);
  }

  const { session, anomalyFlags } = await validateAuthSession({ decoded, token, req });
  const user = await User.findById(decoded.id).select("-password");

  if (!user) {
    await revokeAuthSession({
      sessionId: session._id,
      userId: decoded.id,
      tokenId: decoded.jti,
      reason: "USER_NOT_FOUND"
    });
    if (auditFailures) {
      await logAuditEvent({
        req,
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        severity: "HIGH",
        tokenId: decoded.jti,
        sessionId: session._id,
        metadata: { reason: "USER_NOT_FOUND" }
      });
    }
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "Token user no longer exists." }
    ]);
  }

  if (decoded.role !== user.role || session.role !== user.role) {
    await revokeAuthSession({
      sessionId: session._id,
      userId: decoded.id,
      tokenId: decoded.jti,
      reason: "ROLE_MISMATCH"
    });
    if (auditFailures) {
      await logAuditEvent({
        req,
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        severity: "HIGH",
        actorUserId: user._id,
        tokenId: decoded.jti,
        sessionId: session._id,
        metadata: {
          reason: "ROLE_MISMATCH",
          tokenRole: decoded.role,
          userRole: user.role,
          sessionRole: session.role
        }
      });
    }
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "role", message: "Token role is no longer valid." }
    ]);
  }

  return {
    decoded,
    session,
    token,
    user,
    anomalyFlags
  };
};

const attachAuthenticatedRequest = (req, authResult) => {
  req.user = authResult.user;
  req.authSession = authResult.session;
  req.authTokenId = authResult.decoded.jti;
  req.authAccessToken = authResult.token;
  req.authSessionAnomalyFlags = authResult.anomalyFlags;
};

const isMfaAllowedPath = (req) =>
  req.originalUrl === "/api/auth/logout" ||
  req.originalUrl.startsWith("/api/auth/mfa");

const protect = asyncHandler(async (req, res, next) => {
  const authResult = await authenticateRequest(req);
  attachAuthenticatedRequest(req, authResult);

  if (
    req.authSession?.mfaRequired &&
    !req.authSession?.mfaVerified &&
    !isMfaAllowedPath(req)
  ) {
    throw buildSecurityError(SECURITY_ERROR_CODES.MFA_REQUIRED, [
      {
        field: "mfa",
        message: "Complete MFA verification before accessing this resource."
      }
    ]);
  }

  return next();
});

const optionalProtect = asyncHandler(async (req, res, next) => {
  try {
    const authResult = await authenticateRequest(req, { auditFailures: false });
    attachAuthenticatedRequest(req, authResult);
  } catch (error) {
    req.authOptionalError = error;
  }

  return next();
});

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN));
  }

  if (!allowedRoles.includes(req.user.role)) {
    void logAuditEvent({
      req,
      eventType: "SUSPICIOUS_AUTH",
      outcome: "BLOCKED",
      severity: "MEDIUM",
      actorUserId: req.user._id,
      metadata: {
        reason: "INSUFFICIENT_PERMISSIONS",
        requiredRoles: allowedRoles,
        actualRole: req.user.role
      }
    });
    return next(
      buildSecurityError(SECURITY_ERROR_CODES.INSUFFICIENT_PERMISSIONS, [
        {
          field: "role",
          message: "The authenticated role is not allowed to access this resource.",
          requiredRoles: allowedRoles,
          actualRole: req.user.role
        }
      ])
    );
  }

  return next();
};

const adminOnly = authorizeRoles("admin");
const securityStaffOnly = authorizeRoles(...SECURITY_STAFF_ROLES);
const securityOperatorOnly = authorizeRoles("admin", "security-operator");
const socWriteOnly = authorizeRoles(...SOC_WRITE_ROLES);
const socManagerOnly = authorizeRoles(...SOC_MANAGER_ROLES);

module.exports = {
  adminOnly,
  authorizeRoles,
  getAccessTokenFromRequest,
  getBearerToken,
  optionalProtect,
  protect,
  socManagerOnly,
  socWriteOnly,
  securityOperatorOnly,
  securityStaffOnly
};
