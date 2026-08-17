import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  BrainCircuit,
  CreditCard,
  Fingerprint,
  RefreshCw,
  ShieldAlert
} from "lucide-react";
import AIExplainabilityPanel from "../components/AIExplainabilityPanel.jsx";
import AlertList from "../components/AlertList.jsx";
import GeolocationThreatSection from "../components/GeolocationThreatSection.jsx";
import StatCard from "../components/StatCard.jsx";
import TransactionTable from "../components/TransactionTable.jsx";
import AIConfidenceAreaChart from "../components/charts/AIConfidenceAreaChart.jsx";
import DecisionBarChart from "../components/charts/DecisionBarChart.jsx";
import FraudTrendChart from "../components/charts/FraudTrendChart.jsx";
import RiskDistributionChart from "../components/charts/RiskDistributionChart.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import useDashboardData from "../hooks/useDashboardData";
import useFraudSocket from "../hooks/useFraudSocket";
import { formatNumber, formatPercent, getAiProbability, getTransactionId, getTransactionStatus } from "../utils/formatters";

const mergeUnique = (items, nextItem, keySelector, limit = 100) => {
  const nextKey = keySelector(nextItem);
  return [nextItem, ...items.filter((item) => keySelector(item) !== nextKey)].slice(0, limit);
};

const buildDistribution = (transactions) => {
  const counts = transactions.reduce(
    (accumulator, transaction) => {
      const status = getTransactionStatus(transaction);
      if (status === "BLOCKED") accumulator.Blocked += 1;
      else if (status === "FLAGGED_OTP") accumulator.Flagged += 1;
      else accumulator.Allowed += 1;
      return accumulator;
    },
    { Allowed: 0, Flagged: 0, Blocked: 0 }
  );

  return Object.entries(counts).map(([name, value]) => ({ name, value }));
};

const buildConfidenceTrend = (riskTrends) =>
  riskTrends.map((trend) => ({
    date: trend.date,
    confidence: Number(((trend.averageAiConfidence || 0) * 100).toFixed(1))
  }));

