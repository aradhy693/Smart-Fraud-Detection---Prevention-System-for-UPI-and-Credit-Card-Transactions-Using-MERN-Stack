import { z } from "zod";

const strongPassword = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use fewer than 128 characters.")
  .regex(/[A-Z]/, "Add an uppercase letter.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[0-9]/, "Add a number.")
  .regex(/[^A-Za-z0-9]/, "Add a symbol.");

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid work email."),
  password: z.string().min(1, "Password is required.")
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name."),
    email: z.string().trim().email("Enter a valid work email."),
    password: strongPassword,
    confirmPassword: z.string(),
    role: z.enum(["admin", "analyst", "security-operator", "soc-analyst", "fraud-analyst", "incident-manager", "viewer", "user"]),
    adminRegistrationKey: z.string().optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid work email.")
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(8, "Enter the reset token from your email."),
    password: strongPassword,
    confirmPassword: z.string()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().email("Enter a valid email.")
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: strongPassword,
    confirmPassword: z.string()
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export const validateWithSchema = (schema, values) => {
  const result = schema.safeParse(values);
  if (result.success) return { values: result.data, errors: {} };

  return {
    values,
    errors: result.error.issues.reduce((accumulator, issue) => {
      accumulator[issue.path[0]] = issue.message;
      return accumulator;
    }, {})
  };
};
