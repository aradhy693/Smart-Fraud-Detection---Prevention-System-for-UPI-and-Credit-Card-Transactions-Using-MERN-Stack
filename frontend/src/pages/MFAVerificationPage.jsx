import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../services/api";

export default function MFAVerificationPage() {
  const navigate = useNavigate();
  const { verifyMfaLogin } = useAuth();
  const [token, setToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await verifyMfaLogin({ token, recoveryCode, trustDevice });
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#080b10] px-4 py-8 text-slate-100">
      <form className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.055] p-6 shadow-2xl backdrop-blur" onSubmit={handleSubmit} noValidate>
        <div className="flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-cyan-300" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Multi-factor authentication</p>
            <h1 className="text-xl font-black text-slate-50">MFA Verification</h1>
          </div>
        </div>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mt-6 h-11 w-full rounded-md border border-white/10 bg-black/30 px-3 outline-none ring-cyan-400/40 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          inputMode="numeric"
          placeholder="6-digit authenticator code"
          disabled={submitting}
        />
        <input
          value={recoveryCode}
          onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
          className="mt-3 h-11 w-full rounded-md border border-white/10 bg-black/30 px-3 outline-none ring-cyan-400/40 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Recovery code"
          disabled={submitting}
        />
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} disabled={submitting} />
          Trust this device
        </label>
        {error ? <p className="mt-4 rounded border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100" role="alert">{error}</p> : null}
        <button className="mt-5 h-11 w-full rounded-md bg-cyan-300 font-black text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>
          {submitting ? "Verifying" : "Verify"}
        </button>
      </form>
    </main>
  );
}
