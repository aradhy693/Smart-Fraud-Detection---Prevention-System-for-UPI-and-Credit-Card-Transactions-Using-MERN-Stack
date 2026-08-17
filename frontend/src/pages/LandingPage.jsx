import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, BrainCircuit, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge, Button, Card } from "../components/ui.jsx";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(34,211,238,0.18),transparent_24%),radial-gradient(circle_at_82%_22%,rgba(16,185,129,0.14),transparent_25%),linear-gradient(135deg,#020617,#0f172a_56%,#111827)]" />
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="font-black">Fraud Shield</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button as={Link} to="/login" variant="ghost" className="text-white hover:bg-white/10">Sign in</Button>
            <Button as={Link} to="/register">Get started</Button>
          </div>
        </nav>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:pb-24">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col justify-center">
            <Badge tone="cyan">Enterprise MERN + AI fraud platform</Badge>
            <h1 className="mt-5 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">Fraud Shield</h1>
            <p className="mt-5 max-w-2xl text-lg text-slate-300">
              A modern security operations console for UPI and credit card transaction risk, MFA protection, trusted devices, and real-time fraud intelligence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button as={Link} to="/login">
                Open console
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button as={Link} to="/dashboard" variant="secondary" className="border-white/10 bg-white/10 text-white hover:bg-white/15">
                View dashboard
              </Button>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Blocked", "1,284", "rose"],
                ["Flagged", "423", "amber"],
                ["Allowed", "92.4K", "emerald"]
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</p>
                  <strong className="mt-2 block text-2xl">{value}</strong>
                  <Badge tone={tone}>Live</Badge>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <p className="font-black">Risk stream</p>
                <Badge tone="cyan">Socket live</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["UPI velocity spike", "Pune", "91%"],
                  ["New device card attempt", "Mumbai", "76%"],
                  ["Impossible travel signal", "Delhi", "88%"]
                ].map(([name, city, risk]) => (
                  <div key={name} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-white/[0.05] p-3">
                    <div>
                      <p className="font-bold">{name}</p>
                      <p className="text-sm text-slate-400">{city}</p>
                    </div>
                    <span className="font-black text-cyan-200">{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
        {[
          [BrainCircuit, "AI explainability", "Surface model confidence, risk signals, and feature contributions for analyst review."],
          [LockKeyhole, "Security-first auth", "MFA setup, verification, trusted devices, sessions, and security event visibility."],
          [CreditCard, "Transaction operations", "Search, filter, sort, paginate, inspect, and export transaction views without changing APIs."]
        ].map(([Icon, title, text]) => (
          <Card key={title} className="border-white/10 bg-white/[0.04] p-5 text-white">
            <Icon className="h-6 w-6 text-cyan-200" />
            <h2 className="mt-4 text-lg font-black">{title}</h2>
            <p className="mt-2 text-sm text-slate-300">{text}</p>
          </Card>
        ))}
      </section>
      <footer className="border-t border-white/10 px-4 py-6 text-center text-sm text-slate-400">
        <BadgeCheck className="mx-auto mb-2 h-5 w-5 text-emerald-300" />
        Built for production-style portfolio demonstration.
      </footer>
    </main>
  );
}
