const User = require("../models/User");
const AuthSession = require("../models/AuthSession");
const SecurityEvent = require("../models/SecurityEvent");
const { getRequiredEnv } = require("../config/env");
const AppError = require("../utils/AppError");
const asyncHandler = require("../middleware/asyncHandler");
const { evaluatePasswordStrength } = require("../security/passwordPolicy");
const { buildSecurityError, SECURITY_ERROR_CODES } = require("../security/authErrors");
const { clearAuthCookies, REFRESH_TOKEN_COOKIE_NAME, setAuthCookies } = require("../security/cookieConfig");
const { getCookieValue } = require("../security/cookieParser");
const { clearCsrfCookie, setCsrfCookie } = require("../security/csrf");
const { logAuditEvent } = require("../services/auditLogService");
const {
  cleanupExpiredSessions,
  createAuthSession,
  listActiveSessionsForUser,
  revokeAllUserSessions,
  revokeAuthSession
} = require("../services/sessionService");
const {
  cleanupExpiredRefreshTokens,
  createInitialRefreshToken,
  parseRefreshToken,
  revokeOtherRefreshTokensForUser,
  revokeRefreshTokenFamily,
  revokeRefreshTokenForSession,
  rotateRefreshToken
} = require("../services/refreshTokenService");
const {
  assertLoginAllowed,
  assessLoginRisk,
  recordFailedLogin,
  recordSuccessfulLogin
} = require("../services/loginSecurityService");
const {
  generateMfaEnrollment,
  generateRecoveryCodes,
  verifyTotp,
  consumeRecoveryCode
} = require("../services/mfaService");
const {
  listTrustedDevices,
  registerOrUpdateDevice,
  revokeTrustedDevice,
  trustDevice
} = require("../services/deviceTrustService");
const { scoreRisk } = require("../services/authRiskService");
const { createSecurityEvent } = require("../services/securityEventService");
const { ELEVATED_ROLES } = require("../security/roles");
const logger = require("../utils/logger");

const sanitizeUser = (user) => {
  const serialized = typeof user.toJSON === "function" ? user.toJSON() : { ...user };
  delete serialized.password;
  return serialized;
};

const assertMfaGateCompleted = (req) => {
  if (req.authSession?.mfaRequired && !req.authSession?.mfaVerified) {
    throw buildSecurityError(SECURITY_ERROR_CODES.MFA_REQUIRED, [
      {
        field: "mfa",
        message: "Complete MFA verification before performing this action."
      }
    ]);
  }
};

const getJwtSecret = () => {
  return getRequiredEnv("JWT_SECRET");
};

const elevatedRoles = new Set(ELEVATED_ROLES);

