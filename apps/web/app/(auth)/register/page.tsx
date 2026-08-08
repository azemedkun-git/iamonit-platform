"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { clearCurrentAuthUser, establishAuthSession } from "../../../lib/auth";
import { register } from "../../../lib/api";

type FieldErrors = {
  fullName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{6,14}$/;
const phoneFormatError =
  "Enter a phone number in international format, e.g. +14694681177.";

function getPasswordError(password: string) {
  if (!password) {
    return "Create a password.";
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return undefined;
}

function getConfirmPasswordError(confirmPassword: string, password: string) {
  if (!confirmPassword) {
    return "Confirm your password.";
  }

  if (confirmPassword !== password) {
    return "Passwords do not match.";
  }

  return undefined;
}

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate() {
    const nextErrors: FieldErrors = {};

    if (!fullName.trim()) {
      nextErrors.fullName = "Enter your full name.";
    }

    if (!companyName.trim()) {
      nextErrors.companyName = "Enter your company name.";
    }

    if (!email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (!emailPattern.test(email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!phone.trim()) {
      nextErrors.phone = "Enter your phone number.";
    } else if (!phonePattern.test(phone.trim())) {
      nextErrors.phone = phoneFormatError;
    }

    const passwordError = getPasswordError(password);
    if (passwordError) {
      nextErrors.password = passwordError;
    }

    const confirmPasswordError = getConfirmPasswordError(
      confirmPassword,
      password,
    );
    if (confirmPasswordError) {
      nextErrors.confirmPassword = confirmPasswordError;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function clearError(field: keyof FieldErrors) {
    setFormError(null);

    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setFormError(null);
    setConfirmationRequired(false);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await register({
        email: email.trim(),
        password,
        companyName: companyName.trim(),
        fullName: fullName.trim(),
        phone: phone.trim(),
      });
      if (!response.session && response.requiresEmailConfirmation) {
        clearCurrentAuthUser();
        setConfirmationRequired(true);
        return;
      }
      if (!response.session) {
        throw new Error("Authentication could not be completed. Please try again.");
      }
      await establishAuthSession(response);
      router.replace("/");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Authentication could not be completed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClassName =
    "mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-100";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-950">
      <section
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        aria-labelledby="register-heading"
      >
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-700">
            IAMONIT
          </p>
          <h1 id="register-heading" className="text-3xl font-bold tracking-tight">
            Create your account
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Tell us about yourself and how you will use IAMONIT.
          </p>
        </div>

        {formError ? (
          <div
            className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {formError}
          </div>
        ) : null}

        {confirmationRequired ? (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status">
            Check your email and confirm your account before signing in. Then go to{" "}
            <Link href="/login" className="font-semibold underline">the login page</Link>.
          </div>
        ) : null}

        <form
          className="space-y-5"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSubmitting}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="full-name" className="block text-sm font-medium text-slate-800">
                Full name
              </label>
              <input
                id="full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  clearError("fullName");
                }}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? "full-name-error" : undefined}
                disabled={isSubmitting}
                className={inputClassName}
              />
              {errors.fullName ? (
                <p id="full-name-error" className="mt-2 text-sm text-red-700" role="alert">
                  {errors.fullName}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="company-name" className="block text-sm font-medium text-slate-800">
                Company name
              </label>
              <input
                id="company-name"
                name="companyName"
                type="text"
                autoComplete="organization"
                value={companyName}
                onChange={(event) => {
                  setCompanyName(event.target.value);
                  clearError("companyName");
                }}
                aria-invalid={Boolean(errors.companyName)}
                aria-describedby={errors.companyName ? "company-name-error" : undefined}
                disabled={isSubmitting}
                className={inputClassName}
              />
              {errors.companyName ? (
                <p id="company-name-error" className="mt-2 text-sm text-red-700" role="alert">
                  {errors.companyName}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-800">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearError("email");
                }}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                disabled={isSubmitting}
                className={inputClassName}
              />
              {errors.email ? (
                <p id="email-error" className="mt-2 text-sm text-red-700" role="alert">
                  {errors.email}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-800">
                Phone number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  clearError("phone");
                }}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "phone-error" : undefined}
                disabled={isSubmitting}
                className={inputClassName}
              />
              {errors.phone ? (
                <p id="phone-error" className="mt-2 text-sm text-red-700" role="alert">
                  {errors.phone}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-800">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                const nextPassword = event.target.value;
                setPassword(nextPassword);
                setFormError(null);
                setErrors((current) => ({
                  ...current,
                  password: current.password
                    ? getPasswordError(nextPassword)
                    : undefined,
                  confirmPassword:
                    confirmPassword || current.confirmPassword
                      ? getConfirmPasswordError(confirmPassword, nextPassword)
                      : undefined,
                }));
              }}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
              disabled={isSubmitting}
              className={inputClassName}
            />
            {errors.password ? (
              <p id="password-error" className="mt-2 text-sm text-red-700" role="alert">
                {errors.password}
              </p>
            ) : (
              <p id="password-hint" className="mt-2 text-sm text-slate-600">
                Use at least 8 characters.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-slate-800"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => {
                const nextConfirmPassword = event.target.value;
                setConfirmPassword(nextConfirmPassword);
                setFormError(null);
                setErrors((current) => ({
                  ...current,
                  confirmPassword: getConfirmPasswordError(
                    nextConfirmPassword,
                    password,
                  ),
                }));
              }}
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={
                errors.confirmPassword ? "confirm-password-error" : undefined
              }
              disabled={isSubmitting}
              className={inputClassName}
            />
            {errors.confirmPassword ? (
              <p
                id="confirm-password-error"
                className="mt-2 text-sm text-red-700"
                role="alert"
              >
                {errors.confirmPassword}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
