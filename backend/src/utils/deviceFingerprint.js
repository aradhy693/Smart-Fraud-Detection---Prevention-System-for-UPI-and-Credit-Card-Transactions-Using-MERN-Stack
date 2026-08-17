const crypto = require("crypto");
const { getClientIp } = require("./network");

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const getUserAgentFromRequest = (req) => {
  const userAgent = req?.headers?.["user-agent"];
  return typeof userAgent === "string" && userAgent.trim() ? userAgent.trim().slice(0, 512) : "unknown";
};

const getDeviceFingerprint = (req) => {
  const provided =
    req?.headers?.["x-device-fingerprint"] || req?.headers?.["x-device-id"] || "";
  const normalized = typeof provided === "string" ? provided.trim() : "";

  if (normalized && /^[a-f0-9]{64}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (normalized) {
    return sha256(normalized);
  }

  return sha256(`${getUserAgentFromRequest(req)}|${getClientIp(req)}`);
};

module.exports = {
  getDeviceFingerprint,
  getUserAgentFromRequest,
  sha256
};