const createSessionToken = (user, req, options = {}) =>
  createAuthSession({
    user,
    req,
    jwtSecret: getJwtSecret(),
    ...options
  });

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role, adminRegistrationKey } = req.body;
  if (process.env.NODE_ENV !== "production") {
    logger.info("Register request received", {
      email,
      role,
      hasAdminRegistrationKey: Boolean(adminRegistrationKey),
      hasHeaderKey: Boolean(req.headers["x-admin-registration-key"])
    });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("Email already registered", 400, "EMAIL_ALREADY_REGISTERED", [
      { field: "email", message: "Email already registered" }
    ]);
  }

  let resolvedRole = "user";
  if (elevatedRoles.has(role)) {
    const configuredAdminKey = getRequiredEnv("ADMIN_REGISTRATION_KEY");
    const providedKey = req.headers["x-admin-registration-key"] || adminRegistrationKey;
    if (providedKey !== configuredAdminKey) {
      await logAuditEvent({
        req,
        eventType: "SUSPICIOUS_AUTH",
        outcome: "BLOCKED",
        severity: "HIGH",
        actorEmail: email,
        metadata: { reason: "ELEVATED_ROLE_REGISTRATION_KEY_INVALID", requestedRole: role }
      });
      throw new AppError("Admin registration key is invalid", 403, "ADMIN_KEY_INVALID");
    }

    resolvedRole = role;
  }

  let user;
  try {
    user = await User.create({
      name,
      email,
      password,
      role: resolvedRole
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError("Email already registered", 400, "EMAIL_ALREADY_REGISTERED", [
        { field: "email", message: "Email already registered" }
      ]);
    }

    throw error;
  }

  await cleanupExpiredSessions({ userId: user._id });
  await cleanupExpiredRefreshTokens({ userId: user._id });
  const deviceContext = await registerOrUpdateDevice({ req, user });
  const { token, session } = await createSessionToken(user, req, {
    device: deviceContext.device,
    mfaRequired: false,
    mfaVerified: true,
    riskScore: 0,
    riskLevel: "LOW"
  });
  const refresh = await createInitialRefreshToken({ user, session, req });
  setAuthCookies(res, {
    accessToken: token,
    refreshToken: refresh.refreshToken
  });
  setCsrfCookie(res);
  await logAuditEvent({
    req,
    eventType: "LOGIN_SUCCESS",
    outcome: "SUCCESS",
    severity: resolvedRole === "user" ? "LOW" : "MEDIUM",
    actorUserId: user._id,
    actorEmail: user.email,
    sessionId: session._id,
    tokenId: session.tokenId,
    metadata: { reason: "REGISTRATION_LOGIN", role: resolvedRole }
  });

  return res.status(201).json({
    success: true,
    message: "User registered successfully",
    token,
    user: sanitizeUser(user)
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (process.env.NODE_ENV !== "production") {
    logger.info("Login request received", {
      email,
      hasPassword: Boolean(password)
    });
  }
  const user = await User.findOne({ email }).select("+password");

  try {
    await assertLoginAllowed({ user, email, req });
  } catch (error) {
    await logAuditEvent({
      req,
      eventType: "LOGIN_BLOCKED",
      outcome: "BLOCKED",
      severity: error.code === SECURITY_ERROR_CODES.ACCOUNT_LOCKED ? "HIGH" : "MEDIUM",
      actorUserId: user?._id,
      actorEmail: email,
      metadata: {
        reason: error.code,
        details: error.details
      }
    });
    throw error;
  }

  if (!user || !(await user.comparePassword(password))) {
    const failure = await recordFailedLogin({
      user,
      email,
      req,
      reason: user ? "BAD_PASSWORD" : "UNKNOWN_EMAIL"
    });
    await logAuditEvent({
      req,
      eventType: "LOGIN_FAILED",
      outcome: "FAILURE",
      severity: failure.accountLockedUntil || failure.throttleLockedUntil ? "HIGH" : "LOW",
      actorUserId: user?._id,
      actorEmail: email,
      metadata: {
        reason: user ? "BAD_PASSWORD" : "UNKNOWN_EMAIL",
        accountLockedUntil: failure.accountLockedUntil,
        throttleLockedUntil: failure.throttleLockedUntil
      }
    });

    if (failure.accountLockedUntil) {
      await logAuditEvent({
        req,
        eventType: "LOGIN_BLOCKED",
        outcome: "BLOCKED",
        severity: "HIGH",
        actorUserId: user?._id,
        actorEmail: email,
        metadata: {
          reason: SECURITY_ERROR_CODES.ACCOUNT_LOCKED,
          lockedUntil: failure.accountLockedUntil
        }
      });
      throw buildSecurityError(SECURITY_ERROR_CODES.ACCOUNT_LOCKED, [
        {
          field: "account",
          message: "Account is temporarily locked because of repeated failed login attempts.",
          lockedUntil: failure.accountLockedUntil
        }
      ]);
    }

    if (failure.throttleLockedUntil) {
      throw buildSecurityError(SECURITY_ERROR_CODES.TOO_MANY_ATTEMPTS, [
        {
          field: "login",
          message: "Login throttle is active after repeated failed attempts.",
          lockedUntil: failure.throttleLockedUntil
        }
      ]);
    }

    throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }

  const loginRisk = assessLoginRisk({ user, req });
  req.loginRisk = loginRisk;
  await cleanupExpiredSessions({ userId: user._id });
  await cleanupExpiredRefreshTokens({ userId: user._id });
  const deviceContext = await registerOrUpdateDevice({ req, user });
  const authRisk = scoreRisk({ user, loginRisk, deviceContext, req });

  if (authRisk.blockSession) {
    await createSecurityEvent({
      req,
      eventType: "ACCOUNT_TAKEOVER_SUSPECTED",
      severity: "CRITICAL",
      userId: user._id,
      deviceId: deviceContext.device?.deviceId,
      riskScore: authRisk.riskScore,
      riskLevel: authRisk.riskLevel,
      metadata: {
        signals: authRisk.signals
      }
    });
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      {
        field: "session",
        message: "High-risk authentication attempt blocked."
      }
    ], {
      statusCode: 403,
      message: "High-risk authentication attempt blocked"
    });
  }

  const mfaRequired = Boolean(user.mfaEnabled || authRisk.requireMfa);
  const mfaSetupRequired = Boolean(mfaRequired && !user.mfaEnabled);
  const { token, session } = await createSessionToken(user, req, {
    device: deviceContext.device,
    mfaRequired,
    mfaVerified: !mfaRequired,
    riskScore: authRisk.riskScore,
    riskLevel: authRisk.riskLevel
  });
  const refresh = await createInitialRefreshToken({ user, session, req });
  if (process.env.NODE_ENV !== "production") {
    logger.info("Login issued tokens", {
      userId: user._id,
      sessionId: session._id,
      tokenId: session.tokenId,
      refreshFamilyId: refresh.familyId
    });
  }
  setAuthCookies(res, {
    accessToken: token,
    refreshToken: refresh.refreshToken
  });
  setCsrfCookie(res);
  await recordSuccessfulLogin({ user, req, risk: loginRisk });
  await logAuditEvent({
    req,
    eventType: "LOGIN_SUCCESS",
    outcome: "SUCCESS",
    severity: loginRisk.suspicious ? "MEDIUM" : "LOW",
    actorUserId: user._id,
    actorEmail: user.email,
    sessionId: session._id,
    tokenId: session.tokenId,
    metadata: {
      suspicious: loginRisk.suspicious,
      flags: loginRisk.flags,
      authRisk,
      mfaRequired,
      mfaSetupRequired
    }
  });

  if (loginRisk.suspicious) {
    await logAuditEvent({
      req,
      eventType: "SUSPICIOUS_AUTH",
      outcome: "SUCCESS",
      severity: loginRisk.flags.includes("IMPOSSIBLE_LOGIN_BEHAVIOR") ? "HIGH" : "MEDIUM",
      actorUserId: user._id,
      actorEmail: user.email,
      sessionId: session._id,
      tokenId: session.tokenId,
      metadata: {
        flags: loginRisk.flags,
        ipAddress: loginRisk.ipAddress
      }
    });
  }

  return res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: sanitizeUser(user),
    mfaRequired,
    mfaSetupRequired,
    riskLevel: authRisk.riskLevel
  });
});

