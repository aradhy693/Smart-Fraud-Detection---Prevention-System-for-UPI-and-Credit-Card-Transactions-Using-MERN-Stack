const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { getRequiredEnv } = require("./env");
const registerFraudSocket = require("../sockets/fraudSocket");
const logger = require("../utils/logger");
const { getBearerToken } = require("../middleware/authMiddleware");
const { ACCESS_TOKEN_COOKIE_NAME } = require("../security/cookieConfig");
const { parseCookieHeader } = require("../security/cookieParser");
const { validateAuthSession } = require("../services/sessionService");
const { logAuditEvent } = require("../services/auditLogService");

const rejectSocketConnection = async (socket, message, auditPayload = {}) => {
  try {
    await logAuditEvent(auditPayload);
  } catch (auditError) {
    logger.error("Failed to record socket security event", {
      message: auditError.message,
      stack: auditError.stack,
      auditReason: auditPayload?.metadata?.reason
    });
  }

  if (typeof socket.disconnect === "function") {
    socket.disconnect(true);
  }

  return new Error(message);
};

const parseAllowedOrigins = () => {
  const configuredOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "";
  const defaults = ["http://localhost:5174", "http://127.0.0.1:5174"];
  return [...new Set([
    ...configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
    ...defaults
  ])];
};

const initSocket = (server) => {
  const allowedOrigins = parseAllowedOrigins();
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token;
      const headerToken = getBearerToken(socket.handshake.headers.authorization);
      const cookieToken = parseCookieHeader(socket.handshake.headers.cookie)[ACCESS_TOKEN_COOKIE_NAME];
      const token = authToken || headerToken || cookieToken;

      if (!token) {
        const error = await rejectSocketConnection(socket, "Socket authentication required", {
          req: {
            headers: socket.handshake.headers || {},
            ip: socket.handshake.address,
            socket: { remoteAddress: socket.handshake.address }
          },
          eventType: "TOKEN_FAILURE",
          outcome: "FAILURE",
          severity: "MEDIUM",
          metadata: { reason: "SOCKET_TOKEN_MISSING" }
        });
        return next(error);
      }

      const decoded = jwt.verify(token, getRequiredEnv("JWT_SECRET"), { algorithms: ["HS256"] });
      if (!decoded?.id || !mongoose.isValidObjectId(decoded.id)) {
        const error = await rejectSocketConnection(socket, "Invalid socket token subject", {
          req: {
            headers: socket.handshake.headers || {},
            ip: socket.handshake.address,
            socket: { remoteAddress: socket.handshake.address }
          },
          eventType: "TOKEN_FAILURE",
          outcome: "FAILURE",
          severity: "HIGH",
          metadata: { reason: "SOCKET_TOKEN_SUBJECT_INVALID" }
        });
        return next(error);
      }

      const reqLike = {
        headers: {
          ...(socket.handshake.headers || {}),
          ...(socket.handshake.auth?.deviceFingerprint
            ? { "x-device-fingerprint": socket.handshake.auth.deviceFingerprint }
            : {}),
          ...(socket.handshake.auth?.deviceMetadata
            ? { "x-device-metadata": socket.handshake.auth.deviceMetadata }
            : {})
        },
        ip: socket.handshake.address,
        socket: { remoteAddress: socket.handshake.address }
      };
      const { session, anomalyFlags } = await validateAuthSession({
        decoded,
        token,
        req: reqLike
      });
      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        const error = await rejectSocketConnection(socket, "Socket user not found", {
          req: reqLike,
          eventType: "TOKEN_FAILURE",
          outcome: "FAILURE",
          severity: "HIGH",
          actorUserId: decoded.id,
          sessionId: session?._id,
          tokenId: decoded.jti,
          metadata: { reason: "SOCKET_USER_NOT_FOUND" }
        });
        return next(error);
      }

      if (decoded.role !== user.role || session.role !== user.role) {
        await logAuditEvent({
          req: reqLike,
          eventType: "TOKEN_FAILURE",
          outcome: "FAILURE",
          severity: "HIGH",
          actorUserId: user._id,
          sessionId: session._id,
          tokenId: decoded.jti,
          metadata: {
            reason: "SOCKET_ROLE_MISMATCH",
            tokenRole: decoded.role,
            userRole: user.role,
            sessionRole: session.role
          }
        });
        const error = await rejectSocketConnection(socket, "Invalid socket token role", {
          req: reqLike,
          eventType: "TOKEN_FAILURE",
          outcome: "FAILURE",
          severity: "HIGH",
          actorUserId: user._id,
          sessionId: session._id,
          tokenId: decoded.jti,
          metadata: {
            reason: "SOCKET_ROLE_MISMATCH",
            tokenRole: decoded.role,
            userRole: user.role,
            sessionRole: session.role
          }
        });
        return next(error);
      }

      if (session.mfaRequired && !session.mfaVerified) {
        await logAuditEvent({
          req: reqLike,
          eventType: "MFA_BYPASS_ATTEMPT",
          outcome: "BLOCKED",
          severity: "HIGH",
          actorUserId: user._id,
          sessionId: session._id,
          tokenId: decoded.jti,
          metadata: { reason: "SOCKET_MFA_REQUIRED" }
        });
        const error = await rejectSocketConnection(
          socket,
          "MFA verification required for socket session",
          {
            req: reqLike,
            eventType: "MFA_BYPASS_ATTEMPT",
            outcome: "BLOCKED",
            severity: "HIGH",
            actorUserId: user._id,
            sessionId: session._id,
            tokenId: decoded.jti,
            metadata: { reason: "SOCKET_MFA_REQUIRED" }
          }
        );
        return next(error);
      }

      if (anomalyFlags.length > 0) {
        await logAuditEvent({
          req: reqLike,
          eventType: "SUSPICIOUS_AUTH",
          outcome: "FAILURE",
          severity: "HIGH",
          actorUserId: user._id,
          sessionId: session._id,
          tokenId: decoded.jti,
          metadata: { reason: "SOCKET_TOKEN_ANOMALY", anomalyFlags }
        });
      }

      socket.user = user;
      socket.authSession = session;
      socket.data = {
        ...(socket.data || {}),
        authenticated: true,
        userId: user._id?.toString?.() || String(user._id),
        sessionId: session._id?.toString?.() || String(session._id),
        tokenId: decoded.jti
      };
      logger.info("Socket client authenticated", {
        socketId: socket.id,
        userId: user._id,
        sessionId: session._id
      });
      return next();
    } catch (error) {
      const rejectedError = await rejectSocketConnection(socket, "Invalid socket token", {
        req: {
          headers: socket.handshake.headers || {},
          ip: socket.handshake.address,
          socket: { remoteAddress: socket.handshake.address }
        },
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        severity: "HIGH",
        metadata: { reason: "SOCKET_TOKEN_FAILURE", message: error.message }
      });
      return next(rejectedError);
    }
  });

  io.on("connection", (socket) => {
    logger.info("Socket client connected", {
      socketId: socket.id,
      userId: socket.user?._id
    });

    registerFraudSocket(io, socket);

    socket.on("disconnect", () => {
      logger.info("Socket client disconnected", {
        socketId: socket.id,
        userId: socket.user?._id
      });
    });
  });

  return io;
};

module.exports = { initSocket };
