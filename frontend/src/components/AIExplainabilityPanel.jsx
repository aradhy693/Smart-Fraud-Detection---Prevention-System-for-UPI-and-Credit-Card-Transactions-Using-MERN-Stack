import { BrainCircuit } from "lucide-react";
import { formatPercent, getAiProbability, getFraudScore, getTransactionId } from "../utils/formatters";

const toEntries = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return Object.entries(value).map(([name, score]) => ({ name, score: Number(score || 0) }));
};

export default function AIExplainabilityPanel({ transaction }) {
  const contributions = toEntries(
    transaction?.featureContributions ||
      transaction?.shapExplanation ||
      transaction?.riskReasons ||
      transaction?.transactionId?.riskReasons
  ).sort((left, right) => right.score - left.score);
  const signals = transaction?.riskSignals || transaction?.metadata?.riskSignals || {};
  const selectedId = getTransactionId(transaction);

  return (
    <section className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-4 shadow-soft backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-violet-300" />
          <h2 className="text-sm font-bold text-white">AI Explainability</h2>
        </div>
        {transaction ? <span className="text-xs font-semibold text-zinc-500">{selectedId}</span> : null}
      </div>
      {!transaction ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#2A2A2E] bg-[#111111] p-4 text-sm text-zinc-400">
          No transaction context available.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Fraud score</p>
                <strong className="mt-1 block text-2xl text-white">{formatPercent(getFraudScore(transaction), 0)}</strong>
              </div>
              <div className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">AI probability</p>
                <strong className="mt-1 block text-2xl text-violet-200">{formatPercent(getAiProbability(transaction), 0)}</strong>
              </div>
            </div>
            <div className="space-y-2">
              {contributions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#2A2A2E] bg-[#111111] p-3 text-sm text-zinc-400">
                  No contribution fields were returned for this transaction.
                </p>
              ) : (
                contributions.slice(0, 7).map((contribution) => {
                  const width = Math.min(100, Math.max(6, Number(contribution.score || 0)));
                  return (
                    <div key={contribution.name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-300">{contribution.name}</span>
                        <span className="text-zinc-500">{Number(contribution.score || 0).toFixed(0)}</span>
                      </div>
                      <div className="h-2 rounded-md bg-white/10">
                        <div className="h-2 rounded-md bg-violet-400" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Risk signals</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Velocity", signals.transactionVelocity],
                ["IP risk", signals.ipRisk],
                ["Device risk", signals.deviceRisk],
                ["Geo distance", signals.geoDistance],
                ["Failures", signals.repeatedFailures],
                ["New device", signals.newDeviceFlag ? "Yes" : "No"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] p-2">
                  <dt className="text-xs text-zinc-500">{label}</dt>
                  <dd className="mt-1 font-semibold text-zinc-200">{value ?? 0}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