exports.me = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    user: sanitizeUser(req.user)
  });
});

exports.logout = asyncHandler(async (req, res) => {
  if (req.authSession) {
    await Promise.all([
      revokeAuthSession({
        sessionId: req.authSession?._id,
        userId: req.user?._id,
        tokenId: req.authTokenId,
        reason: "USER_LOGOUT"
      }),
      revokeRefreshTokenForSession({
        session: req.authSession,
        reason: "USER_LOGOUT"
      })
    ]);
  } else {
    const refreshToken = getCookieValue(req, REFRESH_TOKEN_COOKIE_NAME);
    const parsedRefreshToken = parseRefreshToken(refreshToken);
    if (parsedRefreshToken?.familyId) {
      await revokeRefreshTokenFamily({
        familyId: parsedRefreshToken.familyId,
        reason: "USER_LOGOUT"
      });
    }
  }

  clearAuthCookies(res);
  clearCsrfCookie(res);
  await logAuditEvent({
    req,
    eventType: "LOGOUT",
    outcome: "SUCCESS",
    severity: "LOW",
    actorUserId: req.user?._id,
    actorEmail: req.user?.email,
    metadata: { reason: "USER_LOGOUT" }
  });

  return res.status(200).json({
    success: true,
    message: "Logout successful"
  });
});

