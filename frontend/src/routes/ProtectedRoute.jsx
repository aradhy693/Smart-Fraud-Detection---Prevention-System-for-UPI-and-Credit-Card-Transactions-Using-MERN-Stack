import { Navigate, Outlet, useLocation } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ requireAdmin = true }) {
  const { initialized, isAuthenticated, isAdmin, isSecurityStaff, mfaRequired, mfaSetupRequired } = useAuth();
  const location = useLocation();

  if (!initialized) {
    return <LoadingScreen label="Restoring secure session" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!location.pathname.startsWith("/mfa") && mfaSetupRequired) {
    return <Navigate to="/mfa/setup" replace />;
  }

  if (!location.pathname.startsWith("/mfa") && mfaRequired) {
    return <Navigate to="/mfa/verify" replace />;
  }

  if (requireAdmin && !(isAdmin || isSecurityStaff)) {
    return <Navigate to="/login" replace state={{ reason: "INSUFFICIENT_PERMISSIONS" }} />;
  }

  return <Outlet />;
}
