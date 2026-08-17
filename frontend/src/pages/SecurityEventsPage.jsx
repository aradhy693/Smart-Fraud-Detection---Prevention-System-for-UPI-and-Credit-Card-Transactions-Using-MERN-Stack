import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from "../components/ui.jsx";
import { getSecurityEventsRequest } from "../services/authService";
import { formatDateTime } from "../utils/formatters";

export default function SecurityEventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    getSecurityEventsRequest()
      .then((response) => {
        if (active) setEvents(response.events || []);
      })
      .catch(() => {
        if (active) setError("Unable to load security events right now.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader
        icon={ShieldAlert}
        eyebrow="Security operations"
        title="Security Events"
        description="Audit recent authentication, MFA, session, and trust events from the current backend."
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {loading ? (
        <div className="grid gap-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={`security-event-skeleton-${index}`} className="h-20" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No security events" description="No security events have been recorded yet." />
      ) : (
        <div className="grid gap-3">
          {events.map((event) => (
            <article key={event._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-white/[0.045]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950 dark:text-slate-100">{event.eventType}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{event.severity} - {event.riskLevel || "UNSPECIFIED"}</p>
                </div>
                <div className="text-right">
                  <Badge tone={String(event.severity || "").toLowerCase().includes("high") ? "rose" : "slate"}>{event.severity || "event"}</Badge>
                  <p className="mt-2 text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
