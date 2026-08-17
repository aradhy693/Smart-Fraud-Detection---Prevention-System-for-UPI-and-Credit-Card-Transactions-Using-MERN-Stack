const crypto = require("crypto");
const AppError = require("../utils/AppError");

const DEFAULT_VERSION = "v1";
const MIN_KEY_LENGTH = 32;

const parseDurationMs = (value) => {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;

  const input = String(value).trim();
  if (!input) return 0;
  if (/^\d+$/.test(input)) return Number(input);

  const match = input.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
};

const normalizeVersion = (version) =>
  String(version || DEFAULT_VERSION)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 64) || DEFAULT_VERSION;

const decodeConfiguredKey = (value, source) => {
  const raw = String(value || "").trim();
  if (raw.length < MIN_KEY_LENGTH) {
    throw new AppError(
      `${source} must contain at least ${MIN_KEY_LENGTH} characters of secret material`,
      500,
      "ENCRYPTION_KEY_TOO_SHORT"
    );
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.length >= MIN_KEY_LENGTH) {
      return decoded;
    }
  } catch {
    // Fall through to hashing the supplied secret material.
  }

  return Buffer.from(raw, "utf8");
};

const deriveKey = ({ secret, version, purpose = "field-encryption" }) =>
  crypto.hkdfSync(
    "sha256",
    Buffer.from(secret),
    Buffer.from("smart-fraud-detection"),
    Buffer.from(`${purpose}:${normalizeVersion(version)}`),
    32
  );

const parseVersionedKeys = () => {
  const configured = process.env.MASTER_ENCRYPTION_KEYS;
  if (!configured) return {};

  try {
    const parsed = JSON.parse(configured);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed).reduce((keys, [version, key]) => {
        if (key) {
          keys[normalizeVersion(version)] = decodeConfiguredKey(key, `MASTER_ENCRYPTION_KEYS.${version}`);
        }
        return keys;
      }, {});
    }
  } catch {
    return String(configured)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .reduce((keys, entry) => {
        const separatorIndex = entry.indexOf(":");
        if (separatorIndex <= 0) return keys;
        const version = normalizeVersion(entry.slice(0, separatorIndex));
        const key = entry.slice(separatorIndex + 1);
        keys[version] = decodeConfiguredKey(key, `MASTER_ENCRYPTION_KEYS.${version}`);
        return keys;
      }, {});
  }

  return {};
};

const getMasterSecret = () => {
  if (process.env.MASTER_ENCRYPTION_KEY) {
    return decodeConfiguredKey(process.env.MASTER_ENCRYPTION_KEY, "MASTER_ENCRYPTION_KEY");
  }

  throw new AppError(
    "MASTER_ENCRYPTION_KEY is required for field-level encryption. Set MASTER_ENCRYPTION_KEY in your environment.",
    500,
    "MASTER_ENCRYPTION_KEY_MISSING"
  );
};

const getRotationIntervalMs = () => parseDurationMs(process.env.KEY_ROTATION_INTERVAL);

const getBaseVersion = () => normalizeVersion(process.env.KEY_VERSION || DEFAULT_VERSION);

const getActiveKeyVersion = (now = Date.now()) => {
  const baseVersion = getBaseVersion();
  const rotationIntervalMs = getRotationIntervalMs();

  if (rotationIntervalMs > 0) {
    return `${baseVersion}.${Math.floor(now / rotationIntervalMs)}`;
  }

  return baseVersion;
};

const getKeyForVersion = (version, purpose = "field-encryption") => {
  const resolvedVersion = normalizeVersion(version || getActiveKeyVersion());
  const versionedKeys = parseVersionedKeys();

  if (versionedKeys[resolvedVersion]) {
    return {
      version: resolvedVersion,
      key: deriveKey({ secret: versionedKeys[resolvedVersion], version: resolvedVersion, purpose })
    };
  }

  return {
    version: resolvedVersion,
    key: deriveKey({ secret: getMasterSecret(), version: resolvedVersion, purpose })
  };
};

const getActiveKey = (purpose = "field-encryption") =>
  getKeyForVersion(getActiveKeyVersion(), purpose);

const isCurrentVersion = (version) => normalizeVersion(version) === getActiveKeyVersion();

module.exports = {
  deriveKey,
  getActiveKey,
  getActiveKeyVersion,
  getBaseVersion,
  getKeyForVersion,
  getRotationIntervalMs,
  isCurrentVersion,
  normalizeVersion,
  parseDurationMs
};
