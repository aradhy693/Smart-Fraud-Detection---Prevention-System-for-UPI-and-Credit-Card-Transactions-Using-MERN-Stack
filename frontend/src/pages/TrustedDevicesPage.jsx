import { MonitorSmartphone, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Button, EmptyState, PageHeader, Skeleton } from "../components/ui.jsx";
import { getTrustedDevicesRequest, revokeDeviceRequest, trustDeviceRequest } from "../services/authService";

export default function TrustedDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyDeviceId, setBusyDeviceId] = useState("");

  const loadDevices = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getTrustedDevicesRequest();
      setDevices(response.devices || []);
    } catch {
      setError("Unable to load trusted devices right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const updateTrust = async (device) => {
    setBusyDeviceId(device.deviceId);
    setError("");
    try {
      if (device.trusted) await revokeDeviceRequest(device.deviceId);
      else await trustDeviceRequest(device.deviceId);
      await loadDevices();
    } catch {
      setError("Unable to update device trust right now.");
    } finally {
      setBusyDeviceId("");
    }
  };

  return (
    <section className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader
        icon={MonitorSmartphone}
        eyebrow="Device trust"
        title="Trusted Devices"
        description="Review browser, operating system, risk level, and trust decisions using existing auth device APIs."
        actions={
          <Button variant="secondary" onClick={loadDevices} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {loading ? (
        <div className="grid gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`trusted-device-skeleton-${index}`} className="h-24" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} title="No trusted devices" description="No trusted devices are registered for this account." />
      ) : (
        <div className="grid gap-3">
          {devices.map((device) => (
            <article key={device.deviceId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-white/[0.045]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950 dark:text-slate-100">{device.browser || "Unknown browser"} on {device.os || "Unknown OS"}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{device.ipAddress || "Unknown IP"} - {device.riskLevel || "UNSPECIFIED"}</p>
                </div>
                <Button type="button" onClick={() => updateTrust(device)} disabled={busyDeviceId === device.deviceId} variant={device.trusted ? "danger" : "secondary"}>
                  {busyDeviceId === device.deviceId ? "Updating" : device.trusted ? "Revoke" : "Trust"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
