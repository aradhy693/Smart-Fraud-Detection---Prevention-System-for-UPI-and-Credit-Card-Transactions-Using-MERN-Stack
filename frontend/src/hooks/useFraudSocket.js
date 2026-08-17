import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { createAuthenticatedSocket } from "../services/socket";
import { getDeviceHeaders } from "../services/deviceFingerprint";

export default function useFraudSocket({ onAlert, onBlockedTransaction, onSuspiciousTransaction }) {
  const { isAdmin, isSecurityStaff } = useAuth();
  const [connectionState, setConnectionState] = useState("Offline");
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isSecurityStaff) {
      setConnectionState("Offline");
      return undefined;
    }

    let active = true;
    const socket = createAuthenticatedSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      setConnectionState("Live");
      socket.emit(isAdmin ? "join-admin-dashboard" : "join-soc-dashboard");
    };

    const handleDisconnect = () => {
      setConnectionState("Offline");
    };

    const handleConnectError = () => {
      setConnectionState("Retrying");
    };

    const handleSocketError = () => {
      setConnectionState("Auth Required");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("socket-error", handleSocketError);
    socket.on("fraud-alert", onAlert);
    socket.on("blocked-transaction", onBlockedTransaction);
    socket.on("suspicious-transaction", onSuspiciousTransaction);

    (async () => {
      try {
        const headers = await getDeviceHeaders();
        if (!active) {
          return;
        }

        socket.auth = {
          ...(socket.auth || {}),
          deviceFingerprint: headers["X-Device-Fingerprint"],
          deviceMetadata: headers["X-Device-Metadata"]
        };
        socket.connect();
      } catch {
        setConnectionState("Auth Required");
      }
    })();

    return () => {
      active = false;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("socket-error", handleSocketError);
      socket.off("fraud-alert", onAlert);
      socket.off("blocked-transaction", onBlockedTransaction);
      socket.off("suspicious-transaction", onSuspiciousTransaction);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAdmin, isSecurityStaff, onAlert, onBlockedTransaction, onSuspiciousTransaction]);

  return { connectionState, socket: socketRef.current };
}
