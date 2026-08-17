const { getClientIp } = require("../utils/network");
const { getDeviceFingerprint, getUserAgent } = require("../services/sessionService");
const { logAuditEvent } = require("../services/auditLogService");
const { buildSecurityError, SECURITY_ERROR_CODES } = require("../security/authErrors");

const parseAllowedOrigins = () => {
  const configuredOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "";
  return configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return allowedOrigins.length === 0 && process.env.NODE_ENV !== "production";
};

const isRefererAllowed = (referer, allowedOrigins) => {
  if (!referer || typeof referer !== "string") {
    return true;
  }

  try {
    const refererOrigin = new URL(referer).origin;
    return isOriginAllowed(refererOrigin, allowedOrigins);
  } catch {
    return false;
  }
};

const requireTrustedOrigin = (req, res, next) => {
  const allowedOrigins = parseAllowedOrigins();
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (!isOriginAllowed(origin, allowedOrigins)) {
    void logAuditEvent({
      req,
      eventType: "SUSPICIOUS_AUTH",
      outcome: "BLOCKED",
      severity: "HIGH",
      metadata: {
        reason: "UNTRUSTED_ORIGIN",
        origin: origin || null,
        referer: referer || null
      }
    });
    return next(
      buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
        {
          field: "origin",
          message: "Request origin is not allowed for cookie-authenticated auth actions."
        }
      ], {
        statusCode: 403,
        message: "Request origin is not allowed"
      })
    );
  }

  if (!origin && !isRefererAllowed(referer, allowedOrigins)) {
    void logAuditEvent({
      req,
      eventType: "SUSPICIOUS_AUTH",
      outcome: "BLOCKED",
      severity: "HIGH",
      metadata: {
        reason: "UNTRUSTED_REFERER",
        referer: referer || null
      }
    });
    return next(
      buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
        {
          field: "referer",
          message: "Request referer is not allowed for cookie-authenticated auth actions."
        }
      ], {
        statusCode: 403,
        message: "Request referer is not allowed"
      })
    );
  }

  return next();
};

const authSecurityContext = (req, _res, next) => {
  req.security = {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    deviceFingerprint: getDeviceFingerprint(req),
    loginSignals: [],
    tokenSignals: []
  };

  return next();
};

const suspiciousLoginDetection = (req, _res, next) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const signals = [];

  if (email && email.length > 254) {
    signals.push("OVERSIZED_EMAIL");
  }

  if (req.headers["x-forwarded-for"] && String(req.headers["x-forwarded-for"]).split(",").length > 3) {
    signals.push("MULTIPLE_FORWARDED_IPS");
  }

  req.security = req.security || {};
  req.security.loginSignals = [...(req.security.loginSignals || []), ...signals];

  if (signals.length > 0) {
    void logAuditEvent({
      req,
      eventType: "SUSPICIOUS_AUTH",
      outcome: "FAILURE",
      severity: "MEDIUM",
      actorEmail: email,
      metadata: { signals }
    });
  }

  return next();
};

const unusualIpDetection = (req, _res, next) => {
  if (req.loginRisk?.flags?.includes("UNUSUAL_IP")) {
    req.security = req.security || {};
    req.security.loginSignals = [...(req.security.loginSignals || []), "UNUSUAL_IP"];
  }

  return next();
};

const impossibleLoginBehaviorDetection = (req, _res, next) => {
  if (req.loginRisk?.flags?.includes("IMPOSSIBLE_LOGIN_BEHAVIOR")) {
    req.security = req.security || {};
    req.security.loginSignals = [
      ...(req.security.loginSignals || []),
      "IMPOSSIBLE_LOGIN_BEHAVIOR"
    ];
  }

  return next();
};

const tokenAnomalyDetection = (req, _res, next) => {
  const anomalyFlags = req.authSessionAnomalyFlags || [];
  req.security = req.security || {};
  req.security.tokenSignals = [...(req.security.tokenSignals || []), ...anomalyFlags];

  if (anomalyFlags.length > 0) {
    void logAuditEvent({
      req,
      eventType: "SUSPICIOUS_AUTH",
      outcome: "FAILURE",
      severity: "HIGH",
      actorUserId: req.user?._id,
      metadata: { tokenAnomalyFlags: anomalyFlags }
    });
  }

  return next();
};

module.exports = {
  authSecurityContext,
  impossibleLoginBehaviorDetection,
  requireTrustedOrigin,
  suspiciousLoginDetection,
  tokenAnomalyDetection,
  unusualIpDetection
};
