import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export default function AIConfidenceAreaChart({ data = [] }) {
  return (
    <section className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-4 shadow-soft backdrop-blur-xl">
      <h2 className="text-sm font-bold text-white">AI Confidence</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                background: "#18181B",
                border: "1px solid #2A2A2E",
                borderRadius: 14,
                color: "#f4f4f5"
              }}
            />
            <Area
              type="monotone"
              dataKey="confidence"
              stroke="#8B5CF6"
              fill="rgba(124,58,237,0.18)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
