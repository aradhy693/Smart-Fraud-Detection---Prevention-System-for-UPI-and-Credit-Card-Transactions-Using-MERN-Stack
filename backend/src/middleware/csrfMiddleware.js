const AppError = require("../utils/AppError");
const { getBearerToken } = require("./authMiddleware");
const {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME
} = require("../security/cookieConfig");
const { getCookieValue } = require("../security/cookieParser");
const {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAMES,
  isValidCsrfToken,
  setCsrfCookie
} = require("../security/csrf");

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/password-strength",
  "/api/auth/register"
]);

const getCsrfHeader = (req) => {
  for (const headerName of CSRF_HEADER_NAMES) {
    const value = req.headers[headerName];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const hasCookieAuth = (req) =>
  Boolean(
    getCookieValue(req, ACCESS_TOKEN_COOKIE_NAME) ||
      getCookieValue(req, REFRESH_TOKEN_COOKIE_NAME)
  );

const shouldProtectWithCsrf = (req) =>
  STATE_CHANGING_METHODS.has(req.method) &&
  req.path.startsWith("/api") &&
  !EXEMPT_PATHS.has(req.path) &&
  hasCookieAuth(req) &&
  !getBearerToken(req.headers.authorization);

const buildCsrfError = (code, message, details) =>
  new AppError(message, 403, code, details);

const ensureCsrfTokenCookie = (req, res, next) => {
  const existingToken = getCookieValue(req, CSRF_COOKIE_NAME);
  if (!isValidCsrfToken(existingToken)) {
    setCsrfCookie(res);
  }

  return next();
};

const csrfProtection = (req, _res, next) => {
  if (!shouldProtectWithCsrf(req)) {
    return next();
  }

  const cookieToken = getCookieValue(req, CSRF_COOKIE_NAME);
  const headerToken = getCsrfHeader(req);

  if (!cookieToken || !headerToken) {
    return next(
      buildCsrfError("CSRF_TOKEN_MISSING", "CSRF token is required", [
        {
          field: !cookieToken ? "cookie" : "x-csrf-token",
          message:
            "Cookie-authenticated state-changing requests must include a matching CSRF token."
        }
      ])
    );
  }

  if (cookieToken !== headerToken || !isValidCsrfToken(cookieToken)) {
    return next(
      buildCsrfError("CSRF_TOKEN_INVALID", "CSRF token is invalid", [
        {
          field: "x-csrf-token",
          message: "The CSRF header must match the signed CSRF cookie."
        }
      ])
    );
  }

  return next();
};

module.exports = {
  csrfProtection,
  ensureCsrfTokenCookie,
  shouldProtectWithCsrf
};
