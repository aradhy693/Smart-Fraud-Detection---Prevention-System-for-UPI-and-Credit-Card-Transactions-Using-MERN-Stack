const rateLimit = require("express-rate-limit");
const { logAuditEvent } = require("../services/auditLogService");
const { SECURITY_ERROR_CODES } = require("../security/authErrors");

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const windowMs = parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const authWindowMs = parsePositiveInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60 * 1000);

const buildLimiter = ({
  max,
  message,
  code = "TOO_MANY_REQUESTS",
  auditAuthFailures = false,
  windowMs: limiterWindowMs = windowMs
}) =>
  rateLimit({
    windowMs: limiterWindowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      if (auditAuthFailures) {
        void logAuditEvent({
          req,
          eventType: "LOGIN_BLOCKED",
          outcome: "BLOCKED",
          severity: "MEDIUM",
          actorEmail: req.body?.email,
          metadata: { reason: code, route: req.originalUrl }
        });
      }

      return res.status(429).json({
        success: false,
        message,
        error: {
          code,
          statusCode: 429,
          details: null
        }
      });
    }
  });

const apiLimiter = buildLimiter({
  max: parsePositiveInteger(process.env.API_RATE_LIMIT_MAX, 200),
  message: "Too many requests. Please try again later."
});

const authRateLimiter = buildLimiter({
  windowMs: authWindowMs,
  max: parsePositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, 10),
  message: "Too many authentication attempts. Please try again later.",
  code: SECURITY_ERROR_CODES.TOO_MANY_ATTEMPTS,
  auditAuthFailures: true
});

const transactionRateLimiter = buildLimiter({
  max: parsePositiveInteger(process.env.TRANSACTION_RATE_LIMIT_MAX, 30),
  message: "Too many transaction attempts. Please try again later."
});

module.exports = { apiLimiter, authRateLimiter, transactionRateLimiter };
