jest.mock("axios", () => ({
  post: jest.fn()
}));

const axios = require("axios");
const { getFraudPrediction, normalizePrediction } = require("../src/services/aiService");

describe("aiService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AI_ENGINE_URL: "http://ai-engine.test",
      AI_REQUEST_TIMEOUT_MS: "100",
      AI_REQUEST_RETRY_ATTEMPTS: "1",
      AI_ENGINE_API_KEY: "test_ai_engine_api_key_123456789"
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("normalizes FastAPI fraud predictions", () => {
    const normalized = normalizePrediction({
      success: true,
      fraudProbability: 0.82,
      riskScore: 82,
      decision: "BLOCKED",
      riskLevel: "HIGH_RISK",
      modelVersion: "random-forest-hybrid-v1",
      featureContributions: { transactionAmount: 30 }
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        fraudProbability: 0.82,
        riskScore: 82,
        status: "BLOCKED",
        riskLevel: "HIGH_RISK",
        serviceAvailable: true
      })
    );
  });

  test("calls the FastAPI predict endpoint with timeout protection", async () => {
    axios.post.mockResolvedValue({
      data: {
        success: true,
        fraudProbability: 0.61,
        riskScore: 61,
        decision: "FLAGGED",
        riskLevel: "MEDIUM_RISK",
        modelVersion: "random-forest-hybrid-v1",
        featureContributions: {}
      }
    });

    const payload = {
      transactionAmount: 28000,
      paymentType: "CARD",
      transactionVelocity: 2
    };

    const result = await getFraudPrediction(payload);

    expect(result.success).toBe(true);
    expect(result.data.status).toBe("FLAGGED");
    expect(axios.post).toHaveBeenCalledWith(
      "http://ai-engine.test/predict",
      payload,
      expect.objectContaining({
        timeout: 100,
        headers: expect.objectContaining({
          "X-AI-API-Key": "test_ai_engine_api_key_123456789"
        })
      })
    );
  });

  test("returns a structured fallback when the AI request times out", async () => {
    axios.post.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }));

    const result = await getFraudPrediction({
      transactionAmount: 1000,
      paymentType: "UPI"
    });

    expect(result.success).toBe(false);
    expect(result.data.status).toBe("ALLOWED");
    expect(result.data.modelVersion).toBe("rules-fallback");
    expect(result.data.serviceAvailable).toBe(false);
  });
});
