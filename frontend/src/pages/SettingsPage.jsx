import { KeyRound, LogOut, MonitorCheck, Moon, Save, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Card, Field, PageHeader, Skeleton, inputClass } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { getSessionsRequest, logoutAllRequest } from "../services/authService";
import { formatDateTime } from "../utils/formatters";
import { passwordChangeSchema, validateWithSchema } from "../utils/validation";

export default function SettingsPage() {
  const { logoutLocally } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setErrorMessage] = useState("");
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError
  } = useForm({ defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });

  useEffect(() => {
    let active = true;
    getSessionsRequest()
      .then((response) => active && setSessions(response.sessions || []))
      .catch(() => active && setErrorMessage("Unable to load active sessions right now."))
      .finally(() => active && setLoadingSessions(false));
    return () => {
      active = false;
    };
  }, []);

  const onPasswordSubmit = (values) => {
    const validation = validateWithSchema(passwordChangeSchema, values);
    if (Object.keys(validation.errors).length) {
      Object.entries(validation.errors).forEach(([field, message]) => setError(field, { message }));
      return;
    }
    setMessage("Password change validated locally. Add a backend password-change endpoint to persist it.");
  };

  const logoutEverywhere = async () => {
    setErrorMessage("");
    try {
      await logoutAllRequest();
      logoutLocally();
    } catch {
      setErrorMessage("Unable to sign out all sessions right now.");
    }
  };

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader icon={Settings} eyebrow="Preferences" title="Settings" description="Theme, session visibility, MFA-adjacent controls, and password-change UI." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black">Theme</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Switch between high-contrast dark mode and clean light mode.</p>
            </div>
            <Button variant="secondary" onClick={toggleTheme}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? "Light" : "Dark"}
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <KeyRound className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
            Change password
          </h2>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit(onPasswordSubmit)} noValidate>
            <Field label="Current password" error={errors.currentPassword?.message}>
              <input className={inputClass} type="password" autoComplete="current-password" {...register("currentPassword")} />
            </Field>
            <Field label="New password" error={errors.newPassword?.message}>
              <input className={inputClass} type="password" autoComplete="new-password" {...register("newPassword")} />
            </Field>
            <Field label="Confirm new password" error={errors.confirmPassword?.message}>
              <input className={inputClass} type="password" autoComplete="new-password" {...register("confirmPassword")} />
            </Field>
            <Button type="submit">
              <Save className="h-4 w-4" />
              Update password
            </Button>
          </form>
        </Card>
      </div>
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <MonitorCheck className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
              Active sessions
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Loaded from the existing `/api/auth/sessions` endpoint.</p>
          </div>
          <Button variant="danger" onClick={logoutEverywhere}>
            <LogOut className="h-4 w-4" />
            Sign out all
          </Button>
        </div>
        <div className="mt-4 grid gap-3">
          {loadingSessions ? (
            <>
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </>
          ) : sessions.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-white/[0.05] dark:text-slate-400">No active session records were returned.</p>
          ) : (
            sessions.map((session) => (
              <article key={session._id || session.id || session.createdAt} className="rounded-lg bg-slate-50 p-4 text-sm dark:bg-white/[0.05]">
                <p className="font-bold text-slate-900 dark:text-slate-100">{session.deviceLabel || session.userAgent || "Authenticated session"}</p>
                <p className="mt-1 text-slate-600 dark:text-slate-400">Created {formatDateTime(session.createdAt)} · Last used {formatDateTime(session.lastUsedAt || session.updatedAt)}</p>
              </article>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
