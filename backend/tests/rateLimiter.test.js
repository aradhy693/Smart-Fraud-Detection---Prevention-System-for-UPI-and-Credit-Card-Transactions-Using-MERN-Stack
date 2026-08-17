const express = require("express");
const request = require("supertest");

describe("rate limiter middleware", () => {
  test("returns 429 with structured JSON after the configured limit", async () => {
    jest.resetModules();
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    process.env.API_RATE_LIMIT_MAX = "2";
    const { apiLimiter } = require("../src/middleware/rateLimitMiddleware");

    const app = express();
    app.set("trust proxy", 1);
    app.use(apiLimiter);
    app.get("/limited", (req, res) => res.status(200).json({ success: true }));

    await request(app).get("/limited").expect(200);
    await request(app).get("/limited").expect(200);
    const response = await request(app).get("/limited").expect(429);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});
