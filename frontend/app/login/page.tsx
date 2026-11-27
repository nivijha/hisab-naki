'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mic, Lock, Mail, Smartphone } from 'lucide-react';
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
  if (error.kind === 'timeout') return 'Sign-in timed out. Your details are still here. Please try again.';
  if (error.kind === 'network') return 'Could not connect to HisabNaki. Check your connection and try again.';
  if (error.kind === 'invalid-response') return 'HisabNaki returned an invalid sign-in response. Please try again later.';
  return error.message;
}

function InputWithIcon({
  icon: Icon,
  iconAlt,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ElementType; iconAlt: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-forest/50" aria-hidden="true">
        <Icon className="h-5 w-5" />
      </div>
      <input
        {...props}
        className={`
          min-h-11 w-full rounded-md border bg-white px-10 pl-10 py-2 text-base text-forest
          placeholder:text-muted
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest
          transition-colors duration-150
          ${props['aria-invalid'] ? 'border-forest/60' : 'border-forest/20'}
          ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      />
    </div>
  );
}

export default function LoginPage() {
  const { status, login, logout, selectedBusiness } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [invalidField, setInvalidField] = useState<'identifier' | 'password' | ''>('');
  const [signupVerified, setSignupVerified] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const loginRequest = useRef<AbortController | null>(null);

  useEffect(() => () => {
    const request = loginRequest.current;
    loginRequest.current = null;
    request?.abort();
  }, []);

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
    if (loginRequest.current) return;
    if (!identifier.trim() || !password) {
      const field = !identifier.trim() ? 'identifier' : 'password';
      setInvalidField(field);
      setSignupVerified(false);
      setFeedback(field === 'identifier' ? 'Enter your email or phone number.' : 'Enter your password.');
      window.requestAnimationFrame(() => document.getElementById(field)?.focus());
      return;
    }

    const controller = new AbortController();
    loginRequest.current = controller;
    setSubmitting(true);
    setInvalidField('');
    setFeedback('');
    setSignupVerified(false);
    try {
      await login(normalizeLoginIdentifier(identifier), password, controller.signal);
      if (controller.signal.aborted) return;
      setPassword('');
      router.replace('/business/select');
    } catch (error) {
      if (!controller.signal.aborted) setFeedback(loginError(error));
    } finally {
      if (loginRequest.current === controller) {
        loginRequest.current = null;
        setSubmitting(false);
      }
    }
  };

  if (status === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-beige px-5 text-forest">
        <div className="flex flex-col items-center gap-4" role="status">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forest/10">
            <Mic className="h-6 w-6 text-forest" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted">Checking sign-in…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-beige px-5 py-10 text-forest sm:grid sm:place-items-center sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="mx-auto flex min-h-12 w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
          aria-label="HisabNaki home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple">
            <Mic aria-hidden="true" className="h-6 w-6 text-forest" />
          </span>
          <span className="text-xl font-bold tracking-tight text-forest">HisabNaki</span>
        </Link>

        <section className="mt-10 rounded-xl border border-forest/10 bg-white p-6 shadow-soft sm:p-8" aria-labelledby="login-heading">
          {status === 'authenticated' ? (
            <>
              <div className="text-center mb-6">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
                  <Lock className="h-7 w-7 text-forest" aria-hidden="true" />
                </div>
                <h1 id="login-heading" className="text-2xl font-semibold tracking-tight text-forest">You&apos;re signed in</h1>
                <p className="mt-2 text-sm text-muted">Your sign-in is active in this tab only.</p>
              </div>

              <div className="mb-6 rounded-lg border border-forest/10 bg-beige p-4 text-sm text-center">
                {selectedBusiness ? (
                  <>
                    <span className="font-medium text-forest">{selectedBusiness.businessName}</span>
                    <span className="text-muted"> is selected.</span>
                  </>
                ) : (
                  'Choose a business before opening dashboard data.'
                )}
              </div>

              <Link
                href={selectedBusiness ? '/dashboard' : '/business/select'}
                className="block min-h-11 w-full rounded-md bg-purple px-4 py-2.5 text-center text-sm font-medium text-forest-dark shadow-sm hover:bg-purple-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors"
              >
                {selectedBusiness ? 'Open selected business' : 'Choose a business'}
              </Link>

              {logoutError && (
                <p role="alert" className="mt-4 rounded-md border border-forest/20 bg-beige-light p-3 text-sm text-forest">
                  {logoutError}
                </p>
              )}

              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={async () => {
                  setLogoutError('');
                  const ok = await logout();
                  if (ok) setFeedback('You have been signed out.');
                  else setLogoutError('A transaction is pending or its result is uncertain. Do not repeat it; sign-out is blocked until the operation is safe to leave.');
                }}
              >
                Log out
              </Button>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
                  <Lock className="h-7 w-7 text-forest" aria-hidden="true" />
                </div>
                <h1 id="login-heading" className="text-2xl font-semibold tracking-tight text-forest">Sign in to HisabNaki</h1>
                <p className="mt-2 text-sm text-muted">Use the email or phone number linked to your account.</p>
              </div>

              <form className="space-y-5" aria-labelledby="login-heading" onSubmit={submit} noValidate>
                <div>
                  <label htmlFor="identifier" className="mb-2 block text-sm font-medium text-forest">
                    Email or phone number
                  </label>
                  <InputWithIcon
                    id="identifier"
                    name="identifier"
                    type="text"
                    icon={Mail}
                    iconAlt="Email"
                    autoComplete="username"
                    required
                    value={identifier}
                    onChange={event => setIdentifier(event.target.value)}
                    placeholder="name@example.com or phone"
                    aria-invalid={invalidField === 'identifier' || undefined}
                    aria-describedby={feedback ? 'login-feedback' : undefined}
                    disabled={submitting}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-forest">
                    Password
                  </label>
                  <div className="relative">
                    <InputWithIcon
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      icon={Lock}
                      iconAlt="Password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      aria-invalid={invalidField === 'password' || undefined}
                      aria-describedby={invalidField === 'password' ? 'login-feedback' : undefined}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center pr-3 text-forest/60 hover:text-forest focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-forest rounded-r-md transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(value => !value)}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {feedback && (
                  <p
                    id="login-feedback"
                    role={invalidField ? undefined : signupVerified ? 'status' : 'alert'}
                    className={`
                      rounded-md border p-3 text-sm leading-5
                      ${invalidField
                        ? 'border-forest/30 bg-red-50 text-red-800'
                        : signupVerified
                        ? 'border-forest/15 bg-green-50 text-green-800'
                        : 'border-forest/15 bg-beige-light text-forest'}
                    `}
                  >
                    {feedback}
                  </p>
                )}

                <Button type="submit" disabled={submitting} className="w-full" aria-busy={submitting}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted">
                New to HisabNaki?{' '}
                <Link href="/signup" className="font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors">
                  Create an account
                </Link>
                .
              </p>
            </>
          )}
        </section>

        <Link
          href="/"
          className="mx-auto mt-6 flex min-h-11 w-fit items-center px-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors"
        >
          Back to site
        </Link>
      </div>
    </main>
  );
}