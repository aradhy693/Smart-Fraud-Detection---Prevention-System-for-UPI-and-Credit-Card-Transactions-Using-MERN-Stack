import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const colors = {
  Allowed: "#34d399",
  Flagged: "#fbbf24",
  Blocked: "#fb7185"
};

export default function RiskDistributionChart({ data = [] }) {
  return (
    <section className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-4 shadow-soft backdrop-blur-xl">
      <h2 className="text-sm font-bold text-white">Risk Distribution</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={colors[entry.name] || "#22d3ee"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "#18181B",
                border: "1px solid #2A2A2E",
                borderRadius: 14,
                color: "#f4f4f5"
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
        {data.map((entry) => (
          <span key={entry.name} className="rounded-xl border border-[#2A2A2E] bg-[#111111] px-2 py-2">
            <strong className="block text-white">{entry.value}</strong>
            {entry.name}
          </span>
        ))}
      </div>
    </section>
  );
}
