const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const request = require("supertest");

jest.mock("../src/models/User", () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
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
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock("../src/models/FraudAlert", () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  countDocuments: jest.fn()
}));

jest.mock("../src/services/aiService", () => ({
  getFraudPrediction: jest.fn()
}));

jest.mock("../src/services/geoLocationService", () => ({
  fetchIPLocation: jest.fn()
}));

const app = require("../src/app");
const User = require("../src/models/User");
const AuthSession = require("../src/models/AuthSession");
const AuditLog = require("../src/models/AuditLog");
const LoginThrottle = require("../src/models/LoginThrottle");
const RefreshToken = require("../src/models/RefreshToken");
const Device = require("../src/models/Device");
const SecurityEvent = require("../src/models/SecurityEvent");
const Transaction = require("../src/models/Transaction");
const FraudAlert = require("../src/models/FraudAlert");
const { getFraudPrediction } = require("../src/services/aiService");
const { fetchIPLocation } = require("../src/services/geoLocationService");

const USER_ID = "507f1f77bcf86cd799439011";
const ALERT_ID = "507f1f77bcf86cd799439099";
const SESSION_ID = "507f1f77bcf86cd799439088";

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const mockSessionForToken = (token, role = "user", sid = SESSION_ID, tokenId = `test-${role}-jti`) => {
  AuthSession.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: sid,
      userId: USER_ID,
      tokenId,
      tokenHash: hashToken(token),
      role,
      ipAddress: "127.0.0.1",
      userAgent: "unknown",
      deviceFingerprint: "test-device",
      isActive: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshTokenFamilyId: "test-refresh-family",
      currentRefreshTokenId: "test-refresh-token"
    })
  });
};

const tokenFor = (role = "user") => {
  const tokenId = `test-${role}-jti`;
  const token = jwt.sign(
    { id: USER_ID, role, sid: SESSION_ID },
    process.env.JWT_SECRET,
    { expiresIn: "1h", jwtid: tokenId }
  );
  mockSessionForToken(token, role, SESSION_ID, tokenId);
  return token;
};

const buildUser = (role = "user") => ({
  _id: USER_ID,
  name: "Analyst User",
  email: "analyst@example.com",
  role,
  toJSON() {
    return {
      _id: USER_ID,
      name: this.name,
      email: this.email,
      role: this.role
    };
  }
});

const mockProtectedUser = (role = "user") => {
  User.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(buildUser(role))
  });
};

const mockLastTransaction = (lastTransaction = null) => {
  Transaction.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue(lastTransaction)
  });
};

const mockTransactionCreate = () => {
  Transaction.create.mockImplementation(async (payload) => ({
    _id: "507f1f77bcf86cd799439012",
    transactionReference: "TXN_TEST_001",
    timestamp: new Date("2026-05-23T00:00:00.000Z"),
    ...payload
  }));
};

const mockAlertPopulation = (alertPayload = { _id: ALERT_ID, status: "OPEN" }) => {
  FraudAlert.create.mockResolvedValue({ _id: ALERT_ID, ...alertPayload });
  const populateChain = {
    populate: jest.fn()
  };
  populateChain.populate.mockReturnValueOnce(populateChain).mockResolvedValueOnce(alertPayload);
  FraudAlert.findById.mockReturnValue(populateChain);
};

const baseTransactionPayload = {
  amount: 1200,
  paymentMethod: "UPI",
  identifier: "user@upi",
  deviceId: "device-001",
  location: {
    latitude: 12.9716,
    longitude: 77.5946,
    city: "Bengaluru",
    country: "India"
  }
};

