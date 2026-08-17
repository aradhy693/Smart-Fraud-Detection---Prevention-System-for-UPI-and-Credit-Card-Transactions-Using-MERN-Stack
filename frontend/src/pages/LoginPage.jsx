import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { Alert, Button, Field, IconButton, inputClass } from "../components/ui.jsx";
import { getApiErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext.jsx";
import { loginSchema, validateWithSchema } from "../utils/validation";

export default function LoginPage() {
  const { initialized, isAuthenticated, isSecurityStaff, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(
    location.state?.reason === "INSUFFICIENT_PERMISSIONS" ? "Security staff access required." : ""
  );
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError: setFieldError
  } = useForm({ defaultValues: { email: "", password: "" } });

  if (initialized && isAuthenticated && isSecurityStaff) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (values) => {
    const validation = validateWithSchema(loginSchema, values);
    if (Object.keys(validation.errors).length) {
      Object.entries(validation.errors).forEach(([field, message]) => setFieldError(field, { message }));
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await login(validation.values);
      const user = response.user;
      if (response.mfaSetupRequired) {
        navigate("/mfa/setup", { replace: true });
        return;
      }
      if (response.mfaRequired) {
        navigate("/mfa/verify", { replace: true });
        return;
      }
      if (!["admin", "analyst", "security-operator", "soc-analyst", "fraud-analyst", "incident-manager", "viewer"].includes(user.role)) {
        await logout();
        setError("Security staff access required.");
        return;
      }

      navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in to the command center"
      subtitle="Use your security staff credentials to access live fraud monitoring."
      footer={
        <>
          New to the platform? <a className="font-bold text-violet-300 hover:text-violet-200" href="/register">Create an account</a>
        </>
      }
    >
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field label="Email" error={errors.email?.message}>
            <input
              type="email"
              className={inputClass}
              autoComplete="email"
              disabled={submitting}
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </Field>
          <Field label="Password" error={errors.password?.message}>
            <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className={`${inputClass} pr-12`}
              autoComplete="current-password"
              disabled={submitting}
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
              <IconButton
                label={showPassword ? "Hide secret" : "Reveal secret"}
                className="absolute right-1 top-1 h-9 w-9 border-0 bg-transparent shadow-none"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
            </div>
          </Field>
          <div className="flex items-center justify-between text-sm">
            <label className="inline-flex items-center gap-2 text-zinc-400">
              <input className="h-4 w-4 rounded border-[#2A2A2E] bg-[#111111] text-violet-600" type="checkbox" />
              Remember device
            </label>
            <a className="font-bold text-violet-300 hover:text-violet-200" href="/forgot-password">Forgot password?</a>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full"
          >
            <LockKeyhole className="h-4 w-4" />
            {submitting ? "Authenticating" : "Enter Dashboard"}
          </Button>
        </form>
    </AuthShell>
  );
}
