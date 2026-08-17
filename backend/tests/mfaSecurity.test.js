const speakeasy = require("speakeasy");

jest.mock("../src/models/User", () => ({
  updateOne: jest.fn()
}));

jest.mock("../src/models/AuthSession", () => ({
  findOne: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock("../src/models/Device", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock("../src/models/SecurityEvent", () => ({
  create: jest.fn()
}));

jest.mock("../src/models/AuditLog", () => ({
  create: jest.fn()
}));

const User = require("../src/models/User");
const AuthSession = require("../src/models/AuthSession");
const Device = require("../src/models/Device");
const SecurityEvent = require("../src/models/SecurityEvent");
const {
  consumeRecoveryCode,
  generateMfaEnrollment,
  generateRecoveryCodes,
  verifyTotp
} = require("../src/services/mfaService");
const { registerOrUpdateDevice } = require("../src/services/deviceTrustService");
const { scoreRisk } = require("../src/services/authRiskService");
const { sha256, validateAuthSession } = require("../src/services/sessionService");

const USER_ID = "507f1f77bcf86cd799439011";
const SESSION_ID = "507f1f77bcf86cd799439088";
const fingerprint = "a".repeat(64);

jest.setTimeout(20000);

const buildReq = (headers = {}) => ({
  headers: {
    "user-agent": "Mozilla/5.0 Test Browser",
    "x-device-fingerprint": fingerprint,
    ...headers
  },
  ip: "127.0.0.1",
  socket: { remoteAddress: "127.0.0.1" }
});

describe("MFA and device security services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.updateOne.mockReset();
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    AuthSession.updateOne.mockResolvedValue({ modifiedCount: 1 });
    SecurityEvent.create.mockResolvedValue({ _id: "security-event-1" });
  });

  test("generates QR enrollment and validates RFC6238 TOTP", async () => {
    let encryptedSecret;
    User.updateOne.mockImplementation(async (_filter, update) => {
      encryptedSecret = update.$set.mfaPendingSecretEncrypted;
      return { modifiedCount: 1 };
    });

    const enrollment = await generateMfaEnrollment({
      _id: USER_ID,
      email: "analyst@example.com"
    });
    const token = speakeasy.totp({
      secret: enrollment.manualEntryKey,
      encoding: "base32"
    });

    expect(enrollment.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(enrollment.otpauthUrl).toContain("otpauth://totp/");
    expect(verifyTotp({ encryptedSecret, token })).toBe(true);
    expect(verifyTotp({ encryptedSecret, token: "000000" })).toBe(false);
  });

  test("generates hashed one-time recovery codes and consumes only unused codes", async () => {
    const recovery = await generateRecoveryCodes();
    const user = {
      _id: USER_ID,
      recoveryCodes: recovery.hashed
    };

    await expect(consumeRecoveryCode({ user, code: recovery.codes[0] })).resolves.toBe(true);
    expect(User.updateOne).toHaveBeenCalledWith(
      {
        _id: USER_ID,
        "recoveryCodes.0.usedAt": null
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          "recoveryCodes.0.usedAt": expect.any(Date),
          lastSuccessfulMfa: expect.any(Date)
        })
      })
    );

    user.recoveryCodes[0].usedAt = new Date();
    User.updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(consumeRecoveryCode({ user, code: recovery.codes[0] })).resolves.toBe(false);
  });

  test("allows only one concurrent recovery-code redemption", async () => {
    const recovery = await generateRecoveryCodes();
    const user = {
      _id: USER_ID,
      recoveryCodes: recovery.hashed
    };

    User.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });

    const [first, second] = await Promise.all([
      consumeRecoveryCode({ user, code: recovery.codes[0] }),
      consumeRecoveryCode({ user, code: recovery.codes[0] })
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  test("accepts recovery codes without dash separators", async () => {
    const recovery = await generateRecoveryCodes();
    const user = {
      _id: USER_ID,
      recoveryCodes: recovery.hashed
    };
    const compactCode = recovery.codes[0].replace(/-/g, "");

    await expect(consumeRecoveryCode({ user, code: compactCode })).resolves.toBe(true);
  });

  test("uses the same fingerprint for custom device identifiers across services", async () => {
    const { getRequestFingerprint } = require("../src/services/deviceTrustService");
    const { getDeviceFingerprint } = require("../src/services/sessionService");
    const req = buildReq({ "x-device-fingerprint": "trusted-browser-1" });

    expect(getRequestFingerprint(req)).toBe(getDeviceFingerprint(req));
  });

  test("registers new devices and creates security events", async () => {
    Device.findOne.mockResolvedValue(null);
    Device.create.mockResolvedValue({
      _id: "device-doc-1",
      deviceId: "device-1",
      fingerprint,
      trusted: false,
      browser: "Chrome",
      os: "Windows"
    });

    const result = await registerOrUpdateDevice({
      req: buildReq(),
      user: { _id: USER_ID },
      riskScore: 45,
      riskLevel: "MEDIUM"
    });

    expect(result.isNewDevice).toBe(true);
    expect(result.trusted).toBe(false);
    expect(Device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        fingerprint,
        trusted: false,
        riskLevel: "MEDIUM"
      })
    );
    expect(SecurityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "NEW_DEVICE_LOGIN",
        severity: "MEDIUM"
      })
    );
  });

  test("scores medium risk for new devices and high risk for takeover indicators", () => {
    const medium = scoreRisk({
      user: { mfaEnabled: false, failedLoginAttempts: 0 },
      loginRisk: { flags: [] },
      deviceContext: { isNewDevice: true, trusted: false },
      req: buildReq()
    });
    expect(medium.riskLevel).toBe("MEDIUM");
    expect(medium.requireMfa).toBe(true);

    const high = scoreRisk({
      user: { mfaEnabled: true, failedLoginAttempts: 4, lastLoginIp: "198.51.100.10" },
      loginRisk: { flags: ["IMPOSSIBLE_LOGIN_BEHAVIOR", "UNUSUAL_IP"], ipAddress: "203.0.113.10" },
      deviceContext: { isNewDevice: true, trusted: false },
      req: buildReq({ "x-network-risk": "malicious" })
    });
    expect(high.riskLevel).toBe("HIGH");
    expect(high.blockSession).toBe(true);
    expect(high.signals).toEqual(expect.arrayContaining(["IMPOSSIBLE_TRAVEL", "IP_REPUTATION_MALICIOUS"]));
  });

  test("rejects cloned sessions when the device fingerprint changes", async () => {
    const token = "access-token";
    AuthSession.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: SESSION_ID,
        userId: USER_ID,
        tokenId: "jti-1",
        tokenHash: sha256(token),
        role: "admin",
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 1000),
        deviceBound: true,
        deviceFingerprint: "b".repeat(64),
        deviceId: "device-1"
      })
    });

    await expect(
      validateAuthSession({
        decoded: { id: USER_ID, jti: "jti-1", sid: SESSION_ID },
        token,
        req: buildReq()
      })
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });

    expect(AuthSession.updateOne).toHaveBeenCalledWith(
      { _id: SESSION_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "DEVICE_CLONE_ATTEMPT"
        })
      })
    );
    expect(SecurityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "DEVICE_CLONE_ATTEMPT",
        severity: "CRITICAL"
      })
    );
  });
});
