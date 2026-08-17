const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const qrcode = require("qrcode");
const speakeasy = require("speakeasy");
const User = require("../models/User");
const {
  decryptString,
  encryptString,
  isEncrypted
} = require("../security/encryptionService");

const MFA_ISSUER = process.env.MFA_ISSUER || "Smart Fraud Detection";
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 6;
const DEFAULT_TOTP_WINDOW = 2;

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const getTotpWindow = () =>
  parsePositiveInteger(process.env.MFA_TOTP_WINDOW, DEFAULT_TOTP_WINDOW);

const getLegacyEncryptionKey = () => {
  const keySource = process.env.MFA_SECRET_ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY;
  if (!keySource) {
    throw new Error(
      "MFA_SECRET_ENCRYPTION_KEY (or MASTER_ENCRYPTION_KEY) is required for legacy MFA secret decryption"
    );
  }
  return crypto
    .createHash("sha256")
    .update(keySource)
    .digest();
};

const encryptSecret = (plainText) => encryptString(plainText, { aad: "mfa-secret" });

const decryptLegacySecret = (encryptedSecret) => {
  const [ivValue, tagValue, encryptedValue] = String(encryptedSecret || "").split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    return null;
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getLegacyEncryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
};

const decryptSecret = (encryptedSecret) => {
  if (!encryptedSecret) {
    return null;
  }

  try {
    if (isEncrypted(encryptedSecret)) {
      return decryptString(encryptedSecret, { aad: "mfa-secret" });
    }

    if (!String(encryptedSecret).includes(".")) {
      return String(encryptedSecret);
    }

    return decryptLegacySecret(encryptedSecret);
  } catch {
    return null;
  }
};

const generateMfaEnrollment = async (user) => {
  const secret = speakeasy.generateSecret({
    name: `${MFA_ISSUER}:${user.email}`,
    issuer: MFA_ISSUER,
    length: 20
  });
  const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240
  });

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        mfaPendingSecretEncrypted: encryptSecret(secret.base32)
      }
    }
  );

  return {
    otpauthUrl: secret.otpauth_url,
    qrCodeDataUrl,
    manualEntryKey: secret.base32
  };
};

const verifyTotp = ({ encryptedSecret, token }) => {
  const secret = decryptSecret(encryptedSecret);
  if (!secret || !/^\d{6}$/.test(String(token || ""))) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token: String(token),
    window: getTotpWindow()
  });
};

const normalizeRecoveryCode = (code) => {
  const compact = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");

  if (!/^[A-F0-9]{12}$/.test(compact)) {
    return null;
  }

  return compact.replace(/(.{4})/g, "$1-").slice(0, -1);
};

const generateRecoveryCode = () =>
  crypto.randomBytes(RECOVERY_CODE_BYTES).toString("hex").toUpperCase().replace(/(.{4})/g, "$1-").slice(0, -1);

const hashRecoveryCode = async (code) => bcrypt.hash(code, 12);

const generateRecoveryCodes = async () => {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const hashed = await Promise.all(
    codes.map(async (code) => ({
      codeHash: await hashRecoveryCode(code),
      createdAt: new Date()
    }))
  );

  return {
    codes,
    hashed
  };
};

const consumeRecoveryCode = async ({ user, code }) => {
  const normalizedCode = normalizeRecoveryCode(code);
  if (!normalizedCode) {
    return false;
  }

  const recoveryCodes = user.recoveryCodes || [];

  for (let index = 0; index < recoveryCodes.length; index += 1) {
    const recoveryCode = recoveryCodes[index];
    if (recoveryCode.usedAt) {
      continue;
    }

    if (await bcrypt.compare(normalizedCode, recoveryCode.codeHash)) {
      const usedAtPath = `recoveryCodes.${index}.usedAt`;
      const result = await User.updateOne(
        {
          _id: user._id,
          [usedAtPath]: null
        },
        {
          $set: {
            [usedAtPath]: new Date(),
            lastSuccessfulMfa: new Date(),
            mfaFailedAttempts: 0,
            mfaLockedUntil: null
          }
        }
      );
      return result.modifiedCount === 1;
    }
  }

  return false;
};

module.exports = {
  consumeRecoveryCode,
  decryptSecret,
  encryptSecret,
  generateMfaEnrollment,
  generateRecoveryCodes,
  getTotpWindow,
  normalizeRecoveryCode,
  verifyTotp
};
