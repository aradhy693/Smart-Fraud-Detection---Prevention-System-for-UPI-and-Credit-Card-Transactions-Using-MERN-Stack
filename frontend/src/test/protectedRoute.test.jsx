import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ProtectedRoute from "../routes/ProtectedRoute.jsx";

let authState;

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: () => authState
}));

const renderProtected = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route element={<ProtectedRoute requireAdmin />}>
          <Route path="/dashboard" element={<div>Protected dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("protected routes", () => {
  beforeEach(() => {
    authState = {
      initialized: true,
      isAuthenticated: false,
      isAdmin: false
    };
  });

  test("redirects unauthenticated users to login", () => {
    renderProtected();
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  test("renders for authenticated admins", () => {
    authState = {
      initialized: true,
      isAuthenticated: true,
      isAdmin: true
    };

    renderProtected();
    expect(screen.getByText("Protected dashboard")).toBeInTheDocument();
  });
});
