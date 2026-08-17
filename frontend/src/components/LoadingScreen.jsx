import { ShieldCheck } from "lucide-react";

export default function LoadingScreen({ label = "Loading" }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#09090B] px-4 text-zinc-100">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.16),transparent_42%),linear-gradient(135deg,#09090B,#111111_46%,#18181B)]" />
      <div className="flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-[#18181B]/80 px-5 py-4 shadow-[0_0_32px_rgba(124,58,237,0.16)] backdrop-blur-xl" role="status" aria-live="polite">
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/25 bg-violet-500/10">
          <ShieldCheck className="h-5 w-5 animate-pulse text-violet-300" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Secure session</p>
          <span className="text-sm font-semibold tracking-wide text-zinc-100">{label}</span>
        </div>
      </div>
    </main>
  );
}
