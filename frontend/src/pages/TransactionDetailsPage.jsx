import { ArrowLeft, CreditCard, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AIExplainabilityPanel from "../components/AIExplainabilityPanel.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { Alert, Button, Card, PageHeader, Skeleton } from "../components/ui.jsx";
import { getTransactionById } from "../services/fraudService";
import { formatCurrency, formatDateTime, formatPercent, getAiProbability, getFraudScore, getTransactionAmount, getTransactionId, getTransactionStatus } from "../utils/formatters";

export default function TransactionDetailsPage() {
  const { transactionId } = useParams();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTransactionById(transactionId)
      .then((result) => {
        if (active) {
          setTransaction(result || null);
          if (!result) setError("Transaction was not found in the current backend transaction feed.");
        }
      })
      .catch(() => active && setError("Unable to load transaction details right now."))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [transactionId]);

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader
        icon={CreditCard}
        eyebrow="Transaction investigation"
        title={transaction ? getTransactionId(transaction) : "Transaction Details"}
        description="Detailed risk, payment, device, and location context from the existing transaction payload."
        actions={
          <Button as={Link} to="/transactions" variant="secondary">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : error ? (
        <Alert tone="danger">{error}</Alert>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            {[
              ["Amount", formatCurrency(getTransactionAmount(transaction))],
              ["Status", <StatusBadge key="status" value={getTransactionStatus(transaction)} />],
              ["Fraud score", formatPercent(getFraudScore(transaction))],
              ["AI probability", formatPercent(getAiProbability(transaction))]
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                <div className="mt-2 text-xl font-black text-slate-950 dark:text-slate-100">{value}</div>
              </Card>
            ))}
          </section>
          <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                <h2 className="font-black">Payment context</h2>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Payment rail", transaction.paymentType || transaction.paymentMethod || "-"],
                  ["City", transaction.geoLocation?.city || transaction.city || "Unknown"],
                  ["IP", transaction.ipAddress || transaction.network?.ipAddress || "Unknown"],
                  ["Timestamp", formatDateTime(transaction.timestamp)]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3 dark:bg-white/[0.05]">
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words font-bold text-slate-800 dark:text-slate-200">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <AIExplainabilityPanel transaction={transaction} />
          </section>
        </>
      )}
    </div>
  );
}
