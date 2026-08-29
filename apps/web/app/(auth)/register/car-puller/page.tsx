'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useRef, useState } from 'react';
import { clearCurrentAuthState, establishAuthSession } from '../../../../lib/auth';
import { registerCarPuller } from '../../../../lib/api';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{6,14}$/;
type Fields = 'fullName' | 'email' | 'phone' | 'password' | 'confirmPassword';
type Errors = Partial<Record<Fields, string>>;

export default function CarPullerRegistrationPage() {
  const router = useRouter();
  const submitting = useRef(false);
  const [values, setValues] = useState<Record<Fields, string>>({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update(field: Fields, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined })); setFormError(null);
  }
  function validate() {
    const next: Errors = {};
    if (!values.fullName.trim()) next.fullName = 'Enter your full name.';
    if (!values.email.trim()) next.email = 'Enter your email address.';
    else if (!emailPattern.test(values.email.trim())) next.email = 'Enter a valid email address.';
    if (!values.phone.trim()) next.phone = 'Enter your phone number.';
    else if (!phonePattern.test(values.phone.trim())) next.phone = 'Enter a phone number in international format, e.g. +14694681177.';
    if (!values.password) next.password = 'Create a password.';
    else if (values.password.length < 8) next.password = 'Password must be at least 8 characters.';
    if (!values.confirmPassword) next.confirmPassword = 'Confirm your password.';
    else if (values.confirmPassword !== values.password) next.confirmPassword = 'Passwords do not match.';
    setErrors(next); return Object.keys(next).length === 0;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current || !validate()) return;
    submitting.current = true; setIsSubmitting(true); setFormError(null); setConfirmationRequired(false);
    try {
      const response = await registerCarPuller({ email: values.email.trim(), password: values.password, fullName: values.fullName.trim(), phone: values.phone.trim() });
      if (!response.session && response.requiresEmailConfirmation) { clearCurrentAuthState(); setConfirmationRequired(true); return; }
      if (!response.session) throw new Error('Authentication could not be completed. Please try again.');
      await establishAuthSession(response); router.replace('/');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Authentication could not be completed. Please try again.'); }
    finally { submitting.current = false; setIsSubmitting(false); }
  }
  const field = (name: Fields, label: string, type = 'text') => <div><label htmlFor={name} className="block text-sm font-medium text-slate-800">{label}</label><input id={name} name={name} type={type} value={values[name]} disabled={isSubmitting} onChange={(event) => update(name, event.target.value)} aria-invalid={Boolean(errors[name])} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100" />{errors[name] && <p className="mt-2 text-sm text-red-700" role="alert">{errors[name]}</p>}</div>;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-950"><section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-700">IAMONIT</p><h1 className="text-3xl font-bold tracking-tight">Create a car-puller account</h1>
    {formError && <div className="my-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{formError}</div>}
    {confirmationRequired && <div className="my-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="status">Check your email and confirm your account before signing in. Then go to <Link href="/login" className="font-semibold underline">the login page</Link>.</div>}
    <form className="mt-8 space-y-5" onSubmit={submit} noValidate aria-busy={isSubmitting}>
      {field('fullName', 'Full name')}{field('email', 'Email address', 'email')}{field('phone', 'Phone number', 'tel')}{field('password', 'Password', 'password')}{field('confirmPassword', 'Confirm password', 'password')}
      <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">{isSubmitting ? 'Creating account…' : 'Create account'}</button>
    </form>
  </section></main>;
}
