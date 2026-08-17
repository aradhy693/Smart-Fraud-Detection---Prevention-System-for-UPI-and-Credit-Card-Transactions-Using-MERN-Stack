import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout.jsx";
import LoadingScreen from "../components/LoadingScreen.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

const AdminDashboardPage = lazy(() => import("../pages/AdminDashboardPage.jsx"));
const DashboardPage = lazy(() => import("../pages/DashboardPage.jsx"));
const ForgotPasswordPage = lazy(() => import("../pages/ForgotPasswordPage.jsx"));
const LandingPage = lazy(() => import("../pages/LandingPage.jsx"));
const LoginPage = lazy(() => import("../pages/LoginPage.jsx"));
const MFASetupPage = lazy(() => import("../pages/MFASetupPage.jsx"));
const MFAVerificationPage = lazy(() => import("../pages/MFAVerificationPage.jsx"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage.jsx"));
const ProfilePage = lazy(() => import("../pages/ProfilePage.jsx"));
const RegisterPage = lazy(() => import("../pages/RegisterPage.jsx"));
const ResetPasswordPage = lazy(() => import("../pages/ResetPasswordPage.jsx"));
const SecurityEventsPage = lazy(() => import("../pages/SecurityEventsPage.jsx"));
const SettingsPage = lazy(() => import("../pages/SettingsPage.jsx"));
const TransactionDetailsPage = lazy(() => import("../pages/TransactionDetailsPage.jsx"));
const TransactionsPage = lazy(() => import("../pages/TransactionsPage.jsx"));
const TrustedDevicesPage = lazy(() => import("../pages/TrustedDevicesPage.jsx"));
const UserDashboardPage = lazy(() => import("../pages/UserDashboardPage.jsx"));

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading workspace" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute requireAdmin={false} />}>
          <Route path="/mfa/setup" element={<MFASetupPage />} />
          <Route path="/mfa/verify" element={<MFAVerificationPage />} />
          <Route element={<DashboardLayout />}>
            <Route path="/user" element={<UserDashboardPage />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute requireAdmin />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/transactions/:transactionId" element={<TransactionDetailsPage />} />
            <Route path="/trusted-devices" element={<TrustedDevicesPage />} />
            <Route path="/security-events" element={<SecurityEventsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
