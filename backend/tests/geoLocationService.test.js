jest.mock("axios", () => ({
  get: jest.fn()
}));

const axios = require("axios");
const {
  calculateIpRisk,
  clearGeoLocationCache,
  fetchIPLocation
} = require("../src/services/geoLocationService");

describe("geoLocationService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    clearGeoLocationCache();
    process.env = {
      ...originalEnv,
      GEOLOCATION_URL: "http://geo.test/json",
      GEOLOCATION_TIMEOUT_MS: "100",
      GEOLOCATION_RETRY_ATTEMPTS: "1",
      GEOLOCATION_CACHE_TTL_MS: "60000"
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("fetches and caches public IP geolocation", async () => {
    axios.get.mockResolvedValue({
      data: {
        status: "success",
        country: "India",
        city: "Bengaluru",
        lat: 12.9716,
        lon: 77.5946,
        isp: "Example ISP",
        org: "Example Org",
        as: "AS12345",
        query: "8.8.8.8",
        proxy: false,
        hosting: false,
        mobile: false
      }
    });

    const first = await fetchIPLocation("8.8.8.8");
    const second = await fetchIPLocation("8.8.8.8");

    expect(first.success).toBe(true);
    expect(first.data.city).toBe("Bengaluru");
    expect(first.data.ipRisk).toBe(10);
    expect(second.data.city).toBe("Bengaluru");
    expect(axios.get).toHaveBeenCalledTimes(1);
  });

  test("scores proxy and hosting IP metadata as higher risk", () => {
    const risk = calculateIpRisk({
      ipAddress: "8.8.8.8",
      geoData: {
        city: "Unknown",
        country: "United States",
        proxy: true,
        hosting: true
      }
    });

    expect(risk).toBeGreaterThanOrEqual(80);
  });

  test("returns a safe structured response for private IPs without external calls", async () => {
    const result = await fetchIPLocation("127.0.0.1");

    expect(result.success).toBe(false);
    expect(result.data.ipRisk).toBe(5);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
