import { CreditCard, ShieldCheck } from "lucide-react";
import { Card, PageHeader } from "../components/ui.jsx";

export default function UserDashboardPage() {
  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader icon={ShieldCheck} eyebrow="User workspace" title="User Dashboard" description="A protected customer-facing dashboard shell for future account and transaction self-service endpoints." />
      <Card className="p-5">
        <CreditCard className="h-6 w-6 text-cyan-600 dark:text-cyan-300" />
        <h2 className="mt-4 text-lg font-black">Customer transaction view</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          The current backend exposes administrative transaction monitoring endpoints only. This UI is ready to connect when user-scoped transaction APIs are added.
        </p>
      </Card>
    </div>
  );
}
