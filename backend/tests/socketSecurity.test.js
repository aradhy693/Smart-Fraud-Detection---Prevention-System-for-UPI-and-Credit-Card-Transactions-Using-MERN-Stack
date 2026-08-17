const jwt = require("jsonwebtoken");

let mockSocketMiddleware;
let mockConnectionHandler;

jest.mock("socket.io", () => ({
  Server: jest.fn().mockImplementation(() => ({
    use: jest.fn((middleware) => {
      mockSocketMiddleware = middleware;
    }),
    on: jest.fn((event, handler) => {
      if (event === "connection") {
        mockConnectionHandler = handler;
      }
    })
  }))
}));

jest.mock("../src/models/User", () => ({
  findById: jest.fn()
}));

jest.mock("../src/services/sessionService", () => ({
  validateAuthSession: jest.fn()
}));

jest.mock("../src/services/auditLogService", () => ({
  logAuditEvent: jest.fn()
}));

jest.mock("../src/utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const User = require("../src/models/User");
const { validateAuthSession } = require("../src/services/sessionService");
const { logAuditEvent } = require("../src/services/auditLogService");
const { initSocket } = require("../src/config/socket");
const registerFraudSocket = require("../src/sockets/fraudSocket");

const USER_ID = "507f1f77bcf86cd799439011";
const SESSION_ID = "507f1f77bcf86cd799439088";

const buildSocket = (overrides = {}) => ({
  handshake: {
    auth: {},
    headers: {},
    address: "127.0.0.1",
    ...overrides.handshake
  },
  ...overrides
});

describe("Socket.IO authentication hardening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketMiddleware = null;
    mockConnectionHandler = null;
    initSocket({});
  });

  test("rejects unauthenticated socket connections before connection handlers run", async () => {
    const socket = buildSocket();
    const next = jest.fn();
    socket.disconnect = jest.fn();

    await mockSocketMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe("Socket authentication required");
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "TOKEN_FAILURE",
        outcome: "FAILURE",
        metadata: expect.objectContaining({ reason: "SOCKET_TOKEN_MISSING" })
      })
    );
    expect(mockConnectionHandler).toEqual(expect.any(Function));
  });

  test("accepts authenticated socket connections with a valid session token", async () => {
    const token = jwt.sign(
      { id: USER_ID, role: "admin", sid: SESSION_ID },
      process.env.JWT_SECRET,
      { expiresIn: "1h", jwtid: "socket-valid-jti" }
    );
    const session = {
      _id: SESSION_ID,
      role: "admin",
      mfaRequired: false,
      mfaVerified: true
    };
    const user = { _id: USER_ID, role: "admin" };
    validateAuthSession.mockResolvedValue({ session, anomalyFlags: [] });
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(user)
    });

    const socket = buildSocket({
      handshake: {
        auth: { token },
        headers: {},
        address: "127.0.0.1"
      }
    });
    const next = jest.fn();

    await mockSocketMiddleware(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.user).toBe(user);
    expect(socket.authSession).toBe(session);
  });
});

describe("Socket.IO protected room authorization", () => {
  const buildRoomSocket = (role) => {
    const handlers = {};
    return {
      user: { _id: USER_ID, role },
      handlers,
      emit: jest.fn(),
      join: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      })
    };
  };

  test("allows admins to join the admin dashboard room", () => {
    const socket = buildRoomSocket("admin");

    registerFraudSocket({}, socket);
    socket.handlers["join-admin-dashboard"]();

    expect(socket.join).toHaveBeenCalledWith("admin-dashboard");
    expect(socket.emit).toHaveBeenCalledWith("admin-dashboard-joined", {
      success: true,
      room: "admin-dashboard"
    });
  });

  test("rejects non-admin users from the admin dashboard room", () => {
    const socket = buildRoomSocket("analyst");

    registerFraudSocket({}, socket);
    socket.handlers["join-admin-dashboard"]();

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      "socket-error",
      expect.objectContaining({
        error: expect.objectContaining({ code: "INSUFFICIENT_PERMISSIONS" })
      })
    );
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "SUSPICIOUS_AUTH",
        metadata: expect.objectContaining({ reason: "SOCKET_ROOM_JOIN_FORBIDDEN" })
      })
    );
  });

  test("allows security staff to join non-admin dashboard rooms", () => {
    const socket = buildRoomSocket("analyst");

    registerFraudSocket({}, socket);
    socket.handlers["join-soc-dashboard"]();

    expect(socket.join).toHaveBeenCalledWith("soc-dashboard");
  });

  test("disconnects unauthenticated sockets that try to join a protected room", () => {
    const socket = {
      handshake: { headers: {}, address: "127.0.0.1" },
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
      on: jest.fn((event, handler) => {
        socket.handlers[event] = handler;
      }),
      handlers: {}
    };

    registerFraudSocket({}, socket);
    socket.handlers["join-admin-dashboard"]();

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });
});
