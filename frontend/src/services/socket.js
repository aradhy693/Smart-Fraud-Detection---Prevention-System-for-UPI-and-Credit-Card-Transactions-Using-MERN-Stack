import { io } from "socket.io-client";
import { getStoredToken } from "../utils/tokenStorage";

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

export const createAuthenticatedSocket = (token) =>
  io(SOCKET_URL, {
    autoConnect: false,
    transports: ["websocket"],
    withCredentials: true,
    auth: {
      ...(token || getStoredToken() ? { token: token || getStoredToken() } : {})
    },
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 750,
    timeout: 8000
  });
