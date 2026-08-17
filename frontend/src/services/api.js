import axios from "axios";
import { getDeviceHeaders } from "./deviceFingerprint";
import { clearStoredToken, getStoredToken, setStoredToken } from "../utils/tokenStorage";

export const API_URL = import.meta.env.VITE_API_URL || "";
export const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || "sfd_csrf_token";

const STATE_CHANGING_METHODS = new Set(["post", "put", "patch", "delete"]);

export const getCsrfTokenFromCookie = () => {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(CSRF_COOKIE_NAME.length + 1));
};

const attachCsrfHeader = (config) => {
  const method = String(config.method || "get").toLowerCase();
  if (!STATE_CHANGING_METHODS.has(method)) {
    return;
  }

  const csrfToken = getCsrfTokenFromCookie();
  if (csrfToken) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }
};

const attachAuthorizationHeader = (config) => {
  const token = getStoredToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
};

export const api = axios.create({
  baseURL: API_URL,
  timeout: 12000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
});

const refreshClient = axios.create({
  baseURL: API_URL,
  timeout: 12000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
});

let refreshPromise = null;

const isRefreshSafeRoute = (url = "") =>
  !url.includes("/api/auth/login") &&
  !url.includes("/api/auth/register") &&
  !url.includes("/api/auth/refresh") &&
  !url.includes("/api/auth/logout");

export const refreshSessionRequest = async () => {
  const response = await refreshClient.post("/api/auth/refresh", null, {
    headers: await getDeviceHeaders()
  });
  return response.data;
};

api.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};
  const deviceHeaders = await getDeviceHeaders();
  Object.assign(config.headers, deviceHeaders);
  attachAuthorizationHeader(config);
  attachCsrfHeader(config);
  return config;
});

refreshClient.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};
  attachAuthorizationHeader(config);
  attachCsrfHeader(config);
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const statusCode = error.response?.status;
    const originalRequest = error.config || {};

    if (statusCode === 401 && !originalRequest._retry && isRefreshSafeRoute(originalRequest.url)) {
      originalRequest._retry = true;

      try {
        refreshPromise = refreshPromise || refreshSessionRequest();
        const refreshResponse = await refreshPromise;
        refreshPromise = null;
        if (refreshResponse?.token) {
          setStoredToken(refreshResponse.token);
        }
        return api(originalRequest);
      } catch (refreshError) {
        refreshPromise = null;
        clearStoredToken();
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        return Promise.reject(refreshError);
      }
    }

    if (statusCode === 401) {
      clearStoredToken();
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }

    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (error) =>
  error.response?.data?.message ||
  error.response?.data?.error?.code ||
  error.message ||
  "Request failed";
