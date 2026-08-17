import { Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import AuthShell from "../components/AuthShell.jsx";
import { Alert, Button, Field, inputClass } from "../components/ui.jsx";
import { emailSchema, validateWithSchema } from "../utils/validation";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError
  } = useForm({ defaultValues: { email: "" } });

  const onSubmit = (values) => {
    const validation = validateWithSchema(emailSchema, values);
    if (Object.keys(validation.errors).length) {
      Object.entries(validation.errors).forEach(([field, message]) => setError(field, { message }));
      return;
    }
    setSubmitted(true);
  };

  return (
    <AuthShell eyebrow="Account recovery" title="Request password reset" subtitle="The backend does not currently expose a reset request endpoint, so this polished UI is ready for connection.">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Field label="Work email" error={errors.email?.message}>
          <input className={inputClass} type="email" autoComplete="email" {...register("email")} />
        </Field>
        {submitted ? <Alert tone="success">Reset request captured in the UI. Connect a backend endpoint to send email instructions.</Alert> : null}
        <Button className="w-full" type="submit">
          <Mail className="h-4 w-4" />
          Send reset instructions
        </Button>
      </form>
    </AuthShell>
  );
}
