const logger = require("../utils/logger");

const formatMongooseValidationError = (error) =>
  Object.values(error.errors || {}).map((fieldError) => ({
    field: fieldError.path,
    message: fieldError.message
  }));

const normalizeError = (err, fallbackStatusCode = 500) => {
  if (err.name === "ValidationError") {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: formatMongooseValidationError(err)
    };
  }

  if (err.name === "CastError") {
    return {
      statusCode: 400,
      code: "INVALID_IDENTIFIER",
      message: `Invalid ${err.path || "identifier"}`,
      details: [{ field: err.path || "id", message: err.message }]
    };
  }

  if (err.code === 11000) {
    return {
      statusCode: 400,
      code: "DUPLICATE_RESOURCE",
      message: "A resource with the same unique value already exists",
      details: Object.keys(err.keyValue || {}).map((field) => ({
        field,
        message: `${field} must be unique`
      }))
    };
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return {
      statusCode: 401,
      code: "INVALID_TOKEN",
      message: "Invalid or expired token",
      details: null
    };
  }

  if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, "body")) {
    return {
      statusCode: 400,
      code: "INVALID_JSON",
      message: "Request body contains invalid JSON",
      details: null
    };
  }

  const statusCode = err.statusCode || fallbackStatusCode;

  return {
    statusCode,
    code: err.code || (statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR"),
    message: err.message || "Internal Server Error",
    details: err.details || null
  };
};

const errorHandler = (err, req, res, _next) => {
  const fallbackStatusCode =
    res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  const normalized = normalizeError(err, fallbackStatusCode);

  logger.error("Request failed", {
    method: req.method,
    path: req.originalUrl,
    statusCode: normalized.statusCode,
    code: normalized.code,
    message: normalized.message,
    stack: err.stack
  });

  res.status(normalized.statusCode).json({
    success: false,
    message: normalized.message,
    error: {
      code: normalized.code,
      statusCode: normalized.statusCode,
      details: normalized.details
    },
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
};

module.exports = errorHandler;