export default function DashboardPage() {
  const { initialized, isAuthenticated } = useAuth();
  const { data, error, loading, refresh, setData } = useDashboardData(initialized && isAuthenticated);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);

  const handleFraudAlert = useCallback(
    (alert) => {
      setLiveEvents((current) =>
        mergeUnique(current, { ...alert, eventType: "fraud-alert" }, (event) => event._id || event.id || event.message)
      );
      setData((current) => ({
        ...current,
        alerts: mergeUnique(current.alerts, alert, (item) => item._id || item.id),
        stats: {
          ...current.stats,
          openAlerts: Number(current.stats.openAlerts || 0) + 1
        }
      }));
    },
    [setData]
  );

  const handleSuspiciousTransaction = useCallback(
    (transaction) => {
      setLiveEvents((current) =>
        mergeUnique(
          current,
          { ...transaction, eventType: transaction.eventType || "suspicious-transaction" },
          (event) => getTransactionId(event)
        )
      );
      setData((current) => ({
        ...current,
        transactions: mergeUnique(current.transactions, transaction, getTransactionId)
      }));
    },
    [setData]
  );

  const handleBlockedTransaction = useCallback(
    (transaction) => {
      handleSuspiciousTransaction({ ...transaction, eventType: "blocked-transaction" });
      setData((current) => ({
        ...current,
        stats: {
          ...current.stats,
          blockedTransactions: Number(current.stats.blockedTransactions || 0) + 1,
          totalBlockedTransactions: Number(current.stats.totalBlockedTransactions || 0) + 1
        }
      }));
    },
    [handleSuspiciousTransaction, setData]
  );

  const { connectionState } = useFraudSocket({
    onAlert: handleFraudAlert,
    onBlockedTransaction: handleBlockedTransaction,
    onSuspiciousTransaction: handleSuspiciousTransaction
  });

  const selected = selectedTransaction || data.transactions[0] || null;
  const transactions = data.transactions;
  const aiAverage = data.aiConfidenceLevels?.averageConfidence || data.stats.averageAiConfidence || 0;
  const suspiciousDevices = transactions.filter(
    (transaction) => transaction.riskSignals?.newDeviceFlag || Number(transaction.riskSignals?.deviceRisk || 0) >= 60
  ).length;
  const alertStream = useMemo(
    () => [...liveEvents, ...data.alerts].slice(0, 80),
    [data.alerts, liveEvents]
  );
  const distribution = useMemo(() => buildDistribution(transactions), [transactions]);
  const confidenceTrend = useMemo(() => buildConfidenceTrend(data.riskTrends), [data.riskTrends]);
  const showSkeletons = loading && transactions.length === 0;

  const statCards = [
    {
      label: "Total Transactions",
      value: formatNumber(data.stats.totalTransactions || transactions.length),
      detail: "Monitored payment events",
      icon: CreditCard,
      tone: "cyan"
    },
    {
      label: "Blocked Transactions",
      value: formatNumber(data.stats.blockedTransactions || data.stats.totalBlockedTransactions || 0),
      detail: "Stopped by fraud controls",
      icon: Ban,
      tone: "rose"
    },
    {
      label: "Fraud Alerts",
      value: formatNumber(data.stats.openAlerts || data.alerts.length),
      detail: "Open and reviewing alerts",
      icon: AlertTriangle,
      tone: "amber"
    },
    {
      label: "AI Fraud Confidence",
      value: formatPercent(aiAverage, 0),
      detail: "Average model confidence",
      icon: BrainCircuit,
      tone: "violet"
    },
    {
      label: "High-Risk Transactions",
      value: formatNumber(data.stats.highRiskTransactions || 0),
      detail: "Flagged or blocked",
      icon: ShieldAlert,
      tone: "emerald"
    },
    {
      label: "Suspicious Devices",
      value: formatNumber(suspiciousDevices),
      detail: "New or high-risk devices",
      icon: Fingerprint,
      tone: "slate"
    }
  ];

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-4 shadow-soft backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Cybersecurity Fraud Monitoring</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Smart Fraud Detection Command Center</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-[#2A2A2E] bg-[#111111] px-3 py-2 text-sm font-bold text-zinc-200">
            <span
              className={`h-2.5 w-2.5 rounded-md ${
                connectionState === "Live" ? "bg-emerald-300" : connectionState === "Retrying" ? "bg-amber-300" : "bg-rose-300"
              }`}
            />
            Socket {connectionState}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm font-bold text-violet-100 transition hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
          {error}
        </div>
      ) : null}

      {showSkeletons ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading dashboard metrics">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`stat-skeleton-${index}`}
              className="h-[118px] animate-pulse rounded-2xl border border-[#2A2A2E] bg-white/[0.04]"
            />
          ))}
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <FraudTrendChart data={data.riskTrends} />
        </div>
        <RiskDistributionChart data={distribution} />
        <AIConfidenceAreaChart data={confidenceTrend} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <DecisionBarChart data={data.riskTrends} />
        <AlertList alerts={alertStream} />
      </section>

      <GeolocationThreatSection locations={data.suspiciousGeolocationActivity} transactions={transactions} />

      <section className="grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
        <TransactionTable
          transactions={transactions}
          onSelectTransaction={setSelectedTransaction}
          selectedTransactionId={selected ? getTransactionId(selected) : null}
        />
        <AIExplainabilityPanel transaction={selected} />
      </section>

      {loading ? (
        <div className="fixed bottom-5 right-5 inline-flex items-center gap-2 rounded-xl border border-violet-400/25 bg-[#18181B] px-4 py-3 text-sm font-bold text-violet-100 shadow-2xl">
          <Activity className="h-4 w-4 animate-pulse" />
          Syncing dashboard
        </div>
      ) : null}
    </div>
  );
}
