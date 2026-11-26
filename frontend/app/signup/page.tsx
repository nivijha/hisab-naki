'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mic } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { registerPrototypeSignup } from '@/lib/signup-api';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageFor(error: unknown) {
  if (!(error instanceof ApiError)) return 'We could not start signup. Please try again.';
  if (error.status === 400) return error.message === 'Validation failed' ? 'Check your name, email, and password format.' : error.message;
  if (error.status === 409) {
    if (/already registered/i.test(error.message)) return 'This email is already registered. Please sign in with your email and password.';
    return error.message || 'Signup is not available in this environment. Try again later.';
  }
  if (error.status === 429) return 'Too many signup attempts. Please wait before trying again.';
  if (error.status === 503 || (error.status !== undefined && error.status >= 500)) return 'Signup is temporarily unavailable. Please try again.';
  if (error.kind === 'network' || error.kind === 'aborted' || error.kind === 'invalid-response') return 'We could not confirm whether signup completed. You can safely retry signup.';
  return error.message;
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export default function SignupPage() {
  const router = useRouter();
  const { completeAuthenticatedSession } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const submitLock = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    if (normalizedName.length < 2 || !isValidEmail(normalizedEmail) || password.length < 8 || password.length > 128) {
      setFeedback('Enter your name, a valid email address, and a password between 8 and 128 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFeedback('The passwords do not match.');
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setFeedback('');
    try {
      await registerPrototypeSignup(
        { name: normalizedName, email: normalizedEmail, phone: normalizedPhone || undefined, password },
        AbortSignal.timeout(20_000)
      );
      setPassword('');
      setConfirmPassword('');
      await completeAuthenticatedSession();
      router.push('/business/select');
    } catch (error) {
      setFeedback(messageFor(error));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
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
          <p className="mt-2 text-sm leading-6 text-muted">Enter your name, email, and a password to get started.</p>

          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium">Full name</label>
              <input id="signup-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
            </div>
            <div>
              <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium">Email address</label>
              <input id="signup-email" name="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" placeholder="user@example.com" aria-describedby="signup-email-help" />
              <p id="signup-email-help" className="mt-1 text-xs leading-5 text-muted">We will use this email to sign you in later.</p>
            </div>
            <div>
              <label htmlFor="signup-phone" className="mb-1.5 block text-sm font-medium">Phone number</label>
              <input id="signup-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} className="min-h-11 w-full rounded-md border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" placeholder="10-digit Indian mobile number (optional)" />
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

            <Button type="submit" disabled={submitting} className="w-full" aria-busy={submitting}>
              {submitting ? 'Creating your account…' : 'Create account'}
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
