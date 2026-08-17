const jwt = require("jsonwebtoken");
const request = require("supertest");

jest.mock("../src/models/User", () => ({
  findById: jest.fn()
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

const app = require("../src/app");
const User = require("../src/models/User");
const AuthSession = require("../src/models/AuthSession");
const RefreshToken = require("../src/models/RefreshToken");
const AuditLog = require("../src/models/AuditLog");
const {
  generateRefreshTokenMaterial
} = require("../src/services/refreshTokenService");
const { createCsrfToken, CSRF_COOKIE_NAME } = require("../src/security/csrf");
const {
  getSessionExpirationDate,
  isSessionExpired,
  sha256,
  validateAuthSession
} = require("../src/services/sessionService");

const USER_ID = "507f1f77bcf86cd799439011";
const SESSION_ID = "507f1f77bcf86cd799439088";
const fingerprint = "a".repeat(64);

const buildReq = (headers = {}) => ({
  headers: {
    "user-agent": "Mozilla/5.0 Test Browser",
    "x-device-fingerprint": fingerprint,
    ...headers
  },
  ip: "127.0.0.1",
  socket: { remoteAddress: "127.0.0.1" }
});

describe("session management hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditLog.create.mockResolvedValue({});
    AuthSession.updateOne.mockResolvedValue({ modifiedCount: 1 });
    RefreshToken.create.mockImplementation(async (payload) => payload);
    RefreshToken.updateOne.mockResolvedValue({ modifiedCount: 1 });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: USER_ID,
        email: "security@example.com",
        role: "user"
      })
    });
  });

  test("uses refresh-token lifetime for new sessions", () => {
    const expiresAt = getSessionExpirationDate();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + sevenDaysMs - 5000);
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + sevenDaysMs + 5000);
  });

  test("keeps session active while refreshTokenExpiresAt is still valid", async () => {
    const tokenId = "session-lifetime-jti";
    const token = jwt.sign(
      { id: USER_ID, role: "user", sid: SESSION_ID },
      process.env.JWT_SECRET,
      { expiresIn: "1h", jwtid: tokenId }
    );
    const decoded = jwt.decode(token);
    const session = {
      _id: SESSION_ID,
      userId: USER_ID,
      tokenId,
      tokenHash: sha256(token),
      role: "user",
      isActive: true,
      expiresAt: new Date(Date.now() - 60 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deviceFingerprint: fingerprint,
      deviceBound: true
    };

    AuthSession.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(session)
    });

    const result = await validateAuthSession({
      decoded,
      token,
      req: buildReq()
    });

    expect(result.session._id).toBe(SESSION_ID);
    expect(isSessionExpired(session)).toBe(false);
    expect(AuthSession.updateOne).toHaveBeenCalledWith(
      { _id: SESSION_ID },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastSeenAt: expect.any(Date)
        })
      })
    );
  });

  test("expires session when refreshTokenExpiresAt has passed", async () => {
    const session = {
      expiresAt: new Date(Date.now() - 60 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() - 30 * 1000)
    };

    expect(isSessionExpired(session)).toBe(true);
  });

  test("rejects refresh token values supplied in request body", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "family.token.secret" })
      .expect(400);

    expect(response.body.error.code).toBe("REFRESH_TOKEN_MUST_USE_COOKIE");
  });

  test("blocks refresh requests from untrusted origins in production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalOrigins = process.env.CORS_ORIGINS;
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "http://localhost:5173";

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", "https://evil.example")
      .expect(403);

    expect(response.body.error.code).toBe("INVALID_TOKEN");
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "SUSPICIOUS_AUTH",
        outcome: "BLOCKED"
      })
    );

    process.env.NODE_ENV = originalNodeEnv;
    process.env.CORS_ORIGINS = originalOrigins;
  });

  test("allows refresh without Origin header for API clients", async () => {
    const material = generateRefreshTokenMaterial("refresh-family-origin");
    const tokenRecord = {
      _id: "507f1f77bcf86cd799439079",
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
        tokenHash: sha256("existing-access-token"),
        tokenId: "existing-access-id",
        role: "user",
        isActive: true,
        refreshTokenFamilyId: material.familyId,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: "127.0.0.1",
        deviceFingerprint: sha256("refresh-device")
      })
    });

    const csrfToken = createCsrfToken();

    const response = await request(app)
      .post("/api/auth/refresh")
      .set("X-Device-Fingerprint", "refresh-device")
      .set("X-CSRF-Token", csrfToken)
      .set("Cookie", [`sfd_refresh_token=${material.token}`, `${CSRF_COOKIE_NAME}=${csrfToken}`])
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.token).toEqual(expect.any(String));
  });
});
