import { Download, FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import TransactionTable from "../components/TransactionTable.jsx";
import { Alert, Button, PageHeader } from "../components/ui.jsx";
import useDashboardData from "../hooks/useDashboardData";
import { getTransactionAmount, getTransactionId, getTransactionStatus } from "../utils/formatters";

const downloadCsv = (transactions) => {
  const rows = [
    ["transactionId", "amount", "status", "paymentType", "city", "timestamp"],
    ...transactions.map((transaction) => [
      getTransactionId(transaction),
      getTransactionAmount(transaction),
      getTransactionStatus(transaction),
      transaction.paymentType || transaction.paymentMethod || "",
      transaction.geoLocation?.city || transaction.city || "",
      transaction.timestamp || ""
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fraud-transactions.csv";
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function TransactionsPage() {
  const { data, error, loading, refresh } = useDashboardData(true);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const selectedId = selectedTransaction ? getTransactionId(selectedTransaction) : "";

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader
        icon={FileText}
        eyebrow="Transaction operations"
        title="Transaction History"
        description="Search, filter, sort, paginate, and inspect the existing fraud transaction feed."
        actions={
          <>
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => downloadCsv(data.transactions)} disabled={!data.transactions.length}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="secondary" disabled title="No PDF export endpoint exists yet">
              <Download className="h-4 w-4" />
              PDF
            </Button>
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TransactionTable transactions={data.transactions} onSelectTransaction={setSelectedTransaction} selectedTransactionId={selectedId} />
      {selectedId ? (
        <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-sm text-violet-100">
          Selected <strong>{selectedId}</strong>.{" "}
          <Link className="font-black underline" to={`/transactions/${encodeURIComponent(selectedId)}`}>
            Open transaction details
          </Link>
        </div>
      ) : null}
    </div>
  );
}
