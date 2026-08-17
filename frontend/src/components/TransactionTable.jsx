import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
  getAiProbability,
  getFraudScore,
  getTransactionAmount,
  getTransactionId,
  getTransactionStatus
} from "../utils/formatters";
import StatusBadge from "./StatusBadge.jsx";

const pageSize = 8;

const sorters = {
  timestamp: (t) => new Date(t.timestamp || 0).getTime(),
  amount: getTransactionAmount,
  risk: (t) => getFraudScore(t),
  ai: getAiProbability,
  status: getTransactionStatus
};

export default function TransactionTable({
  transactions = [],
  onSelectTransaction,
  selectedTransactionId
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();

    return transactions
      .filter((t) => {
        const status = getTransactionStatus(t);
        const paymentType = t.paymentType || t.paymentMethod || "-";
        const id = getTransactionId(t).toLowerCase();
        const city = (t.geoLocation?.city || t.city || "unknown").toLowerCase();

        const matchesQuery = !q || id.includes(q) || city.includes(q);
        const matchesStatus = statusFilter === "ALL" || status === statusFilter;
        const matchesPayment = paymentFilter === "ALL" || paymentType === paymentFilter;

        return matchesQuery && matchesStatus && matchesPayment;
      })
      .sort((a, b) => {
        const aVal = sorters[sortKey]?.(a) ?? 0;
        const bVal = sorters[sortKey]?.(b) ?? 0;
        const dir = sortDirection === "asc" ? 1 : -1;

        return aVal > bVal ? dir : aVal < bVal ? -dir : 0;
      });
  }, [transactions, query, statusFilter, paymentFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginated = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSort = (key) => {
    setPage(1);

    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortLabel = (key) => {
    if (sortKey !== key) return "Not sorted";
    return sortDirection === "asc" ? "Ascending" : "Descending";
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#2A2A2E] bg-[#18181B]/85 shadow-soft backdrop-blur-xl">
      
      {/* HEADER */}
      <div className="border-b border-[#2A2A2E] px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <h2 className="text-lg font-semibold text-white">
              Transaction Monitoring
            </h2>
            <p className="text-sm text-zinc-400">
              Live overview of transaction activity and fraud signals
            </p>
          </div>

          {/* CONTROLS */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

            {/* SEARCH */}
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search ID or city..."
                className="h-10 w-full rounded-xl border border-[#2A2A2E] bg-[#111111]/85 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 hover:border-zinc-600 focus:ring-2 focus:ring-violet-400/50 sm:w-64"
              />
            </label>

            {/* STATUS */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-[#2A2A2E] bg-[#111111]/85 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-violet-400/50"
            >
              <option value="ALL">All Status</option>
              <option value="ALLOWED">Allowed</option>
              <option value="FLAGGED_OTP">Flagged</option>
              <option value="BLOCKED">Blocked</option>
            </select>

            {/* PAYMENT */}
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-[#2A2A2E] bg-[#111111]/85 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-violet-400/50"
            >
              <option value="ALL">All Rails</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="CREDIT_CARD">Credit Card</option>
            </select>

          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#2A2A2E]">

          <thead className="sticky top-0 z-10 bg-[#202024]/95 backdrop-blur">
            <tr>
              {[
                ["Transaction", "timestamp"],
                ["Amount", "amount"],
                ["Payment", "status"],
                ["Fraud Score", "risk"],
                ["AI Probability", "ai"],
                ["Status", "status"],
                ["City", "timestamp"],
                ["Timestamp", "timestamp"]
              ].map(([label, key]) => (
                <th
                  key={label}
                  className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400"
                >
                  <button
                    onClick={() => toggleSort(key)}
                    className="inline-flex items-center gap-1 transition hover:text-white"
                    aria-label={`${label} sort ${sortLabel(key)}`}
                    aria-sort={
                      sortKey === key
                        ? sortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {label}
                    <ArrowUpDown
                      className={`h-3.5 w-3.5 ${
                        sortKey === key ? "text-violet-300" : "text-zinc-500"
                      }`}
                    />
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.06]">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center">
                  <p className="text-sm font-medium text-zinc-200">
                    No transactions found
                  </p>
                  <p className="text-xs text-zinc-500">
                    Try changing filters or search terms
                  </p>
                </td>
              </tr>
            ) : (
              paginated.map((t) => {
                const id = getTransactionId(t);
                const isActive = selectedTransactionId === id;

                return (
                  <tr
                    key={t._id || id}
                    onClick={() => onSelectTransaction?.(t)}
                    tabIndex={0}
                    className={`cursor-pointer transition odd:bg-white/[0.012] hover:bg-violet-500/[0.07] ${
                      isActive ? "bg-violet-500/10" : ""
                    }`}
                  >
                    <td className="px-6 py-3 font-medium text-zinc-100">
                      {id}
                    </td>
                    <td className="px-6 py-3 text-zinc-300">
                      {formatCurrency(getTransactionAmount(t))}
                    </td>
                    <td className="px-6 py-3 text-zinc-300">
                      {t.paymentType || t.paymentMethod || "-"}
                    </td>
                    <td className="px-6 py-3 text-zinc-300">
                      {formatPercent(getFraudScore(t), 0)}
                    </td>
                    <td className="px-6 py-3 text-zinc-300">
                      {formatPercent(getAiProbability(t), 0)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge value={getTransactionStatus(t)} />
                    </td>
                    <td className="px-6 py-3 text-zinc-300">
                      {t.geoLocation?.city || t.city || "Unknown"}
                    </td>
                    <td className="px-6 py-3 text-zinc-400">
                      {formatDateTime(t.timestamp)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div className="flex flex-col gap-3 border-t border-[#2A2A2E] px-6 py-4 text-sm text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing <span className="font-semibold">{paginated.length}</span> of{" "}
          <span className="font-semibold">{filteredTransactions.length}</span>
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#2A2A2E] transition hover:border-violet-400/40 hover:bg-violet-500/10 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="min-w-16 text-center text-sm">
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="grid h-8 w-8 place-items-center rounded-lg border border-[#2A2A2E] transition hover:border-violet-400/40 hover:bg-violet-500/10 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