exports.logoutAll = asyncHandler(async (req, res) => {
  await Promise.all([
    revokeAllUserSessions({
      userId: req.user._id,
      exceptSessionId: req.authSession?._id,
      reason: "USER_LOGOUT_ALL"
    }),
    revokeOtherRefreshTokensForUser({
      userId: req.user._id,
      exceptFamilyId: req.authSession?.refreshTokenFamilyId,
      reason: "USER_LOGOUT_ALL"
    })
  ]);
  await logAuditEvent({
    req,
    eventType: "SESSION_REVOKED",
    outcome: "SUCCESS",
    severity: "MEDIUM",
    actorUserId: req.user._id,
    actorEmail: req.user.email,
    metadata: { reason: "USER_LOGOUT_ALL" }
  });

  return res.status(200).json({
    success: true,
    message: "All other sessions were revoked"
  });
});

exports.sessions = asyncHandler(async (req, res) => {
  const sessions = await listActiveSessionsForUser(req.user._id);

  return res.status(200).json({
    success: true,
    sessions
  });
});

exports.passwordStrength = asyncHandler(async (req, res) => {
  const strength = evaluatePasswordStrength(req.body?.password);

  return res.status(200).json({
    success: true,
    passwordStrength: strength
  });
});

exports.startMfaEnrollment = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("mfaEnabled");
  if (user?.mfaEnabled) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      {
        field: "mfa",
        message: "MFA is already enabled. Disable it before starting a new enrollment."
      }
    ], {
      statusCode: 409,
      message: "MFA is already enabled"
    });
  }

  const enrollment = await generateMfaEnrollment(req.user);

  return res.status(200).json({
    success: true,
    message: "MFA enrollment started",
    enrollment
  });
});

exports.verifyMfaEnrollment = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+mfaPendingSecretEncrypted mfaEnabled");
  if (user?.mfaEnabled) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      {
        field: "mfa",
        message: "MFA is already enabled for this account."
      }
    ], {
      statusCode: 409,
      message: "MFA is already enabled"
    });
  }

  if (!user?.mfaPendingSecretEncrypted || !verifyTotp({ encryptedSecret: user.mfaPendingSecretEncrypted, token: req.body?.token })) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "MFA verification code is invalid." }
    ]);
  }

  const recovery = await generateRecoveryCodes();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        mfaEnabled: true,
        mfaSecretEncrypted: user.mfaPendingSecretEncrypted,
        recoveryCodes: recovery.hashed,
        lastSuccessfulMfa: new Date(),
        mfaFailedAttempts: 0,
        mfaLockedUntil: null
      },
      $unset: { mfaPendingSecretEncrypted: "" }
    }
  );

  await AuthSession.updateOne(
    { _id: req.authSession._id, userId: user._id },
    {
      $set: {
        mfaRequired: true,
        mfaVerified: true,
        mfaVerifiedAt: new Date()
      }
    }
  );

  if (req.body?.trustDevice && req.authSession?.deviceId) {
    await trustDevice({ req, userId: user._id, deviceId: req.authSession.deviceId });
  }

  await createSecurityEvent({
    req,
    eventType: "MFA_ENABLED",
    severity: "LOW",
    userId: user._id,
    sessionId: req.authSession?._id,
    deviceId: req.authSession?.deviceId
  });

  return res.status(200).json({
    success: true,
    message: "MFA enabled successfully",
    recoveryCodes: recovery.codes
  });
});

