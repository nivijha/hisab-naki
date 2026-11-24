'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mic } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { VERIFIED_SIGNUP_KEY } from '@/lib/signup-api';
import { normalizeLoginIdentifier } from '@/lib/auth-identifier';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';

function loginError(error: unknown) {
  if (!(error instanceof ApiError)) return 'Sign-in could not be completed. Please try again.';
  if (error.status === 400) return 'Enter a valid email or phone number and password.';
  if (error.status === 401) return 'That email/phone and password do not match.';
  if (error.status === 403) return 'This account cannot sign in right now. Contact your business administrator.';
  if (error.status === 429) return 'Too many sign-in attempts. Please wait a little before trying again.';
  if (error.status && error.status >= 500) return 'HisabNaki is temporarily unavailable. Please try again later.';
  if (error.kind === 'network') return 'Could not connect to HisabNaki. Check your connection and try again.';
  if (error.kind === 'invalid-response') return 'HisabNaki returned an invalid sign-in response. Please try again later.';
  return error.message;
}

export default function LoginPage() {
  const { status, login, logout, selectedBusiness } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [signupVerified, setSignupVerified] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const submitLock = useRef(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(VERIFIED_SIGNUP_KEY) === 'true') {
        window.sessionStorage.removeItem(VERIFIED_SIGNUP_KEY);
        setFeedback('Phone verified. Sign in with your phone number and password to continue.');
        setSignupVerified(true);
      }
    } catch { /* Sign-in remains available when storage is restricted. */ }
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || !identifier.trim() || !password) {
      if (!identifier.trim() || !password) setFeedback('Enter your email or phone number and password.');
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setFeedback('');
    setSignupVerified(false);
    try {
      await login(normalizeLoginIdentifier(identifier), password);
      setPassword('');
      router.replace('/business/select');
    } catch (error) {
      setFeedback(loginError(error));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (status === 'loading') {
    return <main className="grid min-h-screen place-items-center bg-beige px-5 text-forest"><p role="status">Checking sign-in…</p></main>;
  }

  return (
    <main className="min-h-screen bg-beige px-5 py-10 text-forest sm:grid sm:place-items-center sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mx-auto flex min-h-11 w-fit items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest" aria-label="HisabNaki home">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple"><Mic aria-hidden="true" className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight">HisabNaki</span>
        </Link>

        <section className="mt-8 rounded-xl border border-forest/10 bg-beige-light p-5 shadow-sm sm:p-8" aria-labelledby="login-heading">
          {status === 'authenticated' ? (
            <>
              <h1 id="login-heading" className="text-2xl font-semibold tracking-tight">You’re signed in</h1>
              <p className="mt-3 text-sm text-muted">Your sign-in is active in this tab only.</p>
              <p role="status" className="mt-4 rounded-lg border border-forest/10 bg-beige p-3 text-sm">{selectedBusiness ? `${selectedBusiness.businessName} is selected.` : 'Choose a business before opening dashboard data.'}</p>
              <Link href={selectedBusiness ? '/dashboard' : '/business/select'} className="mt-5 flex min-h-11 w-full items-center justify-center rounded-sm bg-purple px-4 text-sm font-medium text-forest-dark shadow-sm hover:bg-beige focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
                {selectedBusiness ? 'Open selected business' : 'Choose a business'}
              </Link>
              {logoutError && <p role="alert" className="mt-4 rounded-md border border-forest/15 bg-beige p-3 text-sm">{logoutError}</p>}
              <Button type="button" className="mt-6 w-full" onClick={() => {
                if (logout()) setFeedback('You have been signed out.');
                else setLogoutError('A transaction is pending or its result is uncertain. Do not repeat it; sign-out is blocked until the operation is safe to leave.');
              }}>Log out</Button>
            </>
          ) : (
            <>
              <h1 id="login-heading" className="text-2xl font-semibold tracking-tight">Sign in to HisabNaki</h1>
              <p className="mt-2 text-sm text-muted">Use the email or phone number linked to your account.</p>

              <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
                <div>
                  <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium">Email or phone number</label>
                  <input id="identifier" name="identifier" type="text" autoComplete="username" required value={identifier} onChange={event => setIdentifier(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" placeholder="name@example.com or phone" aria-describedby={feedback ? 'login-feedback' : undefined} />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium">Password</label>
                  <div className="relative">
                    <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white py-2 pl-3 pr-12 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" aria-describedby={feedback ? 'login-feedback' : undefined} />
                    <button type="button" className="absolute inset-y-0 right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-md text-forest hover:bg-beige focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-forest" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
                      {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {feedback && <p id="login-feedback" role={signupVerified ? 'status' : 'alert'} className="rounded-md border border-forest/15 bg-beige p-3 text-sm text-forest">{feedback}</p>}

                <Button type="submit" disabled={submitting} className="w-full" aria-busy={submitting}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted">
                New to HisabNaki? <Link href="/signup" className="font-medium text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Create an account</Link>.
              </p>
            </>
          )}
        </section>
        <Link href="/" className="mx-auto mt-5 flex min-h-11 w-fit items-center px-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to site</Link>
      </div>
    </main>
  );
}
