const path = require("path");
const dotenv = require("dotenv");
const AppError = require("../utils/AppError");

const DOTENV_PATH = path.resolve(__dirname, "../../.env");

const DEFAULT_ENV = {
  NODE_ENV: "development",
  PORT: "5000",
  JWT_EXPIRES_IN: "15m",
  ACCESS_TOKEN_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d",
  ACCESS_TOKEN_COOKIE_NAME: "sfd_access_token",
  REFRESH_TOKEN_COOKIE_NAME: "sfd_refresh_token",
  CSRF_COOKIE_NAME: "sfd_csrf_token",
  COOKIE_SECURE: "",
  REQUIRE_MONGO_AUTH: "",
  BCRYPT_SALT_ROUNDS: "12",
  AI_ENGINE_URL: "http://localhost:8000",
  AI_REQUEST_TIMEOUT_MS: "4500",
  AI_REQUEST_RETRY_ATTEMPTS: "2",
  GEOLOCATION_URL: "http://ip-api.com/json",
  GEOLOCATION_TIMEOUT_MS: "3500",
  GEOLOCATION_RETRY_ATTEMPTS: "2",
  GEOLOCATION_CACHE_TTL_MS: "600000",
  FRONTEND_URL: "http://localhost:5174",
  CORS_ORIGINS: "http://localhost:5174,http://127.0.0.1:5174",
  RATE_LIMIT_WINDOW_MS: "900000",
  AUTH_RATE_LIMIT_WINDOW_MS: "60000",
  API_RATE_LIMIT_MAX: "200",
  AUTH_RATE_LIMIT_MAX: "10",
  TRANSACTION_RATE_LIMIT_MAX: "30",
  LOGIN_FAILURE_THRESHOLD: "5",
  LOGIN_LOCKOUT_BASE_MS: "900000",
  LOGIN_LOCKOUT_MAX_MS: "86400000",
  LOGIN_THROTTLE_RESET_MS: "3600000",
  IMPOSSIBLE_LOGIN_WINDOW_MS: "600000",
  MFA_TOTP_WINDOW: "2"
};

const REQUIRED_ENV = [
  {
    name: "MONGO_URI",
    aliases: ["MONGODB_URI"],
    minLength: 1,
    code: "MONGO_URI_MISSING",
    message: "MongoDB connection string is not configured. Set MONGO_URI in backend/.env."
  },
  {
    name: "JWT_SECRET",
    aliases: [],
    minLength: 32,
    code: "JWT_SECRET_MISSING",
    message: "JWT secret is not configured securely. Set JWT_SECRET to at least 32 characters."
  },
  {
    name: "CSRF_SECRET",
    aliases: [],
    minLength: 32,
    code: "CSRF_SECRET_MISSING",
    message: "CSRF secret is not configured securely. Set CSRF_SECRET to at least 32 characters."
  },
  {
    name: "ADMIN_REGISTRATION_KEY",
    aliases: [],
    minLength: 16,
    code: "ADMIN_REGISTRATION_KEY_MISSING",
    message:
      "Admin registration key is not configured. Set ADMIN_REGISTRATION_KEY in backend/.env."
  },
  {
    name: "AI_ENGINE_API_KEY",
    aliases: [],
    minLength: 16,
    code: "AI_ENGINE_API_KEY_MISSING",
    message: "AI engine API key is not configured. Set AI_ENGINE_API_KEY in backend/.env."
  },
  {
    name: "MASTER_ENCRYPTION_KEY",
    aliases: [],
    minLength: 32,
    code: "MASTER_ENCRYPTION_KEY_MISSING",
    message:
      "Master encryption key is not configured. Set MASTER_ENCRYPTION_KEY (at least 32 chars or 64-char hex) in backend/.env."
  }
];

let dotenvLoaded = false;

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const looksLikePlaceholder = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    /^<.+>$/.test(normalized) ||
    normalized.includes("change-me") ||
    normalized.includes("changeme") ||
    normalized.includes("generate-with") ||
    normalized.includes("replace-with")
  );
};