exports.verifyMfaLogin = asyncHandler(async (req, res) => {
  if (!req.authSession?.mfaRequired) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      {
        field: "mfa",
        message: "This session does not require MFA verification."
      }
    ], {
      statusCode: 400,
      message: "MFA verification is not required for this session"
    });
  }

  const user = await User.findById(req.user._id).select("+mfaSecretEncrypted +recoveryCodes mfaEnabled");
  if (!user?.mfaEnabled) {
    throw buildSecurityError(SECURITY_ERROR_CODES.MFA_REQUIRED, [
      {
        field: "mfa",
        message: "MFA is not configured. Complete MFA enrollment before verifying login."
      }
    ], {
      message: "MFA setup required"
    });
  }

  const lockedUntil = user?.mfaLockedUntil ? new Date(user.mfaLockedUntil) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    throw buildSecurityError(SECURITY_ERROR_CODES.TOO_MANY_ATTEMPTS, [
      { field: "mfa", message: "Too many failed MFA attempts.", lockedUntil }
    ]);
  }

  const tokenValid = user?.mfaSecretEncrypted
    ? verifyTotp({ encryptedSecret: user.mfaSecretEncrypted, token: req.body?.token })
    : false;
  const recoveryCodeUsed =
    !tokenValid && req.body?.recoveryCode
      ? await consumeRecoveryCode({ user, code: req.body.recoveryCode })
      : false;

  if (!tokenValid && !recoveryCodeUsed) {
    const failedAttempts = (user?.mfaFailedAttempts || 0) + 1;
    const lockedAtThreshold = failedAttempts >= 5;
    const lockedUntilNext = lockedAtThreshold ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          mfaFailedAttempts: lockedAtThreshold ? 0 : failedAttempts,
          mfaLockedUntil: lockedUntilNext
        }
      }
    );
    await createSecurityEvent({
      req,
      eventType: "MFA_BYPASS_ATTEMPT",
      severity: lockedAtThreshold ? "HIGH" : "MEDIUM",
      userId: req.user._id,
      sessionId: req.authSession?._id,
      deviceId: req.authSession?.deviceId,
      riskScore: lockedAtThreshold ? 80 : 50,
      riskLevel: lockedAtThreshold ? "HIGH" : "MEDIUM"
    });
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "MFA verification code is invalid." }
    ]);
  }

  await Promise.all([
    AuthSession.updateOne(
      { _id: req.authSession._id, userId: req.user._id },
      {
        $set: {
          mfaVerified: true,
          mfaVerifiedAt: new Date(),
          lastSeenAt: new Date()
        }
      }
    ),
    User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          lastSuccessfulMfa: new Date(),
          mfaFailedAttempts: 0,
          mfaLockedUntil: null
        }
      }
    )
  ]);

  if (req.body?.trustDevice && req.authSession?.deviceId) {
    await trustDevice({ req, userId: req.user._id, deviceId: req.authSession.deviceId });
  }

  if (recoveryCodeUsed) {
    await createSecurityEvent({
      req,
      eventType: "RECOVERY_CODE_USED",
      severity: "MEDIUM",
      userId: req.user._id,
      sessionId: req.authSession?._id,
      deviceId: req.authSession?.deviceId
    });
  }

  return res.status(200).json({
    success: true,
    message: "MFA verified successfully",
    user: sanitizeUser(req.user)
  });
});

exports.disableMfa = asyncHandler(async (req, res) => {
  assertMfaGateCompleted(req);

  const user = await User.findById(req.user._id).select("+mfaSecretEncrypted mfaEnabled");
  if (!user?.mfaEnabled) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "mfa", message: "MFA is not enabled for this account." }
    ], {
      statusCode: 400,
      message: "MFA is not enabled"
    });
  }

  if (!user?.mfaSecretEncrypted || !verifyTotp({ encryptedSecret: user.mfaSecretEncrypted, token: req.body?.token })) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "MFA verification code is invalid." }
    ]);
  }

  await User.updateOne(
    { _id: req.user._id },
    {
      $set: {
        mfaEnabled: false,
        recoveryCodes: [],
        mfaFailedAttempts: 0,
        mfaLockedUntil: null
      },
      $unset: {
        mfaSecretEncrypted: "",
        mfaPendingSecretEncrypted: ""
      }
    }
  );
  await AuthSession.updateOne(
    { _id: req.authSession._id, userId: req.user._id },
    {
      $set: {
        mfaRequired: false,
        mfaVerified: true,
        mfaVerifiedAt: new Date()
      }
    }
  );
  await createSecurityEvent({
    req,
    eventType: "MFA_DISABLED",
    severity: "MEDIUM",
    userId: req.user._id,
    sessionId: req.authSession?._id,
    deviceId: req.authSession?.deviceId
  });

  return res.status(200).json({
    success: true,
    message: "MFA disabled successfully"
  });
});

