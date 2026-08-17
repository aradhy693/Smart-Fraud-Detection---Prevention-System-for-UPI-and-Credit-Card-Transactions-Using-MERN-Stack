import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext.jsx";
import LoginPage from "../pages/LoginPage.jsx";
import { clearStoredToken, getStoredToken } from "../utils/tokenStorage";

vi.mock("../services/authService", () => ({
  loginRequest: vi.fn(async () => ({
    success: true,
    token: "admin.jwt.token",
    user: {
      _id: "admin-1",
      name: "SOC Admin",
      email: "admin@example.com",
      role: "admin"
    }
  })),
  meRequest: vi.fn(),
  registerRequest: vi.fn(),
  logoutRequest: vi.fn()
}));

describe("auth flow", () => {
  beforeEach(() => {
    clearStoredToken();
  });

  test("stores JWT after login and navigates to the dashboard", async () => {
    render(
      <MemoryRouter initialEntries={["/login"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>Secure dashboard</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "admin@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "StrongPass123");
    await userEvent.click(screen.getByRole("button", { name: /enter dashboard/i }));

    await waitFor(() => expect(screen.getByText("Secure dashboard")).toBeInTheDocument());
    expect(getStoredToken()).toBe("admin.jwt.token");
    expect(localStorage.getItem("smart-fraud-admin-token")).toBe("admin.jwt.token");
  });
});
