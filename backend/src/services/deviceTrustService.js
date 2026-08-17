const crypto = require("crypto");
const Device = require("../models/Device");
const { blindIndex } = require("../security/cryptoUtils");
const { getClientIp } = require("../utils/network");
const { getDeviceFingerprint, getUserAgentFromRequest } = require("../utils/deviceFingerprint");
const { createSecurityEvent } = require("./securityEventService");

const parseDeviceMetadata = (req) => {
  const encoded = req?.headers?.["x-device-metadata"];
  if (!encoded || typeof encoded !== "string") {
    return {};
  }

  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const getRequestFingerprint = (req) => getDeviceFingerprint(req);

const buildDevicePayload = ({ req, userId, trusted = false, riskScore = 0, riskLevel = "LOW" }) => {
  const metadata = parseDeviceMetadata(req);
  const fingerprint = getRequestFingerprint(req);
  return {
    userId,
    deviceId: crypto.randomUUID(),
    fingerprint,
    fingerprintHash: blindIndex(fingerprint, "device-fingerprint"),
    browser: metadata.browser || "Unknown",
    os: metadata.os || "Unknown",
    timezone: metadata.timezone || "Unknown",
    screenResolution: metadata.screenResolution || "Unknown",
    language: metadata.language || "Unknown",
    userAgent: metadata.userAgent || getUserAgentFromRequest(req),
    ipAddress: getClientIp(req),
    geolocation: metadata.geolocation || {},
    trusted,
    trustedAt: trusted ? new Date() : undefined,
    riskScore,
    riskLevel,
    lastUsed: new Date()
  };
};

const registerOrUpdateDevice = async ({ req, user, riskScore = 0, riskLevel = "LOW" }) => {
  const fingerprint = getRequestFingerprint(req);
  const fingerprintHash = blindIndex(fingerprint, "device-fingerprint");
  let device = await Device.findOne({
    userId: user._id,
    $or: [{ fingerprintHash }, { fingerprint }]
  });
  const now = new Date();
  const isNewDevice = !device;

  if (!device) {
    device = await Device.create(
      buildDevicePayload({
        req,
        userId: user._id,
        trusted: false,
        riskScore,
        riskLevel
      })
    );
    await createSecurityEvent({
      req,
      eventType: "NEW_DEVICE_LOGIN",
      severity: "MEDIUM",
      userId: user._id,
      deviceId: device.deviceId,
      riskScore,
      riskLevel,
      metadata: {
        browser: device.browser,
        os: device.os
      }
    });
  } else {
    device = await Device.findOneAndUpdate(
      { _id: device._id },
      {
        $set: {
          fingerprintHash,
          ipAddress: getClientIp(req),
          userAgent: getUserAgentFromRequest(req),
          lastUsed: now,
          riskScore,
          riskLevel
        }
      },
      { new: true }
    );
  }

  return {
    device,
    isNewDevice,
    trusted: Boolean(device?.trusted && !device.revokedAt)
  };
};

const trustDevice = async ({ req, userId, deviceId }) => {
  const device = await Device.findOneAndUpdate(
    {
      userId,
      deviceId,
      $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }]
    },
    {
      $set: {
        trusted: true,
        trustedAt: new Date(),
        lastUsed: new Date()
      }
    },
    { new: true }
  );

  if (device) {
    await createSecurityEvent({
      req,
      eventType: "TRUSTED_DEVICE_CHANGED",
      severity: "LOW",
      userId,
      deviceId: device.deviceId,
      metadata: { action: "TRUST_DEVICE" }
    });
  }

  return device;
};

const revokeTrustedDevice = async ({ req, userId, deviceId }) => {
  const device = await Device.findOneAndUpdate(
    { userId, deviceId },
    {
      $set: {
        trusted: false,
        revokedAt: new Date()
      }
    },
    { new: true }
  );

  if (device) {
    await createSecurityEvent({
      req,
      eventType: "TRUSTED_DEVICE_CHANGED",
      severity: "MEDIUM",
      userId,
      deviceId: device.deviceId,
      metadata: { action: "REVOKE_DEVICE" }
    });
  }

  return device;
};

const listTrustedDevices = async (userId) =>
  Device.find({ userId }).sort({ lastUsed: -1 }).limit(50);

module.exports = {
  getRequestFingerprint,
  listTrustedDevices,
  parseDeviceMetadata,
  registerOrUpdateDevice,
  revokeTrustedDevice,
  trustDevice
};
