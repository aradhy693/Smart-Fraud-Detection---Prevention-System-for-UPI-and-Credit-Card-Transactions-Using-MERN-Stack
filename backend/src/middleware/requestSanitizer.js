const sanitizeObject = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }

  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }

  return Object.entries(value).reduce((clean, [key, nestedValue]) => {
    if (key.startsWith("$") || key.includes(".")) {
      return clean;
    }

    clean[key] = sanitizeObject(nestedValue);
    return clean;
  }, {});
};

const requestSanitizer = (req, res, next) => {
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);
  next();
};

module.exports = requestSanitizer;
