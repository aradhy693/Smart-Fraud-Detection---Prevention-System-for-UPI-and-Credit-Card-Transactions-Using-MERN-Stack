import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export default function FraudTrendChart({ data = [] }) {
  return (
    <section className="flex flex-col rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-5 shadow-soft backdrop-blur-xl transition hover:border-violet-400/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-400">Fraud Trend</h2>
          <p className="mt-1 text-xl font-semibold text-white">Activity Overview</p>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full border border-green-400/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-300">
          Live
        </span>
      </div>

      <div className="mt-5 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(148,163,184,0.15)" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "#18181B",
                border: "1px solid #2A2A2E",
                borderRadius: 14,
                color: "#f4f4f5"
              }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Line type="monotone" dataKey="blocked" stroke="#ef4444" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="flagged" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#2A2A2E] pt-3 text-xs text-zinc-400">
        <span>Blocked: red line</span>
        <span>Flagged: amber line</span>
        <span>Updated in real-time</span>
      </div>
    </section>
  );
}
