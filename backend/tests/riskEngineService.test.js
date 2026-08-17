jest.mock("../src/models/Transaction", () => ({
  countDocuments: jest.fn(),
  findOne: jest.fn()
}));

const Transaction = require("../src/models/Transaction");
const { calculateRuleRisk } = require("../src/services/riskEngineService");

const mockLastTransaction = (transaction = null) => {
  Transaction.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue(transaction)
  });
};

describe("riskEngineService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Transaction.countDocuments.mockResolvedValue(0);
    mockLastTransaction(null);
  });

  test("blocks amounts greater than 50000", async () => {
    const risk = await calculateRuleRisk({
      user: null,
      transactionAmount: 50001,
      deviceId: "device-001",
      ipAddress: "8.8.8.8",
      geoLocation: { latitude: 12.9716, longitude: 77.5946 }
    });

    expect(risk.decision).toBe("HIGH_RISK");
    expect(risk.riskScore).toBe(100);
    expect(risk.reasons.highAmount).toBe(100);
  });

  test("flags high velocity based on recent transaction count", async () => {
    Transaction.countDocuments.mockResolvedValueOnce(3).mockResolvedValue(0);

    const risk = await calculateRuleRisk({
      user: { _id: "507f1f77bcf86cd799439011" },
      transactionAmount: 1000,
      deviceId: "device-001",
      ipAddress: "8.8.8.8",
      geoLocation: { latitude: 12.9716, longitude: 77.5946 }
    });

    expect(risk.decision).toBe("MEDIUM_RISK");
    expect(risk.velocityCount).toBe(3);
    expect(risk.reasons.velocity).toBe(40);
  });

  test("raises impossible-travel risk when locations are far apart", async () => {
    mockLastTransaction({
      deviceId: "device-001",
      location: {
        latitude: 28.6139,
        longitude: 77.209
      }
    });

    const risk = await calculateRuleRisk({
      user: { _id: "507f1f77bcf86cd799439011" },
      transactionAmount: 1000,
      deviceId: "device-001",
      ipAddress: "8.8.8.8",
      geoLocation: { latitude: 12.9716, longitude: 77.5946 }
    });

    expect(risk.decision).toBe("MEDIUM_RISK");
    expect(risk.reasons.impossibleTravel).toBe(45);
    expect(risk.distanceKm).toBeGreaterThan(800);
  });
});
