const express = require("express");
const {
  login,
  logout,
  logoutAll,
  me,
  approveTrustedDevice,
  disableMfa,
  getSecurityEvents,
  getTrustedDevices,
  passwordStrength,
  refresh,
  regenerateRecoveryCodes,
  register,
  revokeDevice,
  sessions,
  startMfaEnrollment,
  verifyMfaEnrollment,
  verifyMfaLogin
} = require("../controllers/authController");
const { optionalProtect, protect } = require("../middleware/authMiddleware");
const {
  requireTrustedOrigin,
  suspiciousLoginDetection,
  tokenAnomalyDetection
} = require("../middleware/authSecurityMiddleware");
const { authRateLimiter } = require("../middleware/rateLimitMiddleware");
const validatePasswordPolicy = require("../middleware/passwordPolicyMiddleware");
const validate = require("../middleware/validateMiddleware");
const { validateLoginPayload, validateRegisterPayload } = require("../validators/schemas");

const router = express.Router();

router.post("/password-strength", authRateLimiter, passwordStrength);
router.post(
  "/register",
  authRateLimiter,
  validatePasswordPolicy("password"),
  validate(validateRegisterPayload),
  register
);
router.post(
  "/login",
  authRateLimiter,
  suspiciousLoginDetection,
  validate(validateLoginPayload),
  login
);
router.get("/me", protect, tokenAnomalyDetection, me);
router.get("/sessions", protect, tokenAnomalyDetection, sessions);
router.post("/refresh", authRateLimiter, requireTrustedOrigin, refresh);
router.post("/logout", optionalProtect, requireTrustedOrigin, tokenAnomalyDetection, logout);
router.post("/logout-all", protect, tokenAnomalyDetection, logoutAll);
router.post("/mfa/enroll", protect, tokenAnomalyDetection, startMfaEnrollment);
router.post("/mfa/verify-enrollment", protect, tokenAnomalyDetection, verifyMfaEnrollment);
router.post("/mfa/verify-login", protect, tokenAnomalyDetection, verifyMfaLogin);
router.post("/mfa/disable", protect, tokenAnomalyDetection, disableMfa);
router.post("/mfa/recovery-codes", protect, tokenAnomalyDetection, regenerateRecoveryCodes);
router.get("/devices", protect, tokenAnomalyDetection, getTrustedDevices);
router.post("/devices/:deviceId/trust", protect, tokenAnomalyDetection, approveTrustedDevice);
router.patch("/devices/:deviceId/revoke", protect, tokenAnomalyDetection, revokeDevice);
router.get("/security-events", protect, tokenAnomalyDetection, getSecurityEvents);

module.exports = router;
