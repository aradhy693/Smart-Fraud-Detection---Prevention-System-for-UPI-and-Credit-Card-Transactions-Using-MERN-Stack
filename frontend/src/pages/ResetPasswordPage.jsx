import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import AuthShell from "../components/AuthShell.jsx";
import { Alert, Button, Field, inputClass } from "../components/ui.jsx";
import { resetPasswordSchema, validateWithSchema } from "../utils/validation";

export default function ResetPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError
  } = useForm({ defaultValues: { token: "", password: "", confirmPassword: "" } });

  const onSubmit = (values) => {
    const validation = validateWithSchema(resetPasswordSchema, values);
    if (Object.keys(validation.errors).length) {
      Object.entries(validation.errors).forEach(([field, message]) => setError(field, { message }));
      return;
    }
    setSubmitted(true);
  };

  return (
    <AuthShell eyebrow="Password reset" title="Set a new password" subtitle="UI is ready; connect it once the backend reset endpoint exists.">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Reset token" error={errors.token?.message}>
          <input className={inputClass} autoComplete="one-time-code" {...register("token")} />
        </Field>
        <Field label="New password" error={errors.password?.message}>
          <input className={inputClass} type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message}>
          <input className={inputClass} type="password" autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
        {submitted ? <Alert tone="success">New password validated locally. Backend reset API can be attached here.</Alert> : null}
        <Button className="w-full" type="submit">
          <KeyRound className="h-4 w-4" />
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
