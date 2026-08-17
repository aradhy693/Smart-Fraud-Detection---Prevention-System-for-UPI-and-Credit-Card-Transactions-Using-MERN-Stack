import { describe, expect, test, vi, beforeEach } from "vitest";
import { api, CSRF_COOKIE_NAME } from "../services/api";
import { clearStoredToken, setStoredToken } from "../utils/tokenStorage";

describe("central API client", () => {
  beforeEach(() => {
    clearStoredToken();
    document.cookie = `${CSRF_COOKIE_NAME}=; Max-Age=0; path=/`;
  });

  test("attaches bearer auth from stored token while keeping credentialed cookies", async () => {
    setStoredToken("secure.jwt.token");
    api.defaults.adapter = vi.fn(async (config) => ({
      config,
      data: { success: true },
      headers: {},
      status: 200,
      statusText: "OK"
    }));

    const response = await api.get("/api/fraud/stats");

    expect(response.config.withCredentials).toBe(true);
    expect(response.config.headers.Authorization).toBe("Bearer secure.jwt.token");
    expect(localStorage.getItem("smart-fraud-admin-token")).toBe("secure.jwt.token");
  });

  test("adds the CSRF header for mutating cookie-authenticated requests", async () => {
    document.cookie = `${CSRF_COOKIE_NAME}=signed.csrf.token; path=/`;
    api.defaults.adapter = vi.fn(async (config) => ({
      config,
      data: { success: true },
      headers: {},
      status: 200,
      statusText: "OK"
    }));

    const response = await api.post("/api/auth/logout");

    expect(response.config.headers["X-CSRF-Token"]).toBe("signed.csrf.token");
  });

  test("emits an auth event on refresh failure", async () => {
    const listener = vi.fn();
    window.addEventListener("auth:unauthorized", listener);
    api.defaults.adapter = vi.fn(async () => {
      const error = new Error("Unauthorized");
      error.config = { url: "/api/auth/refresh" };
      error.response = { status: 401, data: { message: "Invalid token" } };
      throw error;
    });

    await expect(api.post("/api/auth/refresh")).rejects.toThrow("Unauthorized");

    expect(localStorage.getItem("smart-fraud-admin-token")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("auth:unauthorized", listener);
  });
});
