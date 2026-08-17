const { ALL_ROLES } = require("../security/roles");

const allowedPaymentMethods = new Set(["UPI", "CREDIT_CARD", "CARD"]);
const allowedAlertStatuses = new Set(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]);
const allowedRoles = new Set(ALL_ROLES);

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

const validationResult = (value, errors) => {
  if (errors.length > 0) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: errors
      },
      value: null
    };
  }

  return { error: null, value };
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validateRegisterPayload = (body) => {
  const errors = [];
  const source = isPlainObject(body) ? body : {};

  const name = asTrimmedString(source.name || source.fullName);
  const email = asTrimmedString(source.email).toLowerCase();
  const password = typeof source.password === "string" ? source.password : "";
  const role = source.role ? asTrimmedString(source.role).toLowerCase() : "user";
  const adminRegistrationKey = asTrimmedString(source.adminRegistrationKey);

  if (name.length < 2 || name.length > 100) {
    errors.push({ field: "name", message: "Name must be between 2 and 100 characters" });
  }

  if (!validateEmail(email)) {
    errors.push({ field: "email", message: "A valid email address is required" });
  }

  if (password.length < 12 || password.length > 128) {
    errors.push({ field: "password", message: "Password must be between 12 and 128 characters" });
  }

  if (!allowedRoles.has(role)) {
    errors.push({
      field: "role",
      message: `Role must be one of: ${ALL_ROLES.join(", ")}`
    });
  }

  return validationResult({ name, email, password, role, adminRegistrationKey }, errors);
};

const validateLoginPayload = (body) => {
  const errors = [];
  const source = isPlainObject(body) ? body : {};
  const email = asTrimmedString(source.email).toLowerCase();
  const password = typeof source.password === "string" ? source.password : "";

  if (!validateEmail(email)) {
    errors.push({ field: "email", message: "A valid email address is required" });
  }

  if (!password) {
    errors.push({ field: "password", message: "Password is required" });
  }

  return validationResult({ email, password }, errors);
};

const validateTransactionPayload = (body) => {
  const errors = [];
  const source = isPlainObject(body) ? body : {};
  const amount = Number(source.amount);
  const rawPaymentMethod = asTrimmedString(source.paymentMethod || source.paymentType).toUpperCase();
  const paymentMethod = rawPaymentMethod === "CARD" ? "CREDIT_CARD" : rawPaymentMethod;
  const identifier = asTrimmedString(source.identifier || source.upiId || source.cardToken);
  const deviceId = asTrimmedString(source.deviceId);
  const value = {
    amount,
    paymentMethod,
    identifier,
    deviceId
  };

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push({ field: "amount", message: "Amount must be a positive number" });
  }

  if (Number.isFinite(amount) && amount > 10000000) {
    errors.push({ field: "amount", message: "Amount exceeds the maximum supported transaction limit" });
  }

  if (!allowedPaymentMethods.has(rawPaymentMethod)) {
    errors.push({ field: "paymentMethod", message: "Payment method must be UPI or CREDIT_CARD" });
  }

  if (identifier.length < 3 || identifier.length > 150) {
    errors.push({ field: "identifier", message: "Identifier must be between 3 and 150 characters" });
  }

  const compactIdentifier = identifier.replace(/[\s-]/g, "");
  if (/^\d{13,19}$/.test(compactIdentifier)) {
    errors.push({
      field: "identifier",
      message: "Use a tokenized or masked card identifier instead of a raw card number"
    });
  }

  if (deviceId.length < 3 || deviceId.length > 128) {
    errors.push({ field: "deviceId", message: "Device ID must be between 3 and 128 characters" });
  }

  if (source.ipAddress !== undefined) {
    errors.push({
      field: "ipAddress",
      message: "IP address is derived server-side and must not be supplied in the request body"
    });
  }

  if (source.location !== undefined) {
    if (!isPlainObject(source.location)) {
      errors.push({ field: "location", message: "Location must be an object when provided" });
    } else {
      const latitude = Number(source.location.latitude);
      const longitude = Number(source.location.longitude);
      const city = asTrimmedString(source.location.city) || "Unknown";
      const country = asTrimmedString(source.location.country) || "Unknown";

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        errors.push({ field: "location.latitude", message: "Latitude must be between -90 and 90" });
      }

      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        errors.push({ field: "location.longitude", message: "Longitude must be between -180 and 180" });
      }

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        value.location = { latitude, longitude, city, country };
      }
    }
  }

  return validationResult(value, errors);
};

const validateAlertStatusPayload = (body) => {
  const errors = [];
  const source = isPlainObject(body) ? body : {};
  const status = asTrimmedString(source.status).toUpperCase();

  if (!allowedAlertStatuses.has(status)) {
    errors.push({
      field: "status",
      message: "Status must be OPEN, REVIEWING, RESOLVED, or DISMISSED"
    });
  }

  return validationResult({ status }, errors);
};

module.exports = {
  validateAlertStatusPayload,
  validateLoginPayload,
  validateRegisterPayload,
  validateTransactionPayload
};
