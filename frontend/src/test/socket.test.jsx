import { describe, expect, test, vi } from "vitest";
import { SOCKET_URL, createAuthenticatedSocket } from "../services/socket";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }))
}));

vi.mock("../services/deviceFingerprint", () => ({
  getDeviceHeaders: vi.fn(async () => ({
    "X-Device-Fingerprint": "f".repeat(64),
    "X-Device-Metadata": "encoded-device"
  }))
}));

import { io } from "socket.io-client";

describe("socket service", () => {
  test("creates a Socket.io client with the backend websocket URL", async () => {
    createAuthenticatedSocket();

    expect(io).toHaveBeenCalledWith(
      SOCKET_URL,
      expect.objectContaining({
        autoConnect: false,
        auth: {},
        withCredentials: true,
        transports: ["websocket"]
      })
    );
  });

  test("preserves explicit token auth for non-browser Socket.io clients", async () => {
    createAuthenticatedSocket("socket.jwt.token");

    expect(io).toHaveBeenCalledWith(
      SOCKET_URL,
      expect.objectContaining({
        auth: { token: "socket.jwt.token" },
        withCredentials: true
      })
    );
  });
});
