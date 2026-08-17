const logger = require("../utils/logger");
const { logAuditEvent } = require("../services/auditLogService");
const { ROLES, SECURITY_STAFF_ROLES } = require("../security/roles");

const ROOM_AUTHORIZATION = Object.freeze({
  "admin-dashboard": Object.freeze([ROLES.ADMIN]),
  "soc-dashboard": SECURITY_STAFF_ROLES,
  "ai-dashboard": SECURITY_STAFF_ROLES
});

const registerFraudSocket = (io, socket) => {
  const securityRequest = {
    headers: socket.handshake?.headers || {},
    ip: socket.handshake?.address,
    socket: { remoteAddress: socket.handshake?.address }
  };

  const joinProtectedRoom = (room) => {
    const allowedRoles = new Set(ROOM_AUTHORIZATION[room] || []);
    if (!socket.user) {
      void logAuditEvent({
        req: securityRequest,
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        severity: "HIGH",
        metadata: { reason: "SOCKET_ROOM_JOIN_UNAUTHENTICATED", room }
      });
      logger.warn("Rejected unauthenticated socket room join", {
        socketId: socket.id,
        room
      });
      if (typeof socket.disconnect === "function") {
        socket.disconnect(true);
      }
      socket.emit("socket-error", {
        success: false,
        message: "Authentication required for dashboard stream",
        error: {
          code: "SOCKET_AUTH_REQUIRED",
          statusCode: 401
        }
      });
      return;
    }

    if (!allowedRoles.has(socket.user.role)) {
      void logAuditEvent({
        req: securityRequest,
        eventType: "SUSPICIOUS_AUTH",
        outcome: "BLOCKED",
        severity: "MEDIUM",
        actorUserId: socket.user._id,
        metadata: {
          reason: "SOCKET_ROOM_JOIN_FORBIDDEN",
          room,
          role: socket.user.role
        }
      });
      logger.warn("Rejected unauthorized socket room join", {
        socketId: socket.id,
        userId: socket.user._id,
        room,
        role: socket.user.role
      });
      socket.emit("socket-error", {
        success: false,
        message: "You are not authorized to join this dashboard stream",
        error: {
          code: "INSUFFICIENT_PERMISSIONS",
          statusCode: 403
        }
      });
      return;
    }

    socket.join(room);
    logger.info("Socket joined protected room", {
      socketId: socket.id,
      userId: socket.user._id,
      room,
      role: socket.user.role
    });
    socket.emit(`${room}-joined`, {
      success: true,
      room
    });
  };

  socket.on("join-admin-dashboard", () => {
    joinProtectedRoom("admin-dashboard");
  });

  socket.on("join-soc-dashboard", () => {
    joinProtectedRoom("soc-dashboard");
  });

  socket.on("join-ai-dashboard", () => {
    joinProtectedRoom("ai-dashboard");
  });
};

module.exports = registerFraudSocket;
