'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useRef, useState } from 'react';
import { establishAuthSession, selectMembership } from '../../../lib/auth';
import { loginMultiTenant } from '../../../lib/api';
import type { MembershipSummary } from '../../../lib/auth.types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const submitting = useRef(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [choices, setChoices] = useState<MembershipSummary[] | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.'; else if (!emailPattern.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.'; else if (password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next); if (Object.keys(next).length) return;
    submitting.current = true; setIsSubmitting(true); setFormError(null);
    try {
      const response = await loginMultiTenant({ email: email.trim(), password });
      if (!response.session || response.requiresEmailConfirmation) throw new Error('Authentication could not be completed. Please try again.');
      await establishAuthSession(response);
      if (response.memberships.length > 1 && response.selectedMembership === null) setChoices(response.memberships);
      else router.replace('/');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Authentication could not be completed. Please try again.'); }
    finally { submitting.current = false; setIsSubmitting(false); }
  }

  function choose(membership: MembershipSummary) {
    if (choices?.includes(membership) && selectMembership(membership)) router.replace('/');
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-950"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-700">IAMONIT</p><h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
    {formError && <div className="my-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{formError}</div>}
    {choices ? <div className="mt-8" aria-labelledby="membership-heading"><h2 id="membership-heading" className="text-xl font-semibold">Choose a company</h2><div className="mt-4 space-y-3">{choices.map((membership) => <button key={membership.membershipId} type="button" onClick={() => choose(membership)} className="w-full rounded-lg border border-slate-300 p-4 text-left hover:border-blue-600"><span className="block font-semibold">{membership.tenantName}</span><span className="text-sm text-slate-600">{membership.role}</span></button>)}</div></div> : <form className="mt-8 space-y-5" onSubmit={submit} noValidate aria-busy={isSubmitting}>
      <div><label htmlFor="email" className="block text-sm font-medium">Email address</label><input id="email" type="email" value={email} disabled={isSubmitting} onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined })); }} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5" />{errors.email && <p role="alert" className="mt-2 text-sm text-red-700">{errors.email}</p>}</div>
      <div><label htmlFor="password" className="block text-sm font-medium">Password</label><input id="password" type="password" value={password} disabled={isSubmitting} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })); }} className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5" />{errors.password && <p role="alert" className="mt-2 text-sm text-red-700">{errors.password}</p>}</div>
      <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
    </form>}
    {!choices && <p className="mt-6 text-center text-sm text-slate-600">Don&apos;t have an account? <Link href="/register" className="font-semibold text-blue-700 hover:underline">Create one</Link></p>}
  </section></main>;
}
