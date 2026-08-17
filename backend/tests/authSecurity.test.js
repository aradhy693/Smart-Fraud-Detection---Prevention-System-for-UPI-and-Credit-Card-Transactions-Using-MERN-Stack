const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/models/User", () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock("../src/models/AuthSession", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock("../src/models/RefreshToken", () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock("../src/models/AuditLog", () => ({
  create: jest.fn()
}));

jest.mock("../src/models/LoginThrottle", () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock("../src/models/Device", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock("../src/models/SecurityEvent", () => ({
  create: jest.fn(),
  find: jest.fn()
}));

jest.mock("../src/models/Transaction", () => ({
  countDocuments: jest.fn(),
  find: jest.fn()
}));

jest.mock("../src/models/FraudAlert", () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

const app = require("../src/app");
const User = require("../src/models/User");
const AuthSession = require("../src/models/AuthSession");
const RefreshToken = require("../src/models/RefreshToken");
const AuditLog = require("../src/models/AuditLog");
const LoginThrottle = require("../src/models/LoginThrottle");
const Device = require("../src/models/Device");
const SecurityEvent = require("../src/models/SecurityEvent");
const Transaction = require("../src/models/Transaction");
const FraudAlert = require("../src/models/FraudAlert");
const { generateRefreshTokenMaterial } = require("../src/services/refreshTokenService");
const { sha256 } = require("../src/services/sessionService");
const { createCsrfToken, CSRF_COOKIE_NAME } = require("../src/security/csrf");

const USER_ID = "507f1f77bcf86cd799439011";
const SESSION_ID = "507f1f77bcf86cd799439088";
const ALERT_ID = "507f1f77bcf86cd799439099";

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const buildUser = (role = "user", overrides = {}) => ({
  _id: USER_ID,
  name: "Security User",
  email: "security@example.com",
  role,
  failedLoginAttempts: 0,
  accountLockoutCount: 0,
  knownLoginIps: [],
  comparePassword: jest.fn().mockResolvedValue(true),
  toJSON() {
    return {
      _id: this._id,
      name: this.name,
      email: this.email,
      role: this.role
    };
  },
  ...overrides
});

const mockProtectedUser = (role = "user") => {
  User.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(buildUser(role))
  });
};

const mockSessionForToken = (token, role = "user", overrides = {}) => {
  const decoded = jwt.decode(token);
  const session = {
    _id: decoded.sid || SESSION_ID,
    userId: USER_ID,
    tokenId: decoded.jti,
    tokenHash: hashToken(token),
    role,
    ipAddress: "127.0.0.1",
    userAgent: "unknown",
    deviceFingerprint: "test-device",
    isActive: true,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    refreshTokenFamilyId: "test-refresh-family",
    currentRefreshTokenId: "test-refresh-token",
    ...overrides
  };

  AuthSession.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(session)
  });

  return session;
};

const tokenFor = (role = "user", sessionOverrides = {}) => {
  const tokenId = `test-${role}-${Date.now()}-jti`;
  const token = jwt.sign(
    { id: USER_ID, role, sid: SESSION_ID },
    process.env.JWT_SECRET,
    { expiresIn: "1h", jwtid: tokenId }
  );
  mockSessionForToken(token, role, sessionOverrides);
  return token;
};

const mockEmptyFindChain = () => {
  const chain = {
    sort: jest.fn(() => chain),
    limit: jest.fn().mockResolvedValue([])
  };
  return chain;
};

