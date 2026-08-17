process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "9b1ec8a88c2d43d3aa6f955d6a6f63cbb18859fb48f24ebeb2f2d50c5bfda712";
process.env.CSRF_SECRET =
  process.env.CSRF_SECRET || "3d2ed860fa2c4e44a17e65eff40c775bf0e3e8a61f6d4570bb36ab85d4481783";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
process.env.ADMIN_REGISTRATION_KEY =
  process.env.ADMIN_REGISTRATION_KEY || "85888c6617d94ed998e3c4423d66ec18";
process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || "1000";
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || "50";
process.env.TRANSACTION_RATE_LIMIT_MAX = process.env.TRANSACTION_RATE_LIMIT_MAX || "100";
process.env.AI_ENGINE_API_KEY =
  process.env.AI_ENGINE_API_KEY || "test_ai_engine_api_key_123456789";
// Required for field-level encryption (keyManager) — must NOT use JWT_SECRET as fallback
process.env.MASTER_ENCRYPTION_KEY =
  process.env.MASTER_ENCRYPTION_KEY ||
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
// Required for validateStartupEnv in envConfig tests
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/test_fraud_detection";
process.env.REQUIRE_MONGO_AUTH = process.env.REQUIRE_MONGO_AUTH || "false";
