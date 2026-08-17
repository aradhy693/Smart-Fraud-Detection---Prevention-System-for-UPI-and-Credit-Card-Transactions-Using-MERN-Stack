jest.mock("../src/services/aiService", () => ({
  getFraudPrediction: jest.fn()
}));

jest.mock("../src/services/geoLocationService", () => ({
  fetchIPLocation: jest.fn()
}));

jest.mock("../src/services/riskEngineService", () => ({
  calculateRuleRisk: jest.fn()
}));

const { getFraudPrediction } = require("../src/services/aiService");
const { fetchIPLocation } = require("../src/services/geoLocationService");
const { calculateRuleRisk } = require("../src/services/riskEngineService");
const fraudEngine = require("../src/middleware/fraudEngine");

const buildReq = (body = {}, headers = {}) => ({
  body,
  user: { _id: "507f1f77bcf86cd799439011" },
  headers,
  ip: "203.0.113.10",
  socket: { remoteAddress: "203.0.113.10" }
});

const runFraudEngine = (req) =>
  new Promise((resolve, reject) => {
    fraudEngine(req, {}, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(req);
    });
  });

describe("fraudEngine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchIPLocation.mockResolvedValue({
      success: true,
      data: {
        latitude: 12.9716,
        longitude: 77.5946,
        city: "Bengaluru",
        country: "India",
        ipRisk: 0
      }
    });
    calculateRuleRisk.mockResolvedValue({
      decision: "LOW_RISK",
      riskScore: 10,
      velocityScore: 0,
      velocityCount: 0,
      distanceKm: 0,
      reasons: {},
      riskFeatures: {
        transactionVelocity: 0,
        ipRisk: 0,
        deviceRisk: 0,
        geoDistance: 0,
        impossibleTravel: false,
        hourOfDay: 12,
        repeatedFailures: 0,
        newDeviceFlag: false
      }
    });
    getFraudPrediction.mockResolvedValue({
      success: true,
      data: {
        riskScore: 5,
        decision: "ALLOWED",
        riskLevel: "LOW_RISK",
        fraudProbability: 0.05,
        modelVersion: "test-model",
        featureContributions: {}
      }
    });
  });

  test("ignores client-supplied ipAddress and uses server-derived IP for fraud scoring", async () => {
    const req = buildReq({
      amount: 1200,
      paymentMethod: "UPI",
      deviceId: "device-001",
      ipAddress: "198.51.100.50",
      location: { latitude: 12.9716, longitude: 77.5946, city: "Bengaluru", country: "India" }
    });

    await runFraudEngine(req);

    expect(calculateRuleRisk).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: "203.0.113.10"
      })
    );
    expect(fetchIPLocation).toHaveBeenCalledWith("203.0.113.10");
    expect(req.normalizedTransaction.ipAddress).toBe("203.0.113.10");
  });

  test("does not trust client-controlled X-Forwarded-For for fraud scoring", async () => {
    const req = buildReq(
      {
        amount: 1200,
        paymentMethod: "UPI",
        deviceId: "device-001"
      },
      {
        "x-forwarded-for": "127.0.0.1"
      }
    );

    await runFraudEngine(req);

    expect(calculateRuleRisk).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: "203.0.113.10"
      })
    );
    expect(fetchIPLocation).toHaveBeenCalledWith("203.0.113.10");
    expect(req.normalizedTransaction.ipAddress).toBe("203.0.113.10");
  });

  test("flags transactions when the AI service is unavailable", async () => {
    getFraudPrediction.mockResolvedValue({
      success: false,
      data: {
        fraudProbability: 0,
        riskScore: 0,
        decision: "ALLOWED",
        riskLevel: "LOW_RISK",
        modelVersion: "rules-fallback",
        featureContributions: {},
        serviceAvailable: false
      }
    });

    const req = buildReq({
      amount: 1200,
      paymentMethod: "UPI",
      deviceId: "device-001"
    });

    await runFraudEngine(req);

    expect(req.fraudReport.status).toBe("FLAGGED_OTP");
    expect(req.fraudReport.decision).toBe("MEDIUM_RISK");
    expect(req.fraudReport.reasons.aiServiceUnavailable).toBe(true);
    expect(req.fraudReport.aiDecision).toBe("UNAVAILABLE");
  });
});
