'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mic } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { PENDING_SIGNUP_PHONE_KEY, VERIFIED_SIGNUP_KEY, resendSignupCode, verifySignupCode } from '@/lib/signup-api';
import { Button } from '@/components/ui/button';

function verificationMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'We could not verify this code. Try again.';
  if (error.status === 400) return 'This code is incorrect, expired, or out of attempts. Request a new code and try again.';
  if (error.status === 429) return 'Too many verification attempts. Please wait before trying again.';
  if (error.status === 503 || (error.status !== undefined && error.status >= 500)) return 'Phone verification is temporarily unavailable.';
  if (error.kind === 'network' || error.kind === 'aborted' || error.kind === 'invalid-response') return 'We could not confirm the verification result. Your account may already be verified. Try signing in; if that does not work, request a new code.';
  return error.message;
}

export default function SignupVerificationPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isError, setIsError] = useState(false);
  const submitLock = useRef(false);
  const resendLock = useRef(false);

  useEffect(() => {
    try {
      const savedPhone = window.sessionStorage.getItem(PENDING_SIGNUP_PHONE_KEY);
      if (savedPhone) setPhone(savedPhone);
    } catch { /* The phone can be entered again if session storage is unavailable. */ }
  }, []);

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    const normalizedPhone = phone.trim();
    const normalizedCode = code.trim();
    if (!normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
      setIsError(true);
      setFeedback('Enter the phone number used for signup and the 6-digit code.');
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setFeedback('');
    setIsError(false);
    try {
      await verifySignupCode(normalizedPhone, normalizedCode, AbortSignal.timeout(20_000));
      try {
        window.sessionStorage.removeItem(PENDING_SIGNUP_PHONE_KEY);
        window.sessionStorage.setItem(VERIFIED_SIGNUP_KEY, 'true');
      } catch { /* Verification is complete; navigation still proceeds. */ }
      router.replace('/login');
    } catch (error) {
      setIsError(true);
      setFeedback(verificationMessage(error));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (resendLock.current) return;
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) {
      setIsError(true);
      setFeedback('Enter the phone number used for signup first.');
      return;
    }
    resendLock.current = true;
    setResending(true);
    setFeedback('');
    setIsError(false);
    try {
      const message = await resendSignupCode(normalizedPhone, AbortSignal.timeout(20_000));
      try { window.sessionStorage.setItem(PENDING_SIGNUP_PHONE_KEY, normalizedPhone); } catch { /* Keep current form state. */ }
      setFeedback(message);
    } catch (error) {
      setIsError(true);
      setFeedback(error instanceof ApiError && error.status === 429
        ? 'Too many code requests. Please wait before requesting another.'
        : error instanceof ApiError && error.kind === 'network'
          ? 'Could not contact HisabNaki. Check your connection and try again.'
          : error instanceof ApiError && error.status === 503
            ? 'Phone verification is temporarily unavailable. Try again later.'
            : error instanceof ApiError ? error.message : 'Could not request a new code. Please try again.');
    } finally {
      resendLock.current = false;
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen bg-beige px-5 py-10 text-forest sm:grid sm:place-items-center sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mx-auto flex min-h-11 w-fit items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest" aria-label="HisabNaki home">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple"><Mic aria-hidden="true" className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight">HisabNaki</span>
        </Link>

        <section className="mt-8 rounded-xl border border-forest/10 bg-beige-light p-5 shadow-sm sm:p-8" aria-labelledby="verify-heading">
          <h1 id="verify-heading" className="text-2xl font-semibold tracking-tight">Verify your phone</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Enter the six-digit code sent to your phone. After verification, sign in with your phone number and password.</p>

          <form className="mt-6 space-y-5" onSubmit={verify} noValidate>
            <div>
              <label htmlFor="verify-phone" className="mb-1.5 block text-sm font-medium">Phone number</label>
              <input id="verify-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={event => setPhone(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
            </div>
            <div>
              <label htmlFor="verify-code" className="mb-1.5 block text-sm font-medium">6-digit verification code</label>
              <input id="verify-code" name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base tracking-[0.2em] text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" aria-describedby={feedback ? 'verification-feedback' : undefined} />
            </div>

            {feedback && <p id="verification-feedback" role={isError ? 'alert' : 'status'} className="rounded-md border border-forest/15 bg-beige p-3 text-sm leading-5 text-forest">{feedback}</p>}

            <Button type="submit" disabled={submitting} className="w-full" aria-busy={submitting}>{submitting ? 'Verifying…' : 'Verify phone'}</Button>
          </form>

          <Button type="button" variant="outline" className="mt-3 w-full" disabled={resending || submitting} aria-busy={resending} onClick={() => { void resend(); }}>
            {resending ? 'Requesting code…' : 'Resend code'}
          </Button>
          <p className="mt-5 text-center text-sm text-muted">Already verified? <Link href="/login" className="font-medium text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Sign in</Link></p>
          <p className="mt-2 text-center text-sm text-muted">Need to start again? <Link href="/signup" className="font-medium text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to signup</Link></p>
        </section>
        <Link href="/" className="mx-auto mt-5 flex min-h-11 w-fit items-center px-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to site</Link>
      </div>
    </main>
  );
}
