const crypto = require("crypto");
const LoginThrottle = require("../models/LoginThrottle");
const User = require("../models/User");
const { buildSecurityError, SECURITY_ERROR_CODES } = require("../security/authErrors");
const { getClientIp, isPrivateIpAddress } = require("../utils/network");
const { getUserAgent } = require("./sessionService");

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const getConfig = () => ({
  threshold: parsePositiveInteger(process.env.LOGIN_FAILURE_THRESHOLD, 5),
  lockoutBaseMs: parsePositiveInteger(process.env.LOGIN_LOCKOUT_BASE_MS, 15 * 60 * 1000),
  lockoutMaxMs: parsePositiveInteger(process.env.LOGIN_LOCKOUT_MAX_MS, 24 * 60 * 60 * 1000),
  throttleResetMs: parsePositiveInteger(process.env.LOGIN_THROTTLE_RESET_MS, 60 * 60 * 1000),
  impossibleLoginWindowMs: parsePositiveInteger(
    process.env.IMPOSSIBLE_LOGIN_WINDOW_MS,
    10 * 60 * 1000
  )
});

const hashKey = (scope, value) =>
  `${scope}:${crypto.createHash("sha256").update(String(value).toLowerCase()).digest("hex")}`;

const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : "");

const calculateLockUntil = (offenseCount, now = new Date()) => {
  const { lockoutBaseMs, lockoutMaxMs } = getConfig();
  const progressiveMs = lockoutBaseMs * 2 ** Math.max(offenseCount - 1, 0);
  return new Date(now.getTime() + Math.min(progressiveMs, lockoutMaxMs));
};

const isLocked = (lockUntil) => Boolean(lockUntil && new Date(lockUntil).getTime() > Date.now());

const getThrottleStatus = async ({ email, ipAddress }) => {
  const normalizedEmail = normalizeEmail(email);
  const throttleKeys = [
    { scope: "ip", value: ipAddress },
    normalizedEmail ? { scope: "user", value: normalizedEmail } : null
  ].filter(Boolean);

  const records = await Promise.all(
    throttleKeys.map((entry) => LoginThrottle.findOne({ key: hashKey(entry.scope, entry.value) }))
  );

  const lockedRecord = records.find((record) => isLocked(record?.lockUntil));
  if (!lockedRecord) {
    return { blocked: false, records };
  }

  return {
    blocked: true,
    lockedUntil: lockedRecord.lockUntil,
    scope: lockedRecord.scope,
    records
  };
};

const assertLoginAllowed = async ({ user, email, req }) => {
  const ipAddress = getClientIp(req);
  const throttleStatus = await getThrottleStatus({ email, ipAddress });

  if (throttleStatus.blocked) {
    throw buildSecurityError(SECURITY_ERROR_CODES.TOO_MANY_ATTEMPTS, [
      {
        field: throttleStatus.scope,
        message: `${throttleStatus.scope} login throttle is active.`,
        lockedUntil: throttleStatus.lockedUntil
      }
    ]);
  }

  if (user?.accountLockedUntil && isLocked(user.accountLockedUntil)) {
    throw buildSecurityError(SECURITY_ERROR_CODES.ACCOUNT_LOCKED, [
      {
        field: "account",
        message: "Account is temporarily locked because of repeated failed login attempts.",
        lockedUntil: user.accountLockedUntil
      }
    ]);
  }
};

const resetStaleAttempts = (record, now) => {
  if (!record?.lastAttemptAt) {
    return record;
  }

  const { throttleResetMs } = getConfig();
  if (now.getTime() - new Date(record.lastAttemptAt).getTime() <= throttleResetMs) {
    return record;
  }

  return {
    ...record,
    attempts: 0,
    firstAttemptAt: now,
    lockUntil: null
  };
};

const findThrottleLean = async (filter) => {
  const query = LoginThrottle.findOne(filter);
  if (query && typeof query.lean === "function") {
    return query.lean();
  }

  return query;
};

const recordThrottleFailure = async ({ scope, value, email, ipAddress, reason }) => {
  const now = new Date();
  const key = hashKey(scope, value);
  const existingRecord = await findThrottleLean({ key });
  const current = resetStaleAttempts(existingRecord || {}, now);
  const attempts = (current.attempts || 0) + 1;
  const { threshold } = getConfig();
  const shouldLock = attempts >= threshold;
  const offenseCount = shouldLock ? (current.offenseCount || 0) + 1 : current.offenseCount || 0;
  const lockUntil = shouldLock ? calculateLockUntil(offenseCount, now) : current.lockUntil || null;

  await LoginThrottle.findOneAndUpdate(
    { key },
    {
      $set: {
        scope,
        email: email || current.email,
        ipAddress: ipAddress || current.ipAddress,
        attempts: shouldLock ? 0 : attempts,
        offenseCount,
        lockUntil,
        firstAttemptAt: current.firstAttemptAt || now,
        lastAttemptAt: now,
        lastFailureReason: reason
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { locked: shouldLock, lockUntil, offenseCount };
};

const recordUserFailure = async ({ user }) => {
  if (!user?._id) {
    return { locked: false };
  }

  const now = new Date();
  const { threshold } = getConfig();
  const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  const shouldLock = failedLoginAttempts >= threshold;
  const accountLockoutCount = shouldLock ? (user.accountLockoutCount || 0) + 1 : user.accountLockoutCount || 0;
  const lockUntil = shouldLock ? calculateLockUntil(accountLockoutCount, now) : user.accountLockedUntil || null;

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        failedLoginAttempts: shouldLock ? 0 : failedLoginAttempts,
        accountLockoutCount,
        accountLockedUntil: lockUntil,
        suspiciousLoginFlag: shouldLock || Boolean(user.suspiciousLoginFlag),
        lastFailedLoginAt: now
      }
    }
  );

  return {
    locked: shouldLock,
    lockUntil,
    accountLockoutCount
  };
};

