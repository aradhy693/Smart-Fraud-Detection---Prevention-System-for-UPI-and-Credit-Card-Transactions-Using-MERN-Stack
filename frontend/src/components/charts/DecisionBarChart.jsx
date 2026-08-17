import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export default function DecisionBarChart({ data = [] }) {
  return (
    <section className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-4 shadow-soft backdrop-blur-xl">
      <h2 className="text-sm font-bold text-white">Blocked vs Allowed</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "#18181B",
                border: "1px solid #2A2A2E",
                borderRadius: 14,
                color: "#f4f4f5"
              }}
            />
            <Legend />
            <Bar dataKey="allowed" fill="#34d399" radius={[4, 4, 0, 0]} />
            <Bar dataKey="blocked" fill="#fb7185" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
