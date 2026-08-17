import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Search, XCircle } from "lucide-react";

export const cn = (...classes) => classes.filter(Boolean).join(" ");

const buttonVariants = {
  primary: "bg-violet-600 text-white shadow-[0_12px_30px_rgba(124,58,237,0.28)] hover:bg-violet-500 active:bg-violet-700",
  secondary: "border border-[#2A2A2E] bg-[#202024] text-zinc-100 hover:border-violet-400/40 hover:bg-[#27272c]",
  outline: "border border-[#2A2A2E] bg-transparent text-zinc-200 hover:border-violet-400/50 hover:bg-violet-500/10",
  danger: "border border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15",
  ghost: "text-zinc-300 hover:bg-white/[0.07] hover:text-white"
};

export function Button({ as: Component = "button", variant = "primary", className = "", children, ...props }) {
  return (
    <Component
      className={cn(
        "focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function IconButton({ label, className = "", children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "focus-ring grid h-10 w-10 place-items-center rounded-xl border border-[#2A2A2E] bg-[#202024] text-zinc-300 transition hover:border-violet-400/40 hover:bg-[#27272c] hover:text-white",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className = "", children, ...props }) {
  return (
    <section className={cn("surface rounded-xl", className)} {...props}>
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions, icon: Icon }) {
  return (
    <header className="surface flex flex-col gap-4 rounded-2xl p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 gap-3">
        {Icon ? (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-200">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Field({ label, error, children, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-zinc-200">{label}</span>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1 text-sm font-semibold text-red-300">{error}</p> : hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </label>
  );
}

export const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-[#2A2A2E] bg-[#111111]/85 px-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-60";

export function Alert({ tone = "info", children }) {
  const toneClass =
    tone === "danger"
      ? "border-red-400/30 bg-red-500/10 text-red-100"
      : tone === "success"
        ? "border-green-400/30 bg-green-500/10 text-green-100"
        : "border-violet-400/30 bg-violet-500/10 text-violet-100";
  const Icon = tone === "danger" ? XCircle : tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <div className={cn("flex gap-2 rounded-xl border px-4 py-3 text-sm font-semibold", toneClass)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "border border-[#2A2A2E] bg-white/5 text-zinc-200",
    cyan: "border border-blue-400/30 bg-blue-500/10 text-blue-200",
    amber: "border border-amber-400/30 bg-amber-500/10 text-amber-200",
    rose: "border border-red-400/30 bg-red-500/10 text-red-200",
    emerald: "border border-green-400/30 bg-green-500/10 text-green-200",
    violet: "border border-violet-400/30 bg-violet-500/10 text-violet-200"
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold", tones[tone])}>{children}</span>;
}

export function Spinner({ label = "Loading" }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-bold text-zinc-300">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </span>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/[0.07]", className)} />;
}

export function EmptyState({ icon: Icon = Search, title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#2A2A2E] bg-[#111111]/75 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white/[0.06] text-zinc-400 shadow-sm">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-black text-white">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  return (
    <nav className="flex items-center gap-2" aria-label="Pagination">
      <IconButton label="Previous page" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" />
      </IconButton>
      <span className="min-w-16 text-center text-sm font-bold text-zinc-300">
        {page} / {totalPages}
      </span>
      <IconButton label="Next page" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
        <ChevronRight className="h-4 w-4" />
      </IconButton>
    </nav>
  );
}
