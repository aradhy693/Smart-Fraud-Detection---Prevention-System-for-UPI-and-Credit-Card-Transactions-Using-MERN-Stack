import { api, refreshSessionRequest } from "./api";

export const loginRequest = async ({ email, password }) => {
  const response = await api.post("/api/auth/login", { email, password });
  return response.data;
};

export const registerRequest = async ({ name, email, password, role, adminRegistrationKey }) => {
  const response = await api.post(
    "/api/auth/register",
    { name, email, password, role, adminRegistrationKey },
    adminRegistrationKey
      ? {
          headers: {
            "X-Admin-Registration-Key": adminRegistrationKey
          }
        }
      : undefined
  );
  return response.data;
};

export const passwordStrengthRequest = async (password) => {
  const response = await api.post("/api/auth/password-strength", { password });
  return response.data;
};

export const meRequest = async () => {
  const response = await api.get("/api/auth/me");
  return response.data;
};

export const logoutRequest = async () => {
  const response = await api.post("/api/auth/logout");
  return response.data;
};

export const logoutAllRequest = async () => {
  const response = await api.post("/api/auth/logout-all");
  return response.data;
};

export const getSessionsRequest = async () => {
  const response = await api.get("/api/auth/sessions");
  return response.data;
};

export const refreshRequest = refreshSessionRequest;

export const startMfaEnrollmentRequest = async () => {
  const response = await api.post("/api/auth/mfa/enroll");
  return response.data;
};

export const verifyMfaEnrollmentRequest = async ({ token, trustDevice }) => {
  const response = await api.post("/api/auth/mfa/verify-enrollment", { token, trustDevice });
  return response.data;
};

export const verifyMfaLoginRequest = async ({ token, recoveryCode, trustDevice }) => {
  const response = await api.post("/api/auth/mfa/verify-login", { token, recoveryCode, trustDevice });
  return response.data;
};

export const disableMfaRequest = async ({ token }) => {
  const response = await api.post("/api/auth/mfa/disable", { token });
  return response.data;
};

export const regenerateRecoveryCodesRequest = async () => {
  const response = await api.post("/api/auth/mfa/recovery-codes");
  return response.data;
};

export const getTrustedDevicesRequest = async () => {
  const response = await api.get("/api/auth/devices");
  return response.data;
};

export const trustDeviceRequest = async (deviceId) => {
  const response = await api.post(`/api/auth/devices/${deviceId}/trust`);
  return response.data;
};

export const revokeDeviceRequest = async (deviceId) => {
  const response = await api.patch(`/api/auth/devices/${deviceId}/revoke`);
  return response.data;
};

export const getSecurityEventsRequest = async () => {
  const response = await api.get("/api/auth/security-events");
  return response.data;
};
