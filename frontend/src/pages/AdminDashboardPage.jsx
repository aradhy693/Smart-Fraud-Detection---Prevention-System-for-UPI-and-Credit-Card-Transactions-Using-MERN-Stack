import { Activity, ShieldAlert, Users } from "lucide-react";
import StatCard from "../components/StatCard.jsx";
import { PageHeader } from "../components/ui.jsx";
import useDashboardData from "../hooks/useDashboardData";
import { formatNumber, formatPercent } from "../utils/formatters";

export default function AdminDashboardPage() {
  const { data, loading } = useDashboardData(true);

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader
        icon={Users}
        eyebrow="Administrative overview"
        title="Admin Dashboard"
        description="Operational health, platform risk volume, and staff-facing controls using existing fraud and auth APIs."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Activity} label="Transactions monitored" value={formatNumber(data.stats.totalTransactions || data.transactions.length)} detail="Last 100 transaction records" tone="cyan" />
        <StatCard icon={ShieldAlert} label="Open alerts" value={formatNumber(data.stats.openAlerts || data.alerts.length)} detail="Fraud alerts requiring review" tone="amber" />
        <StatCard icon={Users} label="Security users" value="Role gated" detail="Managed by backend auth policy" tone="slate" />
        <StatCard icon={Activity} label="AI confidence" value={formatPercent(data.aiConfidenceLevels?.averageConfidence || 0)} detail="Average model confidence" tone="emerald" />
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-white/[0.045]">
        <h2 className="text-lg font-black">Admin controls</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          User management and role editing endpoints are not exposed in the current backend routes. This panel is intentionally UI-ready and waits for those contracts.
        </p>
        {loading ? <p className="mt-4 text-sm font-bold text-cyan-700 dark:text-cyan-300">Refreshing administrative metrics...</p> : null}
      </section>
    </div>
  );
}
