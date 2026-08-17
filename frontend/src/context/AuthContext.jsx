import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../services/api";
import {
  loginRequest,
  logoutRequest,
  meRequest,
  registerRequest,
  verifyMfaLoginRequest
} from "../services/authService";
import {
  clearStoredToken,
  getStoredToken,
  getStoredUser,
  setStoredToken,
  setStoredUser
} from "../utils/tokenStorage";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStoredUser());
  const [initialized, setInitialized] = useState(false);
  const [authError, setAuthError] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const securityStaffRoles = useMemo(
    () => new Set(["admin", "analyst", "security-operator", "soc-analyst", "fraud-analyst", "incident-manager", "viewer"]),
    []
  );

  const clearSession = useCallback(() => {
    clearStoredToken();
    setUser(null);
    setMfaRequired(false);
    setMfaSetupRequired(false);
  }, []);

  useEffect(() => {
    let active = true;

    const storedToken = getStoredToken();

    const restoreSession = async () => {
      try {
        if (storedToken) {
          setStoredToken(storedToken);
        }
        const response = await meRequest();
        if (!active) {
          return;
        }
        setUser(response.user);
        setStoredUser(response.user);
        setMfaRequired(false);
        setMfaSetupRequired(false);
        setAuthError("");
      } catch (error) {
        if (active) {
          if (error.response?.data?.error?.code === "MFA_REQUIRED") {
            setMfaRequired(true);
            setInitialized(true);
            return;
          }
          clearSession();
          setAuthError(getApiErrorMessage(error));
        }
      } finally {
        if (active) {
          setInitialized(true);
        }
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, [clearSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
      setAuthError("Session expired. Sign in again.");
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [clearSession]);

  const login = useCallback(async ({ email, password }) => {
    const response = await loginRequest({ email, password });
    setStoredToken(response.token);
    setStoredUser(response.user);
    setUser(response.user);
    setMfaRequired(Boolean(response.mfaRequired));
    setMfaSetupRequired(Boolean(response.mfaSetupRequired));
    setAuthError("");
    return response;
  }, []);

  const register = useCallback(async (payload) => {
    const response = await registerRequest(payload);
    setStoredToken(response.token);
    setStoredUser(response.user);
    setUser(response.user);
    setMfaRequired(false);
    setMfaSetupRequired(false);
    setAuthError("");
    return response.user;
  }, []);

  const verifyMfaLogin = useCallback(async ({ token, recoveryCode, trustDevice }) => {
    const response = await verifyMfaLoginRequest({ token, recoveryCode, trustDevice });
    setStoredToken(response.token);
    setStoredUser(response.user);
    setUser(response.user);
    setMfaRequired(false);
    setMfaSetupRequired(false);
    setAuthError("");
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      // Local session cleanup still wins if the server session is already expired.
    } finally {
      clearSession();
      setAuthError("");
    }
  }, [clearSession]);

  const isSecurityStaff = useMemo(() => securityStaffRoles.has(user?.role), [securityStaffRoles, user?.role]);
  const isAdmin = user?.role === "admin";

  const logoutLocally = useCallback(() => {
    clearSession();
    setAuthError("");
  }, [clearSession]);

  const value = useMemo(
    () => ({
      authError,
      initialized,
      isAdmin,
      isAuthenticated: Boolean(user),
      isSecurityStaff,
      login,
      logout,
      logoutLocally,
      mfaRequired,
      mfaSetupRequired,
      register,
      verifyMfaLogin,
      user
    }),
    [
      authError,
      initialized,
      isAdmin,
      isSecurityStaff,
      login,
      logout,
      logoutLocally,
      mfaRequired,
      mfaSetupRequired,
      register,
      user,
      verifyMfaLogin
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
