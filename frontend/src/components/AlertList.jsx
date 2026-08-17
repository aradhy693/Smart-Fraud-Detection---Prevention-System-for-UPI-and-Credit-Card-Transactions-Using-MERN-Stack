import { motion } from "framer-motion";
import { AlertTriangle, Ban, Cpu, RadioTower } from "lucide-react";
import { compactDateTime, formatPercent, getTransactionId } from "../utils/formatters";
import StatusBadge from "./StatusBadge.jsx";

const eventIcon = {
  "fraud-alert": AlertTriangle,
  "blocked-transaction": Ban,
  "suspicious-transaction": RadioTower
};

const getEventTitle = (alert) =>
  alert.eventType === "blocked-transaction"
    ? "Blocked transaction"
    : alert.eventType === "suspicious-transaction"
      ? "Suspicious transaction"
      : alert.alertType || "Fraud alert";

export default function AlertList({ alerts = [] }) {
  return (
    <section className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 shadow-soft backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-[#2A2A2E] px-4 py-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-violet-300" />
          <h2 className="text-sm font-bold text-white">Real-Time Fraud Alerts</h2>
        </div>
        <span className="text-xs font-semibold text-zinc-400">{alerts.length} active</span>
      </div>
      <div className="max-h-[500px] space-y-3 overflow-y-auto p-3">
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#2A2A2E] bg-[#111111] p-4 text-sm text-zinc-400">
            Live alert stream is clear.
          </div>
        ) : (
          alerts.slice(0, 12).map((alert, index) => {
            const Icon = eventIcon[alert.eventType] || AlertTriangle;
            const transactionId = getTransactionId(alert.transaction || alert.transactionId || alert);
            const riskScore = alert.riskScore ?? alert.aiRiskScore ?? alert.fraudScore ?? 0;
            const confidence = alert.aiConfidence ?? alert.aiFraudProbability ?? alert.fraudProbability ?? 0;
            const location =
              alert.geoLocation?.city ||
              alert.transactionId?.location?.city ||
              alert.metadata?.riskSignals?.city ||
              "Unknown";

            return (
              <motion.article
                key={alert._id || alert.id || `${transactionId}-${index}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3 transition hover:border-violet-400/25"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl border border-red-400/30 bg-red-500/10 text-red-100">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100">{getEventTitle(alert)}</h3>
                      <StatusBadge value={alert.severity || alert.status || "HIGH"} type={alert.severity ? "severity" : "status"} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                      {alert.message || `Transaction ${transactionId} triggered fraud controls.`}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <span>{transactionId}</span>
                      <span>{location}</span>
                      <span>{formatPercent(confidence, 0)} AI confidence</span>
                      <span>{Number(riskScore || 0).toFixed(0)} risk score</span>
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {compactDateTime(alert.createdAt || alert.timestamp)}
                    </p>
                  </div>
                </div>
              </motion.article>
            );
          })
        )}
      </div>
    </section>
  );
}
