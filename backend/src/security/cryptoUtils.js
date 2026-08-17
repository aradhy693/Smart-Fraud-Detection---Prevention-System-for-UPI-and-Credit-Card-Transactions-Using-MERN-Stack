const crypto = require("crypto");
const { getKeyForVersion } = require("./keyManager");

const base64UrlEncode = (buffer) => Buffer.from(buffer).toString("base64url");

const base64UrlDecode = (value) => Buffer.from(String(value || ""), "base64url");

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const normalizeForBlindIndex = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();

const blindIndex = (value, context = "default") => {
  const normalized = normalizeForBlindIndex(value);
  if (!normalized) return "";

  const { key } = getKeyForVersion("blind-index", `blind-index:${context}`);
  return crypto.createHmac("sha256", key).update(normalized).digest("hex");
};

const timingSafeEqualString = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

module.exports = {
  base64UrlDecode,
  base64UrlEncode,
  blindIndex,
  normalizeForBlindIndex,
  sha256,
  timingSafeEqualString
};