const registerFailedLogin = async ({ user, email, req, reason = "INVALID_CREDENTIALS" }) => {
  const ipAddress = getClientIp(req);
  const normalizedEmail = normalizeEmail(email);
  const throttleResults = await Promise.all([
    recordThrottleFailure({
      scope: "ip",
      value: ipAddress,
      email: normalizedEmail,
      ipAddress,
      reason
    }),
    normalizedEmail
      ? recordThrottleFailure({
          scope: "user",
          value: normalizedEmail,
          email: normalizedEmail,
          ipAddress,
          reason
        })
      : Promise.resolve({ locked: false })
  ]);
  const userFailure = await recordUserFailure({ user });

  return {
    accountLockedUntil: userFailure.locked ? userFailure.lockUntil : null,
    throttleLockedUntil:
      throttleResults.find((result) => result.locked)?.lockUntil || null,
    throttleResults,
    userFailure
  };
};

const resetUserThrottle = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  return LoginThrottle.findOneAndUpdate(
    { key: hashKey("user", normalizedEmail) },
    {
      $set: {
        attempts: 0,
        lockUntil: null,
        lastFailureReason: null
      }
    },
    { new: true }
  );
};

const normalizeKnownLoginIps = (knownLoginIps = []) =>
  knownLoginIps
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          ipAddress: entry,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          loginCount: 1
        };
      }

      return {
        ipAddress: entry.ipAddress,
        firstSeenAt: entry.firstSeenAt || new Date(),
        lastSeenAt: entry.lastSeenAt || new Date(),
        loginCount: entry.loginCount || 1
      };
    })
    .filter((entry) => entry.ipAddress);

const assessLoginRisk = ({ user, req }) => {
  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const knownLoginIps = normalizeKnownLoginIps(user?.knownLoginIps);
  const knownIp = knownLoginIps.some((entry) => entry.ipAddress === ipAddress);
  const previousIp = user?.lastLoginIp;
  const lastLoginAt = user?.lastLoginAt ? new Date(user.lastLoginAt) : null;
  const { impossibleLoginWindowMs } = getConfig();
  const flags = [];

  if (previousIp && !knownIp && !isPrivateIpAddress(ipAddress)) {
    flags.push("UNUSUAL_IP");
  }

  if (
    previousIp &&
    previousIp !== ipAddress &&
    lastLoginAt &&
    Date.now() - lastLoginAt.getTime() <= impossibleLoginWindowMs &&
    !isPrivateIpAddress(previousIp) &&
    !isPrivateIpAddress(ipAddress)
  ) {
    flags.push("IMPOSSIBLE_LOGIN_BEHAVIOR");
  }

  if (user?.lastLoginUserAgent && user.lastLoginUserAgent !== userAgent) {
    flags.push("USER_AGENT_CHANGED");
  }

  return {
    suspicious: flags.length > 0,
    flags,
    ipAddress,
    userAgent
  };
};

const mergeKnownIp = (knownLoginIps, ipAddress) => {
  const now = new Date();
  const normalized = normalizeKnownLoginIps(knownLoginIps);
  const existing = normalized.find((entry) => entry.ipAddress === ipAddress);

  if (existing) {
    existing.lastSeenAt = now;
    existing.loginCount = (existing.loginCount || 0) + 1;
    return normalized.slice(-20);
  }

  normalized.push({
    ipAddress,
    firstSeenAt: now,
    lastSeenAt: now,
    loginCount: 1
  });

  return normalized.slice(-20);
};

const recordSuccessfulLogin = async ({ user, req, risk }) => {
  const ipAddress = risk?.ipAddress || getClientIp(req);
  const userAgent = risk?.userAgent || getUserAgent(req);

  await Promise.all([
    resetUserThrottle({ email: user.email }),
    User.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: 0,
          accountLockoutCount: 0,
          accountLockedUntil: null,
          suspiciousLoginFlag: Boolean(risk?.suspicious),
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
          lastLoginUserAgent: userAgent,
          knownLoginIps: mergeKnownIp(user.knownLoginIps, ipAddress)
        }
      }
    )
  ]);
};

module.exports = {
  assertLoginAllowed,
  assessLoginRisk,
  calculateLockUntil,
  getConfig,
  getThrottleStatus,
  hashKey,
  isLocked,
  normalizeEmail,
  recordFailedLogin: registerFailedLogin,
  recordSuccessfulLogin,
  registerFailedLogin
};
