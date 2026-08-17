const crypto = require("crypto");
const { getRequiredEnv } = require("../config/env");
const { shouldUseSecureCookies } = require("./cookieConfig");

const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "sfd_csrf_token";
const CSRF_HEADER_NAMES = Object.freeze(["x-csrf-token", "x-xsrf-token"]);
const CSRF_TOKEN_BYTES = 32;

const signNonce = (nonce) =>
  crypto
    .createHmac("sha256", getRequiredEnv("CSRF_SECRET"))
    .update(nonce)
    .digest("base64url");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const createCsrfToken = () => {
  const nonce = crypto.randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
  return `${nonce}.${signNonce(nonce)}`;
};

const isValidCsrfToken = (token) => {
  if (!token || typeof token !== "string") {
    return false;
  }

  const [nonce, signature, extra] = token.split(".");
  if (!nonce || !signature || extra) {
    return false;
  }

  return safeEqual(signature, signNonce(nonce));
};

const getCsrfCookieOptions = () => ({
  httpOnly: false,
  secure: shouldUseSecureCookies(),
  sameSite: "strict",
  path: "/"
});

const setCsrfCookie = (res, token = createCsrfToken()) => {
  res.cookie(CSRF_COOKIE_NAME, token, getCsrfCookieOptions());
  return token;
};

const clearCsrfCookie = (res) => {
  res.clearCookie(CSRF_COOKIE_NAME, {
    ...getCsrfCookieOptions(),
    maxAge: 0
  });
};

module.exports = {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAMES,
  clearCsrfCookie,
  createCsrfToken,
  getCsrfCookieOptions,
  isValidCsrfToken,
  setCsrfCookie
};
