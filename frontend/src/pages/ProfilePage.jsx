import { Save, UserCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Card, Field, PageHeader, inputClass } from "../components/ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { profileSchema, validateWithSchema } from "../utils/validation";

export default function ProfilePage() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError
  } = useForm({ defaultValues: { name: user?.name || "", email: user?.email || "" } });

  const onSubmit = (values) => {
    const validation = validateWithSchema(profileSchema, values);
    if (Object.keys(validation.errors).length) {
      Object.entries(validation.errors).forEach(([field, message]) => setError(field, { message }));
      return;
    }
    setSaved(true);
  };

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader icon={UserCircle} eyebrow="Account" title="Profile" description="View account identity and edit profile fields once backend profile endpoints are available." />
      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-5">
          <div className="grid h-16 w-16 place-items-center rounded-xl bg-cyan-50 text-xl font-black text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
            {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <h2 className="mt-4 text-xl font-black">{user?.name || "Security user"}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{user?.email}</p>
          <p className="mt-3 inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-black uppercase text-slate-700 dark:bg-white/10 dark:text-slate-200">
            {user?.role || "role pending"}
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="text-lg font-black">Edit profile</h2>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="Name" error={errors.name?.message}>
              <input className={inputClass} autoComplete="name" {...register("name")} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input className={inputClass} type="email" autoComplete="email" {...register("email")} />
            </Field>
            {saved ? <Alert tone="success">Profile changes validated locally. Connect a backend profile update endpoint to persist them.</Alert> : null}
            <Button type="submit">
              <Save className="h-4 w-4" />
              Save profile
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
