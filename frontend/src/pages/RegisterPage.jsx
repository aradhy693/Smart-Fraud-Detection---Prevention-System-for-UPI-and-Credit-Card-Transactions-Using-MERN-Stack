import { Eye, EyeOff, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell.jsx";
import { Alert, Button, Field, IconButton, inputClass } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../services/api";
import { registerSchema, validateWithSchema } from "../utils/validation";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerAccount } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError: setFieldError
  } = useForm({ defaultValues: { name: "", email: "", password: "", confirmPassword: "", role: "user", adminRegistrationKey: "" } });

  const onSubmit = async (values) => {
    const validation = validateWithSchema(registerSchema, values);
    if (Object.keys(validation.errors).length) {
      Object.entries(validation.errors).forEach(([field, message]) => setFieldError(field, { message }));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const { confirmPassword, ...payload } = validation.values;
      await registerAccount(payload);
      navigate("/mfa/setup", { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Staff registration"
      title="Create a secure account"
      subtitle="Registration uses the existing backend endpoint and optional admin key."
      footer={
        <>
          Already enrolled? <a className="font-bold text-violet-300 hover:text-violet-200" href="/login">Sign in</a>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Full name" error={errors.name?.message}>
          <input className={inputClass} autoComplete="name" {...register("name")} />
        </Field>
        <Field label="Work email" error={errors.email?.message}>
          <input className={inputClass} type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Role" error={errors.role?.message}>
          <select className={inputClass} {...register("role")}>
            <option value="analyst">Analyst</option>
            <option value="security-operator">Security operator</option>
            <option value="soc-analyst">SOC analyst</option>
            <option value="fraud-analyst">Fraud analyst</option>
            <option value="incident-manager">Incident manager</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
        </Field>
        <Field label="Password" error={errors.password?.message} hint="Minimum 12 characters with upper, lower, number, and symbol.">
          <div className="relative">
            <input className={`${inputClass} pr-12`} type={showPassword ? "text" : "password"} autoComplete="new-password" {...register("password")} />
            <IconButton label={showPassword ? "Hide secret" : "Reveal secret"} className="absolute right-1 top-1 h-9 w-9 border-0 bg-transparent" onClick={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </IconButton>
          </div>
        </Field>
        <Field label="Confirm password" error={errors.confirmPassword?.message}>
          <input className={inputClass} type="password" autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
        <Field label="Admin registration key" error={errors.adminRegistrationKey?.message} hint="Required only when your backend policy demands it.">
          <input className={inputClass} autoComplete="off" {...register("adminRegistrationKey")} />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button className="w-full" type="submit" disabled={submitting}>
          <UserPlus className="h-4 w-4" />
          {submitting ? "Creating account" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
