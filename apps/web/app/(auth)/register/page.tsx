import Link from 'next/link';

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-950">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="register-heading">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-blue-700">IAMONIT</p>
        <h1 id="register-heading" className="text-3xl font-bold tracking-tight">Choose your account type</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Start a transporter company or create an independent car-puller account.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/register/transporter" className="rounded-xl border border-blue-200 bg-blue-50 p-6 font-semibold text-blue-800 hover:border-blue-500">Sign Up as a Transporter</Link>
          <Link href="/register/car-puller" className="rounded-xl border border-slate-200 p-6 font-semibold text-slate-800 hover:border-blue-500">Sign Up as a Car Puller</Link>
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">Already have an account? <Link href="/login" className="font-semibold text-blue-700 hover:underline">Sign in</Link></p>
      </section>
    </main>
  );
}
