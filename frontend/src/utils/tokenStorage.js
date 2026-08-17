export const AUTH_TOKEN_KEY = "smart-fraud-admin-token";
export const AUTH_USER_KEY = "smart-fraud-admin-user";

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const getStoredToken = () => {
  if (!canUseStorage()) {
    return null;
  }

  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  return token || null;
};

export const setStoredToken = (token) => {
  if (!canUseStorage()) {
    return;
  }

  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const clearStoredToken = () => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
};

export const getStoredUser = () => {
  if (!canUseStorage()) {
    return null;
  }

  const serialized = window.localStorage.getItem(AUTH_USER_KEY);
  if (!serialized) {
    return null;
  }

  try {
    return JSON.parse(serialized);
  } catch {
    window.localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
};

export const setStoredUser = (user) => {
  if (!canUseStorage()) {
    return;
  }

  if (user) {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    return;
  }

  window.localStorage.removeItem(AUTH_USER_KEY);
};
