import { Home, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui.jsx";

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-950 dark:bg-[#080b10] dark:text-slate-100">
      <section className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">404</p>
        <h1 className="mt-2 text-3xl font-black">Page not found</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">The requested workspace view does not exist or is not connected yet.</p>
        <Button as={Link} to="/dashboard" className="mt-6">
          <Home className="h-4 w-4" />
          Back to dashboard
        </Button>
      </section>
    </main>
  );
}
