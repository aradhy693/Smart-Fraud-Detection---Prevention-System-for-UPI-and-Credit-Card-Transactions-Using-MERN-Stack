const redactSensitiveFields = (value) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }

  return Object.entries(value).reduce((clean, [key, nestedValue]) => {
    if (/password|token|secret|authorization/i.test(key)) {
      clean[key] = "[REDACTED]";
      return clean;
    }

    clean[key] = redactSensitiveFields(nestedValue);
    return clean;
  }, {});
};

const write = (level, message, meta) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString()
  };

  if (meta !== undefined) {
    payload.meta = redactSensitiveFields(meta);
  }

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
};

const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta)
};

module.exports = logger;