describe("enterprise authentication hardening", () => {
  beforeEach(() => {
    app.set("io", null);
    jest.clearAllMocks();
    process.env.LOGIN_FAILURE_THRESHOLD = "5";
    process.env.LOGIN_LOCKOUT_BASE_MS = "900000";
    process.env.LOGIN_LOCKOUT_MAX_MS = "86400000";
    process.env.LOGIN_THROTTLE_RESET_MS = "3600000";
    process.env.IMPOSSIBLE_LOGIN_WINDOW_MS = "600000";
    process.env.COOKIE_SECURE = "";

    AuditLog.create.mockResolvedValue({});
    AuthSession.create.mockImplementation(async (payload) => payload);
    AuthSession.updateMany.mockResolvedValue({ modifiedCount: 0 });
    AuthSession.updateOne.mockResolvedValue({ modifiedCount: 1 });
    RefreshToken.create.mockImplementation(async (payload) => payload);
    RefreshToken.findOne.mockResolvedValue(null);
    RefreshToken.updateMany.mockResolvedValue({ modifiedCount: 0 });
    RefreshToken.updateOne.mockResolvedValue({ modifiedCount: 1 });
    AuthSession.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([])
    });
    LoginThrottle.findOne.mockResolvedValue(null);
    LoginThrottle.findOneAndUpdate.mockResolvedValue({});
    Device.findOne.mockResolvedValue({
      _id: "507f1f77bcf86cd799439066",
      deviceId: "trusted-device",
      fingerprint: "test-device",
      trusted: true
    });
    Device.create.mockResolvedValue({
      _id: "507f1f77bcf86cd799439066",
      deviceId: "new-device",
      fingerprint: "test-device",
      trusted: false
    });
    Device.findOneAndUpdate.mockResolvedValue({
      _id: "507f1f77bcf86cd799439066",
      deviceId: "trusted-device",
      fingerprint: "test-device",
      trusted: true
    });
    SecurityEvent.create.mockResolvedValue({});
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Transaction.countDocuments.mockResolvedValue(0);
    Transaction.find.mockReturnValue(mockEmptyFindChain());
    FraudAlert.countDocuments.mockResolvedValue(0);
    FraudAlert.find.mockReturnValue(mockEmptyFindChain());
    FraudAlert.findByIdAndUpdate.mockResolvedValue({ _id: ALERT_ID, status: "REVIEWING" });
  });

  test("returns password strength feedback and rejects weak registration passwords", async () => {
    const strengthResponse = await request(app)
      .post("/api/auth/password-strength")
      .send({ password: "weak" })
      .expect(200);

    expect(strengthResponse.body.passwordStrength.valid).toBe(false);
    expect(strengthResponse.body.passwordStrength.feedback).toEqual(
      expect.arrayContaining([expect.stringMatching(/12 characters/i)])
    );

    const registerResponse = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Weak User",
        email: "weak@example.com",
        password: "weak",
        role: "user"
      })
      .expect(400);

    expect(registerResponse.body.error.code).toBe("PASSWORD_POLICY_FAILED");
    expect(User.create).not.toHaveBeenCalled();
  });

  test("registers elevated analyst roles only with the admin registration key", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(buildUser("analyst"));

    const response = await request(app)
      .post("/api/auth/register")
      .set("X-Admin-Registration-Key", process.env.ADMIN_REGISTRATION_KEY)
      .send({
        name: "Fraud Analyst",
        email: "analyst@example.com",
        password: "StrongPass123!",
        role: "analyst"
      })
      .expect(201);

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(decoded.role).toBe("analyst");
    expect(decoded.jti).toEqual(expect.any(String));
    expect(decoded.sid).toEqual(expect.any(String));
    expect(AuthSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "analyst",
        tokenId: decoded.jti
      })
    );
  });

  test("locks an account after the fifth failed password attempt", async () => {
    const user = buildUser("user", {
      failedLoginAttempts: 4,
      comparePassword: jest.fn().mockResolvedValue(false)
    });
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(user)
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "security@example.com", password: "WrongPassword123!" })
      .expect(423);

    expect(response.body.error.code).toBe("ACCOUNT_LOCKED");
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: USER_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          failedLoginAttempts: 0,
          suspiciousLoginFlag: true,
          accountLockedUntil: expect.any(Date)
        })
      })
    );
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "LOGIN_BLOCKED",
        outcome: "BLOCKED"
      })
    );
  });

  test("blocks login when IP throttling is already active", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(buildUser("user"))
    });
    LoginThrottle.findOne.mockResolvedValue({
      scope: "ip",
      lockUntil: new Date(Date.now() + 10 * 60 * 1000)
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "security@example.com", password: "StrongPass123!" })
      .expect(429);

    expect(response.body.error.code).toBe("TOO_MANY_ATTEMPTS");
    expect(LoginThrottle.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("allows analysts to read fraud stats but blocks alert status changes", async () => {
    mockProtectedUser("analyst");
    const token = tokenFor("analyst");

    await request(app)
      .get("/api/fraud/stats")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const response = await request(app)
      .patch(`/api/fraud/alerts/${ALERT_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "REVIEWING" })
      .expect(403);

    expect(response.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
  });

  test("rejects JWTs without session binding claims", async () => {
    const token = jwt.sign({ id: USER_ID, role: "user" }, process.env.JWT_SECRET, {
      expiresIn: "1h"
    });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);

    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  test("rejects replayed or tampered JWTs when the token hash does not match the session", async () => {
    mockProtectedUser("user");
    const token = tokenFor("user", { tokenHash: "not-the-current-token-hash" });

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);

    expect(response.body.error.code).toBe("INVALID_TOKEN");
    expect(AuthSession.updateOne).toHaveBeenCalledWith(
      { _id: SESSION_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "TOKEN_HASH_MISMATCH"
        })
      })
    );
  });

  test("logout revokes the active server-side session", async () => {
    mockProtectedUser("user");
    const token = tokenFor("user");

    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(AuthSession.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: SESSION_ID,
        tokenId: expect.any(String),
        userId: USER_ID
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "USER_LOGOUT"
        })
      })
    );
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { familyId: "test-refresh-family" },
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "USER_LOGOUT"
        })
      })
    );
  });

  test("sets HttpOnly strict auth cookies on login while preserving the token response field", async () => {
    process.env.COOKIE_SECURE = "true";
    const user = buildUser("admin");
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(user)
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "security@example.com", password: "StrongPass123!" })
      .expect(200);

    const cookies = response.headers["set-cookie"].join("; ");
    expect(response.body.token).toEqual(expect.any(String));
    expect(cookies).toContain("sfd_access_token=");
    expect(cookies).toContain("sfd_refresh_token=");
    expect(cookies).toContain("sfd_csrf_token=");
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Strict/i);
    expect(cookies).toMatch(/Secure/i);
    process.env.COOKIE_SECURE = "";
  });

  test("authenticates protected routes with the access token cookie", async () => {
    mockProtectedUser("user");
    const token = tokenFor("user");

    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`sfd_access_token=${token}`])
      .expect(200);

    expect(response.body.user.email).toBe("security@example.com");
  });

  test("rotates refresh tokens and issues a new access cookie", async () => {
    const material = generateRefreshTokenMaterial("refresh-family-1");
    const tokenRecord = {
      _id: "507f1f77bcf86cd799439077",
      tokenId: material.tokenId,
      familyId: material.familyId,
      sessionId: SESSION_ID,
      userId: USER_ID,
      tokenHash: material.tokenHash,
      isActive: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      rotationCounter: 0
    };
    RefreshToken.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(tokenRecord)
    });
    AuthSession.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: SESSION_ID,
        userId: USER_ID,
        tokenHash: "current-access-hash",
        tokenId: "current-access-id",
        role: "user",
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 1000),
        refreshTokenFamilyId: material.familyId,
        ipAddress: "127.0.0.1",
        deviceFingerprint: sha256("refresh-device")
      })
    });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(buildUser("user"))
    });

    const csrfToken = createCsrfToken();

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("X-Device-Fingerprint", "refresh-device")
      .set("X-CSRF-Token", csrfToken)
      .set("Cookie", [`sfd_refresh_token=${material.token}`, `${CSRF_COOKIE_NAME}=${csrfToken}`])
      .expect(200);

    const cookies = response.headers["set-cookie"].join("; ");
    expect(response.body.token).toEqual(expect.any(String));
    expect(cookies).toContain("sfd_access_token=");
    expect(cookies).toContain("sfd_refresh_token=");
    expect(cookies).toContain("sfd_csrf_token=");
    expect(RefreshToken.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: tokenRecord._id,
        isActive: true
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "ROTATED"
        })
      })
    );
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: material.familyId,
        parentTokenId: material.tokenId,
        rotationCounter: 1
      })
    );
  });

  test("blocks refresh token replay and revokes the token family", async () => {
    const material = generateRefreshTokenMaterial("refresh-family-replay");
    const tokenRecord = {
      _id: "507f1f77bcf86cd799439078",
      tokenId: material.tokenId,
      familyId: material.familyId,
      sessionId: SESSION_ID,
      userId: USER_ID,
      tokenHash: material.tokenHash,
      isActive: false,
      usedAt: new Date(),
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    };
    RefreshToken.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(tokenRecord)
    });

    const csrfToken = createCsrfToken();

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("X-CSRF-Token", csrfToken)
      .set("Cookie", [`sfd_refresh_token=${material.token}`, `${CSRF_COOKIE_NAME}=${csrfToken}`])
      .expect(401);

    expect(response.body.error.code).toBe("INVALID_TOKEN");
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { familyId: material.familyId },
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "REFRESH_TOKEN_REUSE",
          reuseDetectedAt: expect.any(Date)
        })
      })
    );
    expect(AuthSession.updateMany).toHaveBeenCalledWith(
      { refreshTokenFamilyId: material.familyId, isActive: true },
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "REFRESH_TOKEN_REUSE"
        })
      })
    );
  });

  test("returns session expired for expired access token cookies", async () => {
    const token = jwt.sign(
      { id: USER_ID, role: "user", sid: SESSION_ID },
      process.env.JWT_SECRET,
      { expiresIn: "-1s", jwtid: "expired-cookie-jti" }
    );

    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`sfd_access_token=${token}`])
      .expect(401);

    expect(response.body.error.code).toBe("SESSION_EXPIRED");
  });

  test("registers soc-analyst roles and creates a session with the matching role", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(buildUser("soc-analyst", { email: "soc@example.com" }));

    const response = await request(app)
      .post("/api/auth/register")
      .set("X-Admin-Registration-Key", process.env.ADMIN_REGISTRATION_KEY)
      .send({
        name: "SOC Analyst",
        email: "soc@example.com",
        password: "StrongPass123!",
        role: "soc-analyst"
      })
      .expect(201);

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(decoded.role).toBe("soc-analyst");
    expect(AuthSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "soc-analyst"
      })
    );
  });

  test("logout-all revokes other sessions without clearing the current auth cookies", async () => {
    mockProtectedUser("user");
    const token = tokenFor("user", { refreshTokenFamilyId: "current-family" });

    const response = await request(app)
      .post("/api/auth/logout-all")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.message).toBe("All other sessions were revoked");
    expect(response.headers["set-cookie"] || []).toEqual(
      expect.not.arrayContaining([
        expect.stringContaining("sfd_access_token"),
        expect.stringContaining("sfd_refresh_token")
      ])
    );
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        isActive: true,
        familyId: { $ne: "current-family" }
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "USER_LOGOUT_ALL"
        })
      })
    );
    expect(AuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        isActive: true,
        _id: { $ne: SESSION_ID }
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          isActive: false,
          revokedReason: "USER_LOGOUT_ALL"
        })
      })
    );
  });

  test("rejects recovery code regeneration without a valid MFA token", async () => {
    mockProtectedUser("user");
    const token = tokenFor("user", { mfaVerified: true });
    User.findById.mockReturnValue({
      select: jest.fn().mockImplementation((fields) => {
        const fieldList = String(fields || "");
        if (fieldList.includes("mfaSecretEncrypted")) {
          return Promise.resolve({
            _id: USER_ID,
            role: "user",
            mfaEnabled: true,
            mfaSecretEncrypted: "encrypted-secret"
          });
        }

        return Promise.resolve(buildUser("user"));
      })
    });

    const response = await request(app)
      .post("/api/auth/mfa/recovery-codes")
      .set("Authorization", `Bearer ${token}`)
      .send({ token: "000000" })
      .expect(401);

    expect(response.body.error.code).toBe("INVALID_TOKEN");
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test("blocks MFA disable before the login MFA gate is completed", async () => {
    mockProtectedUser("user");
    const token = tokenFor("user", { mfaRequired: true, mfaVerified: false });

    const response = await request(app)
      .post("/api/auth/mfa/disable")
      .set("Authorization", `Bearer ${token}`)
      .send({ token: "123456" })
      .expect(403);

    expect(response.body.error.code).toBe("MFA_REQUIRED");
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test("blocks MFA re-enrollment when MFA is already enabled", async () => {
    mockProtectedUser("user");
    const token = tokenFor("user", { mfaVerified: true });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: USER_ID,
        role: "user",
        mfaEnabled: true
      })
    });

    const response = await request(app)
      .post("/api/auth/mfa/enroll")
      .set("Authorization", `Bearer ${token}`)
      .expect(409);

    expect(response.body.message).toBe("MFA is already enabled");
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });
});
