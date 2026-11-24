'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mic } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { PENDING_SIGNUP_PHONE_KEY, registerSignup } from '@/lib/signup-api';
import { Button } from '@/components/ui/button';

function messageFor(error: unknown) {
  if (!(error instanceof ApiError)) return 'We could not start signup. Please try again.';
  if (error.status === 400) return error.message === 'Validation failed' ? 'Check your name, phone number, and password format.' : error.message;
  if (error.status === 409) return 'This phone cannot be registered right now. If signup is pending, continue to phone verification; otherwise sign in.';
  if (error.status === 429) return 'Too many signup attempts. Please wait before trying again.';
  if (error.status === 503 || (error.status && error.status >= 500)) return 'Phone verification is temporarily unavailable. You can retry signup or continue to verification if a code may already have been sent.';
  if (error.kind === 'network' || error.kind === 'aborted' || error.kind === 'invalid-response') return 'We could not confirm whether signup completed. You can continue to verification and request a code, or safely retry signup.';
  return error.message;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [continuePhone, setContinuePhone] = useState('');
  const submitLock = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    const normalizedName = name.trim();
    const normalizedPhone = phone.trim();
    if (normalizedName.length < 2 || !normalizedPhone || password.length < 8 || password.length > 128) {
      setFeedback('Enter your name, a valid phone number, and a password between 8 and 128 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFeedback('The passwords do not match.');
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setFeedback('');
    setContinuePhone('');
    try {
      try { window.sessionStorage.setItem(PENDING_SIGNUP_PHONE_KEY, normalizedPhone); } catch { /* Keep this flow usable if storage is restricted. */ }
      await registerSignup({ name: normalizedName, phone: normalizedPhone, password }, AbortSignal.timeout(20_000));
      router.push('/signup/verify');
    } catch (error) {
      setFeedback(messageFor(error));
      if (error instanceof ApiError && (error.status === 409 || error.kind === 'network' || error.kind === 'aborted' || error.kind === 'invalid-response' || (error.status !== undefined && error.status >= 500))) {
        setContinuePhone(normalizedPhone);
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
      setPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <main className="min-h-screen bg-beige px-5 py-10 text-forest sm:grid sm:place-items-center sm:py-12">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mx-auto flex min-h-11 w-fit items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest" aria-label="HisabNaki home">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple"><Mic aria-hidden="true" className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight">HisabNaki</span>
        </Link>

        <section className="mt-8 rounded-xl border border-forest/10 bg-beige-light p-5 shadow-sm sm:p-8" aria-labelledby="signup-heading">
          <h1 id="signup-heading" className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm leading-6 text-muted">We’ll verify your phone before you sign in and set up your shop.</p>

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium">Full name</label>
              <input id="signup-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
            </div>
            <div>
              <label htmlFor="signup-phone" className="mb-1.5 block text-sm font-medium">Phone number</label>
              <input id="signup-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={event => setPhone(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" placeholder="10-digit Indian mobile number" aria-describedby="signup-phone-help" />
              <p id="signup-phone-help" className="mt-1 text-xs leading-5 text-muted">Use an Indian mobile number or include the country code.</p>
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium">Password</label>
              <div className="relative">
                <input id="signup-password" name="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white py-2 pl-3 pr-12 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" aria-describedby="password-help" />
                <button type="button" className="absolute inset-y-0 right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-r-md text-forest hover:bg-beige focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-forest" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                </button>
              </div>
              <p id="password-help" className="mt-1 text-xs leading-5 text-muted">Use 8 to 128 characters.</p>
            </div>
            <div>
              <label htmlFor="signup-confirm-password" className="mb-1.5 block text-sm font-medium">Confirm password</label>
              <input id="signup-confirm-password" name="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
            </div>

            {feedback && <p role="alert" className="rounded-md border border-forest/15 bg-beige p-3 text-sm leading-5 text-forest">{feedback}</p>}
            {continuePhone && <Link href="/signup/verify" className="block min-h-11 rounded-md px-1 py-3 text-sm font-medium text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" onClick={() => { try { window.sessionStorage.setItem(PENDING_SIGNUP_PHONE_KEY, continuePhone); } catch { /* Verification page allows phone entry if storage is restricted. */ } }}>Continue to phone verification</Link>}

            <Button type="submit" disabled={submitting} className="w-full" aria-busy={submitting}>
              {submitting ? 'Starting signup…' : 'Continue'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            Already have an account? <Link href="/login" className="font-medium text-forest underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Sign in</Link>
          </p>
        </section>
        <Link href="/" className="mx-auto mt-5 flex min-h-11 w-fit items-center px-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to site</Link>
      </div>
    </main>
  );
}
