import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const toneClasses = {
  cyan: "border-blue-400/30 bg-blue-500/10 text-blue-200",
  emerald: "border-green-400/30 bg-green-500/10 text-green-200",
  amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  rose: "border-red-400/30 bg-red-500/10 text-red-100",
  violet: "border-violet-400/30 bg-violet-500/10 text-violet-100",
  slate: "border-zinc-500/25 bg-zinc-400/10 text-zinc-100"
};

export default function StatCard({ icon: Icon, label, value, detail, tone = "cyan" }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 p-4 shadow-soft backdrop-blur-xl transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
          <strong className="mt-2 block text-2xl font-black text-white tabular-nums">{value}</strong>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl border ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
        <ArrowUpRight className="h-3.5 w-3.5 text-violet-300" />
        <span>{detail}</span>
      </div>
    </motion.section>
  );
}
