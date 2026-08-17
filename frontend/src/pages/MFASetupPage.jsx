import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../services/api";
import { startMfaEnrollmentRequest, verifyMfaEnrollmentRequest } from "../services/authService";

export default function MFASetupPage() {
  const navigate = useNavigate();
  const [enrollment, setEnrollment] = useState(null);
  const [token, setToken] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    startMfaEnrollmentRequest()
      .then((response) => {
        if (active) setEnrollment(response.enrollment);
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const response = await verifyMfaEnrollmentRequest({ token, trustDevice });
      setRecoveryCodes(response.recoveryCodes || []);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    }
  };

  return (
    <main className="min-h-screen bg-[#080b10] px-4 py-8 text-slate-100">
      <section className="mx-auto max-w-xl rounded-xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-cyan-300" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Multi-factor authentication</p>
            <h1 className="text-xl font-black text-slate-50">Set Up MFA</h1>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 space-y-4" aria-busy="true">
            <div className="mx-auto h-48 w-48 animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />
            <div className="h-14 animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />
            <div className="h-11 animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />
          </div>
        ) : enrollment ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <img src={enrollment.qrCodeDataUrl} alt="MFA QR code" className="mx-auto rounded bg-white p-3" />
            <p className="break-all rounded border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
              {enrollment.manualEntryKey}
            </p>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-11 w-full rounded-md border border-white/10 bg-black/30 px-3 outline-none ring-cyan-400/40 focus:ring-2"
              inputMode="numeric"
              placeholder="6-digit code"
              required
            />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
              Trust this device after verification
            </label>
            {error ? <p className="rounded border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
            <button className="h-11 w-full rounded-md bg-cyan-300 font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60" type="submit">
              Verify And Enable
            </button>
          </form>
        ) : (
          <p className="mt-6 text-slate-400" role="alert">Preparing authenticator enrollment...</p>
        )}

        {recoveryCodes.length > 0 ? (
          <div className="mt-6 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4">
            <h2 className="font-bold text-amber-100">Recovery Codes</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-mono text-amber-50">
              {recoveryCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard", { replace: true })}
              className="mt-4 h-10 rounded-md bg-amber-200 px-4 font-bold text-slate-950 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-200/40"
            >
              Continue
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
