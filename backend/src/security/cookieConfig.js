const { parseDurationMs } = require("../services/sessionService");

const ACCESS_TOKEN_COOKIE_NAME = process.env.ACCESS_TOKEN_COOKIE_NAME || "sfd_access_token";
const REFRESH_TOKEN_COOKIE_NAME = process.env.REFRESH_TOKEN_COOKIE_NAME || "sfd_refresh_token";

const isProduction = () => process.env.NODE_ENV === "production";

const shouldUseSecureCookies = () => {
  if (isProduction()) {
    return true;
  }

  if (String(process.env.COOKIE_SECURE || "").toLowerCase() === "true") {
    return true;
  }

  if (String(process.env.COOKIE_SECURE || "").toLowerCase() === "false") {
    return false;
  }

  return isProduction();
};

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: "strict"
});

const getAccessTokenMaxAgeMs = () =>
  parseDurationMs(process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "15m", 15 * 60 * 1000);

const getRefreshTokenMaxAgeMs = () =>
  parseDurationMs(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d", 7 * 24 * 60 * 60 * 1000);

const getAccessTokenCookieOptions = () => ({
  ...baseCookieOptions(),
  path: "/",
  maxAge: getAccessTokenMaxAgeMs()
});

const getRefreshTokenCookieOptions = () => ({
  ...baseCookieOptions(),
  path: "/api/auth",
  maxAge: getRefreshTokenMaxAgeMs()
});

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  if (accessToken) {
    res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, getAccessTokenCookieOptions());
  }

  if (refreshToken) {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshTokenCookieOptions());
  }
};

const clearAuthCookies = (res) => {
  const accessOptions = {
    ...baseCookieOptions(),
    path: "/",
    maxAge: 0
  };
  const refreshOptions = {
    ...baseCookieOptions(),
    path: "/api/auth",
    maxAge: 0
  };

  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, accessOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, refreshOptions);
};

module.exports = {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  clearAuthCookies,
  getAccessTokenCookieOptions,
  getAccessTokenMaxAgeMs,
  getRefreshTokenCookieOptions,
  getRefreshTokenMaxAgeMs,
  setAuthCookies,
  shouldUseSecureCookies
};