const parseBooleanEnv = (name, fallback = false) => {
  const value = process.env[name];
  if (!isNonEmptyString(value)) {
    return fallback;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
};

const shouldRequireMongoAuth = () =>
  parseBooleanEnv("REQUIRE_MONGO_AUTH", process.env.NODE_ENV === "production");

const validateMongoUri = (mongoUri) => {
  const errors = [];

  if (!isNonEmptyString(mongoUri)) {
    return errors;
  }

  let parsed;
  try {
    parsed = new URL(mongoUri);
  } catch {
    return [
      {
        field: "MONGO_URI",
        code: "MONGO_URI_INVALID",
        message: "MONGO_URI must be a valid MongoDB connection string."
      }
    ];
  }

  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
    errors.push({
      field: "MONGO_URI",
      code: "MONGO_URI_INVALID_PROTOCOL",
      message: "MONGO_URI must use the mongodb:// or mongodb+srv:// protocol."
    });
  }

  if (shouldRequireMongoAuth() && (!parsed.username || !parsed.password)) {
    errors.push({
      field: "MONGO_URI",
      code: "MONGO_AUTH_REQUIRED",
      message:
        "MongoDB authentication is required. Set MONGO_URI to include an application username and password."
    });
  }

  if (shouldRequireMongoAuth() && parsed.username && parsed.username.toLowerCase() === "root") {
    errors.push({
      field: "MONGO_URI",
      code: "MONGO_ROOT_CREDENTIALS_NOT_ALLOWED",
      message: "MONGO_URI must use a dedicated application user, not the MongoDB root user."
    });
  }

  return errors;
};

const loadEnv = () => {
  if (!dotenvLoaded) {
    dotenv.config({ path: DOTENV_PATH });
    dotenvLoaded = true;
  }

  Object.entries(DEFAULT_ENV).forEach(([key, value]) => {
    if (!isNonEmptyString(process.env[key])) {
      process.env[key] = value;
    }
  });

  return process.env;
};

const getSpec = (name) => REQUIRED_ENV.find((spec) => spec.name === name);

const resolveEnvValue = (spec) => {
  const keys = [spec.name, ...(spec.aliases || [])];
  const matchedKey = keys.find((key) => isNonEmptyString(process.env[key]));

  if (!matchedKey) {
    return { value: "", source: spec.name };
  }

  const value = process.env[matchedKey].trim();
  if (matchedKey !== spec.name) {
    process.env[spec.name] = value;
  }

  return { value, source: matchedKey };
};

const validateRequiredEnv = () => {
  loadEnv();

  return REQUIRED_ENV.reduce((errors, spec) => {
    const { value, source } = resolveEnvValue(spec);

    if (!isNonEmptyString(value)) {
      errors.push({
        field: spec.name,
        code: spec.code,
        message: spec.message
      });
      return errors;
    }

    if (looksLikePlaceholder(value)) {
      errors.push({
        field: spec.name,
        source,
        code: `${spec.name}_PLACEHOLDER`,
        message: `${spec.name} still contains a placeholder value. Generate and configure a real secret.`
      });
      return errors;
    }

    if (value.length < spec.minLength) {
      errors.push({
        field: spec.name,
        source,
        code: `${spec.name}_TOO_SHORT`,
        message: `${spec.name} must be at least ${spec.minLength} characters long.`
      });
    }

    if (spec.name === "MONGO_URI") {
      errors.push(...validateMongoUri(value));
    }

    return errors;
  }, []);
};

const validateStartupEnv = () => {
  const errors = validateRequiredEnv();

  if (errors.length > 0) {
    throw new AppError(
      "Required backend environment variables are missing or invalid",
      500,
      "ENV_VALIDATION_FAILED",
      errors
    );
  }

  return process.env;
};

const getRequiredEnv = (name) => {
  loadEnv();
  const spec = getSpec(name);

  if (!spec) {
    const value = process.env[name];
    if (isNonEmptyString(value)) {
      return value.trim();
    }

    throw new AppError(`${name} is not configured`, 500, `${name}_MISSING`, [
      { field: name, message: `${name} is not configured` }
    ]);
  }

  const { value } = resolveEnvValue(spec);
  if (!isNonEmptyString(value)) {
    throw new AppError(spec.message, 500, spec.code, [
      { field: spec.name, message: spec.message }
    ]);
  }

  if (value.length < spec.minLength) {
    throw new AppError(
      `${spec.name} must be at least ${spec.minLength} characters long.`,
      500,
      `${spec.name}_TOO_SHORT`,
      [{ field: spec.name, message: `${spec.name} is too short` }]
    );
  }

  if (looksLikePlaceholder(value)) {
    throw new AppError(
      `${spec.name} still contains a placeholder value. Generate and configure a real secret.`,
      500,
      `${spec.name}_PLACEHOLDER`,
      [{ field: spec.name, message: `${spec.name} contains a placeholder value` }]
    );
  }

  return value;
};

loadEnv();

module.exports = {
  DEFAULT_ENV,
  DOTENV_PATH,
  REQUIRED_ENV,
  getRequiredEnv,
  loadEnv,
  shouldRequireMongoAuth,
  validateMongoUri,
  validateRequiredEnv,
  validateStartupEnv
};
