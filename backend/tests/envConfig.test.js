const {
  getRequiredEnv,
  validateRequiredEnv,
  validateStartupEnv
} = require("../src/config/env");

describe("environment configuration validation", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("identifies all required runtime variables when missing", () => {
    process.env.MONGO_URI = "";
    process.env.MONGODB_URI = "";
    process.env.JWT_SECRET = "";
    process.env.CSRF_SECRET = "";
    process.env.ADMIN_REGISTRATION_KEY = "";
    process.env.AI_ENGINE_API_KEY = "";
    process.env.MASTER_ENCRYPTION_KEY = "";

    const errors = validateRequiredEnv();

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "MONGO_URI", code: "MONGO_URI_MISSING" }),
        expect.objectContaining({ field: "JWT_SECRET", code: "JWT_SECRET_MISSING" }),
        expect.objectContaining({ field: "CSRF_SECRET", code: "CSRF_SECRET_MISSING" }),
        expect.objectContaining({
          field: "ADMIN_REGISTRATION_KEY",
          code: "ADMIN_REGISTRATION_KEY_MISSING"
        }),
        expect.objectContaining({
          field: "AI_ENGINE_API_KEY",
          code: "AI_ENGINE_API_KEY_MISSING"
        }),
        expect.objectContaining({
          field: "MASTER_ENCRYPTION_KEY",
          code: "MASTER_ENCRYPTION_KEY_MISSING"
        })
      ])
    );
  });

  test("throws a single structured startup error for missing required env", () => {
    process.env.MONGO_URI = "";
    process.env.MONGODB_URI = "";
    process.env.JWT_SECRET = "";
    process.env.CSRF_SECRET = "";
    process.env.ADMIN_REGISTRATION_KEY = "";
    process.env.AI_ENGINE_API_KEY = "";
    process.env.MASTER_ENCRYPTION_KEY = "";

    expect(() => validateStartupEnv()).toThrow("Required backend environment variables");
  });

  test("reads the configured admin registration key safely", () => {
    process.env.ADMIN_REGISTRATION_KEY = "admin-key-with-strong-length";

    expect(getRequiredEnv("ADMIN_REGISTRATION_KEY")).toBe("admin-key-with-strong-length");
  });

  test("validates MASTER_ENCRYPTION_KEY is present and meets minimum length", () => {
    // Too short
    process.env.MASTER_ENCRYPTION_KEY = "tooshort";
    const errors = validateRequiredEnv();
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "MASTER_ENCRYPTION_KEY" })
      ])
    );
  });

  test("requires authenticated MongoDB URI when Mongo auth is enabled", () => {
    process.env.REQUIRE_MONGO_AUTH = "true";
    process.env.MONGO_URI = "mongodb://localhost:27017/test_fraud_detection";

    const errors = validateRequiredEnv();

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "MONGO_URI", code: "MONGO_AUTH_REQUIRED" })
      ])
    );
  });

  test("accepts authenticated MongoDB URI when Mongo auth is enabled", () => {
    process.env.REQUIRE_MONGO_AUTH = "true";
    process.env.MONGO_URI =
      "mongodb://fraud_app:encodedPassword@localhost:27017/test_fraud_detection?authSource=test_fraud_detection";

    const errors = validateRequiredEnv();

    expect(errors.some((error) => error.field === "MONGO_URI")).toBe(false);
  });

  test("rejects MongoDB root credentials in authenticated URIs", () => {
    process.env.REQUIRE_MONGO_AUTH = "true";
    process.env.MONGO_URI = "mongodb://root:encodedPassword@localhost:27017/test_fraud_detection?authSource=admin";

    const errors = validateRequiredEnv();

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MONGO_ROOT_CREDENTIALS_NOT_ALLOWED" })
      ])
    );
  });

  test("rejects placeholder secret values", () => {
    process.env.CSRF_SECRET = "<generate-with-crypto-randomBytes-32-hex>";

    const errors = validateRequiredEnv();

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "CSRF_SECRET", code: "CSRF_SECRET_PLACEHOLDER" })
      ])
    );
  });

  test("no insecure default values accepted — all required secrets must be explicit", () => {
    // Verify that an empty MASTER_ENCRYPTION_KEY is rejected at startup
    const savedKey = process.env.MASTER_ENCRYPTION_KEY;
    process.env.MASTER_ENCRYPTION_KEY = "";

    const errors = validateRequiredEnv();
    expect(errors.some((e) => e.field === "MASTER_ENCRYPTION_KEY")).toBe(true);

    process.env.MASTER_ENCRYPTION_KEY = savedKey;
  });

  test("startup succeeds when all required secrets are present and valid", () => {
    // All required env vars are set via setupTests.js — startup should not throw
    expect(() => validateStartupEnv()).not.toThrow();
  });
});
