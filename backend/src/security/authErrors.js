const AppError = require("../utils/AppError");

const SECURITY_ERROR_CODES = Object.freeze({
  INVALID_TOKEN: "INVALID_TOKEN",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
  MFA_REQUIRED: "MFA_REQUIRED"
});

const SECURITY_ERROR_DEFINITIONS = Object.freeze({
  [SECURITY_ERROR_CODES.INVALID_TOKEN]: {
    statusCode: 401,
    message: "Invalid authentication token"
  },
  [SECURITY_ERROR_CODES.ACCOUNT_LOCKED]: {
    statusCode: 423,
    message: "Account is temporarily locked"
  },
  [SECURITY_ERROR_CODES.TOO_MANY_ATTEMPTS]: {
    statusCode: 429,
    message: "Too many authentication attempts. Please try again later."
  },
  [SECURITY_ERROR_CODES.SESSION_EXPIRED]: {
    statusCode: 401,
    message: "Session expired. Sign in again."
  },
  [SECURITY_ERROR_CODES.INSUFFICIENT_PERMISSIONS]: {
    statusCode: 403,
    message: "Insufficient permissions"
  },
  [SECURITY_ERROR_CODES.MFA_REQUIRED]: {
    statusCode: 403,
    message: "MFA verification required"
  }
});

const buildSecurityError = (code, details = null, overrides = {}) => {
  const definition = SECURITY_ERROR_DEFINITIONS[code] || {
    statusCode: 500,
    message: "Security error"
  };

  return new AppError(
    overrides.message || definition.message,
    overrides.statusCode || definition.statusCode,
    code,
    details
  );
};

module.exports = {
  SECURITY_ERROR_CODES,
  SECURITY_ERROR_DEFINITIONS,
  buildSecurityError
};