exports.regenerateRecoveryCodes = asyncHandler(async (req, res) => {
  assertMfaGateCompleted(req);

  const user = await User.findById(req.user._id).select("+mfaSecretEncrypted mfaEnabled");
  if (!user?.mfaEnabled) {
    throw buildSecurityError(SECURITY_ERROR_CODES.MFA_REQUIRED, [
      { field: "mfa", message: "MFA must be enabled before regenerating recovery codes." }
    ]);
  }

  if (!user?.mfaSecretEncrypted || !verifyTotp({ encryptedSecret: user.mfaSecretEncrypted, token: req.body?.token })) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "token", message: "MFA verification code is invalid." }
    ]);
  }

  const recovery = await generateRecoveryCodes();
  await User.updateOne(
    { _id: req.user._id },
    {
      $set: {
        recoveryCodes: recovery.hashed
      }
    }
  );

  await logAuditEvent({
    req,
    eventType: "RECOVERY_CODE_USED",
    outcome: "SUCCESS",
    severity: "MEDIUM",
    actorUserId: req.user._id,
    actorEmail: req.user.email,
    sessionId: req.authSession?._id,
    metadata: { action: "RECOVERY_CODES_REGENERATED" }
  });

  return res.status(200).json({
    success: true,
    message: "Recovery codes regenerated",
    recoveryCodes: recovery.codes
  });
});

exports.getTrustedDevices = asyncHandler(async (req, res) => {
  const devices = await listTrustedDevices(req.user._id);
  return res.status(200).json({ success: true, devices });
});

exports.approveTrustedDevice = asyncHandler(async (req, res) => {
  const device = await trustDevice({ req, userId: req.user._id, deviceId: req.params.deviceId });
  if (!device) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "deviceId", message: "Device was not found." }
    ], { statusCode: 404, message: "Device not found" });
  }

  return res.status(200).json({ success: true, device });
});

exports.revokeDevice = asyncHandler(async (req, res) => {
  const device = await revokeTrustedDevice({ req, userId: req.user._id, deviceId: req.params.deviceId });
  if (!device) {
    throw buildSecurityError(SECURITY_ERROR_CODES.INVALID_TOKEN, [
      { field: "deviceId", message: "Device was not found." }
    ], { statusCode: 404, message: "Device not found" });
  }

  return res.status(200).json({ success: true, device });
});

exports.getSecurityEvents = asyncHandler(async (req, res) => {
  const events = await SecurityEvent.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  return res.status(200).json({ success: true, events });
});

exports.refresh = asyncHandler(async (req, res) => {
  if (req.body?.refreshToken || req.query?.refreshToken) {
    throw new AppError(
      "Refresh token must be provided through the HTTP-only cookie",
      400,
      "REFRESH_TOKEN_MUST_USE_COOKIE",
      [{ field: "refreshToken", message: "Refresh token must be provided through the HTTP-only cookie." }]
    );
  }

  const refreshToken = getCookieValue(req, REFRESH_TOKEN_COOKIE_NAME);
  if (process.env.NODE_ENV !== "production") {
    logger.info("Refresh request received", {
      path: req.originalUrl,
      hasRefreshCookie: Boolean(refreshToken),
      hasBodyRefreshToken: Boolean(req.body?.refreshToken),
      hasQueryRefreshToken: Boolean(req.query?.refreshToken)
    });
  }

  if (!refreshToken) {
    clearAuthCookies(res);
    throw buildSecurityError(SECURITY_ERROR_CODES.SESSION_EXPIRED, [
      {
        field: "refreshToken",
        message: "Refresh token cookie is required."
      }
    ]);
  }

  try {
    const rotated = await rotateRefreshToken({
      refreshToken,
      req,
      jwtSecret: getJwtSecret()
    });
    if (process.env.NODE_ENV !== "production") {
      logger.info("Refresh token rotated", {
        userId: rotated.user?._id,
        sessionId: rotated.session?._id,
        accessTokenId: rotated.accessTokenId,
        refreshTokenId: rotated.refreshTokenId
      });
    }
    setAuthCookies(res, {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken
    });
    setCsrfCookie(res);

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
      token: rotated.accessToken,
      user: sanitizeUser(rotated.user)
    });
  } catch (error) {
    clearAuthCookies(res);
    await logAuditEvent({
      req,
      eventType: "TOKEN_FAILURE",
      outcome: "FAILURE",
      severity: error.code === SECURITY_ERROR_CODES.SESSION_EXPIRED ? "LOW" : "HIGH",
      metadata: {
        reason: error.code || "REFRESH_FAILED",
        message: error.message
      }
    });
    throw error;
  }
});
