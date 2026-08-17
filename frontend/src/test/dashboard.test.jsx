import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DashboardPage from "../pages/DashboardPage.jsx";

vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: () => ({
    initialized: true,
    isAuthenticated: true,
    isAdmin: true,
    isSecurityStaff: true,
    token: "admin.jwt.token"
  })
}));

vi.mock("../services/fraudService", () => ({
  getDashboardBundle: vi.fn(async () => ({
    stats: {
      totalTransactions: 2,
      blockedTransactions: 1,
      highRiskTransactions: 1,
      openAlerts: 1,
      averageAiConfidence: 0.67
    },
    riskTrends: [
      { date: "2026-05-23", allowed: 1, blocked: 1, flagged: 0, averageAiConfidence: 0.67 }
    ],
    suspiciousGeolocationActivity: [
      { location: "Mumbai, India", count: 1, maxDistanceKm: 1200, maxRiskScore: 92 }
    ],
    recentAlerts: [],
    aiConfidenceLevels: {
      levels: { low: 1, medium: 0, high: 1 },
      averageConfidence: 0.67,
      byModelVersion: []
    },
    transactions: [
      {
        _id: "txn-1",
        transactionId: "TXN_001",
        amount: 500,
        paymentType: "UPI",
        fraudRiskScore: 0.08,
        aiFraudProbability: 0.05,
        status: "ALLOWED",
        city: "Bengaluru",
        timestamp: "2026-05-23T09:00:00.000Z",
        riskSignals: {}
      },
      {
        _id: "txn-2",
        transactionId: "TXN_002",
        amount: 95000,
        paymentType: "CARD",
        fraudRiskScore: 0.92,
        aiFraudProbability: 0.88,
        status: "BLOCKED",
        city: "Mumbai",
        timestamp: "2026-05-23T10:00:00.000Z",
        riskSignals: { newDeviceFlag: true, deviceRisk: 80, impossibleTravel: true, geoDistance: 1200 },
        riskReasons: { highAmount: 100, aiHighConfidence: 88 }
      }
    ],
    alerts: [
      {
        _id: "alert-1",
        alertType: "AI_HIGH_CONFIDENCE",
        severity: "CRITICAL",
        message: "High confidence fraud detected",
        status: "OPEN",
        aiConfidence: 0.88,
        riskScore: 92,
        createdAt: "2026-05-23T10:00:00.000Z"
      }
    ]
  }))
}));

vi.mock("../services/socket", () => ({
  createAuthenticatedSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn()
  }))
}));

describe("dashboard rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders analytics, charts, alerts, and transactions from backend-shaped data", async () => {
    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Smart Fraud Detection Command Center")).toBeInTheDocument());
    expect(screen.getByText("Total Transactions")).toBeInTheDocument();
    expect(screen.getByText("Blocked Transactions")).toBeInTheDocument();
    expect(screen.getAllByText("TXN_002").length).toBeGreaterThan(0);
    expect(screen.getByText("AI Explainability")).toBeInTheDocument();
    expect(screen.getByText("Geolocation Threats")).toBeInTheDocument();
  });
});
