import { Globe2, MapPin, Radar } from "lucide-react";
import { formatDateTime } from "../utils/formatters";

export default function GeolocationThreatSection({ locations = [], transactions = [] }) {
  const highRiskIpLocations = transactions
    .filter((transaction) => Number(transaction.riskSignals?.ipRisk || 0) >= 55)
    .slice(0, 5);
  const impossibleTravel = transactions
    .filter((transaction) => transaction.riskSignals?.impossibleTravel)
    .slice(0, 5);

  return (
    <section className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-4 shadow-soft backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-violet-300" />
        <h2 className="text-sm font-bold text-white">Geolocation Threats</h2>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            <MapPin className="h-4 w-4 text-amber-300" />
            Suspicious countries
          </div>
          <div className="mt-3 space-y-2">
            {locations.length === 0 ? (
              <p className="text-sm text-slate-400">No geolocation anomalies reported.</p>
            ) : (
              locations.slice(0, 5).map((location) => (
                <div key={location.location} className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2">
                  <span className="text-sm text-slate-200">{location.location}</span>
                  <strong className="text-sm text-amber-200">{location.count}</strong>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            <Radar className="h-4 w-4 text-rose-300" />
            Impossible travel
          </div>
          <div className="mt-3 space-y-2">
            {impossibleTravel.length === 0 ? (
              <p className="text-sm text-slate-400">No impossible-travel events in current transactions.</p>
            ) : (
              impossibleTravel.map((transaction) => (
                <div key={transaction.transactionId || transaction._id} className="rounded-md bg-white/[0.04] px-3 py-2">
                  <p className="text-sm font-semibold text-slate-200">{transaction.transactionId}</p>
                  <p className="text-xs text-slate-500">{Number(transaction.riskSignals?.geoDistance || 0).toFixed(0)} km jump</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[#2A2A2E] bg-[#111111] p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            <Radar className="h-4 w-4 text-blue-300" />
            High-risk IP locations
          </div>
          <div className="mt-3 space-y-2">
            {highRiskIpLocations.length === 0 ? (
              <p className="text-sm text-slate-400">No high-risk IP locations in current transactions.</p>
            ) : (
              highRiskIpLocations.map((transaction) => (
                <div key={transaction.transactionId || transaction._id} className="rounded-md bg-white/[0.04] px-3 py-2">
                  <p className="text-sm font-semibold text-slate-200">{transaction.city || transaction.geoLocation?.city || "Unknown"}</p>
                  <p className="text-xs text-slate-500">
                    {transaction.riskSignals.ipRisk} IP risk at {formatDateTime(transaction.timestamp)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
