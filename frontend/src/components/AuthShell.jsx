import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export default function AuthShell({ eyebrow = "Secure access", title, subtitle, children, footer }) {
  return (
    <main className="min-h-screen bg-[#09090B] text-zinc-100">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.24),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(59,130,246,0.16),transparent_30%),linear-gradient(135deg,#09090B,#111111_54%,#18181B)]" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-300/30 bg-violet-500/10">
              <ShieldCheck className="h-5 w-5 text-violet-200" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">Fraud Shield</p>
              <p className="text-sm text-zinc-300">Banking Security Operations</p>
            </div>
          </div>
          <div className="relative max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-violet-200">AI Risk Intelligence</p>
            <h1 className="mt-4 text-5xl font-black leading-tight">Protect every UPI and card transaction in real time.</h1>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ["99.7%", "model confidence"],
                ["24/7", "SOC monitoring"],
                ["<300ms", "risk decision"]
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-[#2A2A2E] bg-white/[0.06] p-4 backdrop-blur">
                  <strong className="text-2xl">{value}</strong>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-zinc-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="flex items-center justify-center px-4 py-8 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-violet-300">
              <ShieldCheck className="h-5 w-5" />
              Fraud Shield
            </Link>
            <div className="rounded-2xl border border-[#2A2A2E] bg-[#18181B]/90 p-6 shadow-glow backdrop-blur-xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">{eyebrow}</p>
              <h1 className="mt-2 text-2xl font-black text-white">{title}</h1>
              {subtitle ? <p className="mt-2 text-sm leading-6 text-zinc-400">{subtitle}</p> : null}
              <div className="mt-6">{children}</div>
            </div>
            {footer ? <div className="mt-5 text-center text-sm text-zinc-400">{footer}</div> : null}
          </motion.div>
        </section>
      </div>
    </main>
  );
}