describe("backend API security and fraud flow", () => {
  beforeEach(() => {
    app.set("io", null);
    jest.clearAllMocks();
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

    getFraudPrediction.mockResolvedValue({
      success: true,
      data: {
        riskScore: 5,
        decision: "LOW_RISK",
        modelVersion: "test-model",
        shapExplanation: {}
      }
    });

    fetchIPLocation.mockResolvedValue({
      success: true,
      data: {
        latitude: 12.9716,
        longitude: 77.5946,
        city: "Bengaluru",
        country: "India"
      }
    });

    Transaction.countDocuments.mockResolvedValue(0);
    mockLastTransaction(null);
    mockTransactionCreate();
    mockAlertPopulation();
  });

  test("rejects requests with an invalid JWT", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  test("registers an admin with a valid admin registration key and returns a JWT", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(buildUser("admin"));

    const response = await request(app)
      .post("/api/auth/register")
      .set("X-Admin-Registration-Key", process.env.ADMIN_REGISTRATION_KEY)
      .send({
        name: "SOC Admin",
        email: "admin@example.com",
        password: "StrongPass123!",
        role: "admin"
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.user.role).toBe("admin");
    expect(response.body.token).toEqual(expect.any(String));

    const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
    expect(decoded.role).toBe("admin");
    expect(decoded.id).toBe(USER_ID);
  });

  test("protects admin fraud routes from non-admin users", async () => {
    mockProtectedUser("user");

    const response = await request(app)
      .get("/api/fraud/stats")
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .expect(403);

    expect(response.body.error.code).toBe("INSUFFICIENT_PERMISSIONS");
  });

  test("blocks transactions over 50000 and emits a fraud alert", async () => {
    mockProtectedUser("user");
    const adminEmit = jest.fn();
    const to = jest.fn(() => ({ emit: adminEmit }));
    app.set("io", { to });

    const response = await request(app)
      .post("/api/transactions/process")
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .send({
        ...baseTransactionPayload,
        amount: 50001,
        paymentMethod: "CREDIT_CARD",
        identifier: "card-token-001"
      })
      .expect(201);

    expect(response.body.data.status).toBe("BLOCKED");
    expect(response.body.fraudReport.decision).toBe("HIGH_RISK");
    expect(response.body.fraudReport.reasons.highAmount).toBe(100);
    expect(FraudAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "HIGH_RISK_TRANSACTION",
        severity: "CRITICAL",
        status: "OPEN"
      })
    );
    expect(to).toHaveBeenCalledWith("admin-dashboard");
    expect(adminEmit).toHaveBeenCalledWith("fraud-alert", expect.objectContaining({ status: "OPEN" }));
    expect(adminEmit).toHaveBeenCalledWith(
      "new-transaction",
      expect.objectContaining({ status: "BLOCKED", fraudDecision: "HIGH_RISK" })
    );
  });

  test("flags high-velocity transaction attempts", async () => {
    mockProtectedUser("user");
    Transaction.countDocuments.mockResolvedValueOnce(3).mockResolvedValue(0);

    const response = await request(app)
      .post("/api/transactions/process")
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .send(baseTransactionPayload)
      .expect(201);

    expect(response.body.data.status).toBe("FLAGGED_OTP");
    expect(response.body.fraudReport.decision).toBe("MEDIUM_RISK");
    expect(response.body.fraudReport.reasons.velocity).toBe(40);
    expect(FraudAlert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "VELOCITY_SPIKE",
        status: "OPEN"
      })
    );
  });

  test("allows safe transactions and stores them without creating alerts", async () => {
    mockProtectedUser("user");

    const response = await request(app)
      .post("/api/transactions/process")
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .send(baseTransactionPayload)
      .expect(201);

    expect(response.body.data.status).toBe("ALLOWED");
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: baseTransactionPayload.amount,
        paymentMethod: "UPI",
        ipAddress: expect.any(String)
      })
    );
    expect(FraudAlert.create).not.toHaveBeenCalled();
  });

  test("flags transactions when AI service is unavailable", async () => {
    mockProtectedUser("user");
    getFraudPrediction.mockResolvedValue({
      success: false,
      data: {
        fraudProbability: 0,
        riskScore: 0,
        status: "ALLOWED",
        decision: "ALLOWED",
        riskLevel: "LOW_RISK",
        modelVersion: "rules-fallback",
        featureContributions: {},
        serviceAvailable: false
      }
    });

    const response = await request(app)
      .post("/api/transactions/process")
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .send(baseTransactionPayload)
      .expect(201);

    expect(response.body.data.status).toBe("FLAGGED_OTP");
    expect(response.body.fraudReport.decision).toBe("MEDIUM_RISK");
    expect(response.body.fraudReport.reasons.aiServiceUnavailable).toBe(true);
    expect(response.body.fraudReport.modelVersion).toBe("rules-fallback");
    expect(Transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        riskSignals: expect.objectContaining({
          aiServiceAvailable: false
        })
      })
    );
  });

  test("rejects malformed transaction payloads before persistence", async () => {
    mockProtectedUser("user");

    const response = await request(app)
      .post("/api/transactions/process")
      .set("Authorization", `Bearer ${tokenFor("user")}`)
      .send({
        amount: -10,
        paymentMethod: "WIRE",
        identifier: "12",
        deviceId: "d"
      })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(Transaction.create).not.toHaveBeenCalled();
  });

  test("rejects invalid login credentials with structured JSON", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null)
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "analyst@example.com", password: "wrong-password" })
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});
