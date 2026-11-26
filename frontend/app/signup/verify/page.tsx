'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mic } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { PENDING_SIGNUP_PHONE_KEY, VERIFIED_SIGNUP_KEY, resendSignupCode, verifySignupCode } from '@/lib/signup-api';
import { Button } from '@/components/ui/button';

const RESEND_COOLDOWN_MS = 60_000;
const RESEND_COOLDOWN_KEY = 'hisabnaki:signup:resend-after';

function verificationMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'We could not verify this code. Try again.';
  if (error.status === 400) return 'This code is incorrect, expired, or out of attempts. Request a new code and try again.';
  if (error.status === 429) return 'Too many verification attempts. Please wait before trying again.';
  if (error.status === 503) return 'Phone verification is temporarily unavailable. You can request another code when service returns.';
  if ((error.status !== undefined && error.status >= 500)
    || error.kind === 'network' || error.kind === 'timeout' || error.kind === 'aborted' || error.kind === 'invalid-response') {
    return 'We could not confirm whether verification completed. Your account may already be verified. Try signing in; if sign-in does not work, return here and request a new code.';
  }
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
  const [invalidField, setInvalidField] = useState('');
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const submitLock = useRef(false);
  const resendLock = useRef(false);

  const showFieldError = (id: string, message: string) => {
    setInvalidField(id);
    setIsError(true);
    setFeedback(message);
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  const beginResendCooldown = () => {
    const cooldownUntil = Date.now() + RESEND_COOLDOWN_MS;
    setResendCooldownSeconds(Math.ceil(RESEND_COOLDOWN_MS / 1000));
    try { window.sessionStorage.setItem(RESEND_COOLDOWN_KEY, String(cooldownUntil)); }
    catch { /* The server rate limit remains authoritative if storage is unavailable. */ }
  };

  useEffect(() => {
    try {
      const savedPhone = window.sessionStorage.getItem(PENDING_SIGNUP_PHONE_KEY);
      if (savedPhone) setPhone(savedPhone);
    } catch { /* The phone can be entered again if session storage is unavailable. */ }

    let timer: number | undefined;
    const updateCooldown = () => {
      let until = 0;
      try { until = Number(window.sessionStorage.getItem(RESEND_COOLDOWN_KEY)) || 0; } catch { /* Cooldown remains local to this page session. */ }
      const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setResendCooldownSeconds(seconds);
      if (seconds > 0 && timer === undefined) timer = window.setInterval(updateCooldown, 1000);
      if (seconds === 0) {
        if (timer !== undefined) window.clearInterval(timer);
        timer = undefined;
        try { window.sessionStorage.removeItem(RESEND_COOLDOWN_KEY); } catch { /* The client throttle is best effort; the server remains authoritative. */ }
      }
    };
    updateCooldown();
    return () => { if (timer !== undefined) window.clearInterval(timer); };
  }, []);

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    const normalizedPhone = phone.trim();
    const normalizedCode = code.trim();
    if (!normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
      if (!normalizedPhone) showFieldError('verify-phone', 'Enter the phone number used for signup.');
      else showFieldError('verify-code', 'Enter the 6-digit verification code.');
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setInvalidField('');
    setFeedback('');
    setIsError(false);
    try {
      await verifySignupCode(normalizedPhone, normalizedCode, AbortSignal.timeout(20_000));
      try {
        window.sessionStorage.removeItem(PENDING_SIGNUP_PHONE_KEY);
        window.sessionStorage.setItem(VERIFIED_SIGNUP_KEY, 'true');
        window.sessionStorage.removeItem(RESEND_COOLDOWN_KEY);
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
    if (resendLock.current || submitLock.current || resendCooldownSeconds > 0) return;
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) {
      showFieldError('verify-phone', 'Enter the phone number used for signup first.');
      return;
    }
    resendLock.current = true;
    setResending(true);
    setInvalidField('');
    setFeedback('');
    setIsError(false);
    try {
      const message = await resendSignupCode(normalizedPhone, AbortSignal.timeout(20_000));
      beginResendCooldown();
      try {
        window.sessionStorage.setItem(PENDING_SIGNUP_PHONE_KEY, normalizedPhone);
      } catch { /* The server rate limit remains authoritative if storage is unavailable. */ }
      setFeedback(message);
    } catch (error) {
      setIsError(true);
      const uncertainDelivery = error instanceof ApiError
        && (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'aborted' || error.kind === 'invalid-response'
          || (error.status !== undefined && error.status >= 500 && error.status !== 503));
      if (uncertainDelivery) beginResendCooldown();
      setFeedback(error instanceof ApiError && error.status === 429
        ? 'Too many code requests. Please wait before requesting another.'
        : uncertainDelivery
          ? 'We could not confirm whether a new code was sent. Wait a minute before requesting another code.'
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

          <form className="mt-6 space-y-5" aria-labelledby="verify-heading" onSubmit={verify} noValidate>
            <div>
              <label htmlFor="verify-phone" className="mb-1.5 block text-sm font-medium">Phone number</label>
              <input id="verify-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={event => setPhone(event.target.value)} aria-invalid={invalidField === 'verify-phone' || undefined} aria-describedby={invalidField === 'verify-phone' ? 'verification-error' : undefined} className="min-h-11 w-full rounded-md border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
            </div>
            <div>
              <label htmlFor="verify-code" className="mb-1.5 block text-sm font-medium">6-digit verification code</label>
              <input id="verify-code" name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={invalidField === 'verify-code' || undefined} aria-describedby={invalidField === 'verify-code' ? 'verification-error' : undefined} className="min-h-11 w-full rounded-md border border-forest/60 bg-white px-3 text-base tracking-[0.2em] text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
            </div>

            {isError && feedback && <p id="verification-error" role={invalidField ? undefined : 'alert'} className="rounded-md border border-forest/15 bg-beige p-3 text-sm leading-5 text-forest">{feedback}</p>}
            <p role="status" className={!isError && feedback ? 'rounded-md border border-forest/15 bg-beige p-3 text-sm leading-5 text-forest' : 'sr-only'}>{!isError && feedback}</p>

            <Button type="submit" disabled={submitting} className="w-full" aria-busy={submitting}>{submitting ? 'Verifying…' : 'Verify phone'}</Button>
          </form>

          <Button type="button" variant="outline" className="mt-3 w-full aria-disabled:pointer-events-none aria-disabled:opacity-50" aria-disabled={resending || submitting || resendCooldownSeconds > 0} aria-busy={resending} onClick={() => { void resend(); }}>
            {resending ? 'Requesting code…' : resendCooldownSeconds > 0 ? `Resend code in ${resendCooldownSeconds}s` : 'Resend code'}
          </Button>
          <p className="mt-5 text-center text-sm text-muted">Already verified? <Link href="/login" className="font-medium text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Sign in</Link></p>
          <p className="mt-2 text-center text-sm text-muted">Need to start again? <Link href="/signup" className="font-medium text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to signup</Link></p>
        </section>
        <Link href="/" className="mx-auto mt-5 flex min-h-11 w-fit items-center px-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to site</Link>
      </div>
    </main>
  );
}
