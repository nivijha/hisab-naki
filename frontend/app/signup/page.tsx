'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mic, User, Mail, Smartphone, Lock, Shield } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { registerPrototypeSignup, PENDING_SIGNUP_PHONE_KEY } from '@/lib/signup-api';
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
  if (error.status === 503 || (error.status && error.status >= 500)) return 'Phone verification is temporarily unavailable. You can retry signup or continue to verification if a code may already have been sent.';
  if (error.kind === 'network' || error.kind === 'aborted' || error.kind === 'invalid-response') return 'We could not confirm whether signup completed. You can continue to verification and request a code, or safely retry signup.';
  return error.message;
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
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
  const [continuePhone, setContinuePhone] = useState('');
  const [invalidField, setInvalidField] = useState<'signup-name' | 'signup-email' | 'signup-phone' | 'signup-password' | 'signup-confirm-password' | ''>('');
  const submitLock = useRef(false);

  const validateField = (field: typeof invalidField, value: string): boolean => {
    switch (field) {
      case 'signup-name':
        return value.trim().length >= 2;
      case 'signup-email':
        return isValidEmail(value.trim());
      case 'signup-phone':
        return value.trim().length >= 10;
      case 'signup-password':
        return value.length >= 8 && value.length <= 128;
      case 'signup-confirm-password':
        return value === password;
      default:
        return true;
    }
  };

  const handleBlur = (field: typeof invalidField, value: string) => {
    if (value && !validateField(field, value)) {
      setInvalidField(field);
    } else if (invalidField === field) {
      setInvalidField('');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();
    if (normalizedName.length < 2 || !normalizedPhone || password.length < 8 || password.length > 128) {
      setFeedback('Enter your name, a valid phone number, and a password between 8 and 128 characters.');
      if (!normalizedName) setInvalidField('signup-name');
      else if (!normalizedPhone) setInvalidField('signup-phone');
      else setInvalidField('signup-password');
      return;
    }
    if (password !== confirmPassword) {
      setFeedback('The passwords do not match.');
      setInvalidField('signup-confirm-password');
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setFeedback('Enter a valid email address.');
      setInvalidField('signup-email');
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setInvalidField('');
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
      if (error instanceof ApiError && (error.status === 409 || error.kind === 'network' || error.kind === 'aborted' || error.kind === 'invalid-response' || (error.status !== undefined && error.status >= 500))) {
        setContinuePhone(normalizedPhone);
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

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

        <section className="mt-10 rounded-xl border border-forest/10 bg-white p-6 shadow-soft sm:p-8" aria-labelledby="signup-heading">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
              <User className="h-7 w-7 text-forest" aria-hidden="true" />
            </div>
            <h1 id="signup-heading" className="text-2xl font-semibold tracking-tight text-forest">Create your account</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Enter your name, email, and a password to get started.</p>
          </div>

          <form className="space-y-5" aria-labelledby="signup-heading" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="signup-name" className="mb-2 block text-sm font-medium text-forest">
                Full name
              </label>
              <InputWithIcon
                id="signup-name"
                name="name"
                autoComplete="name"
                icon={User}
                iconAlt="Name"
                required
                maxLength={100}
                value={name}
                onChange={event => setName(event.target.value)}
                onBlur={event => handleBlur('signup-name', event.target.value)}
                aria-invalid={invalidField === 'signup-name' || undefined}
                aria-describedby={invalidField === 'signup-name' ? 'signup-feedback' : undefined}
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="mb-2 block text-sm font-medium text-forest">
                Email address
              </label>
              <InputWithIcon
                id="signup-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                icon={Mail}
                iconAlt="Email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                onBlur={event => handleBlur('signup-email', event.target.value)}
                placeholder="user@example.com"
                aria-describedby="signup-email-help"
                aria-invalid={invalidField === 'signup-email' || undefined}
                disabled={submitting}
              />
              <p id="signup-email-help" className="mt-1.5 text-xs leading-5 text-muted">We will use this email to sign you in later.</p>
            </div>

            <div>
              <label htmlFor="signup-phone" className="mb-2 block text-sm font-medium text-forest">
                Phone number
              </label>
              <InputWithIcon
                id="signup-phone"
                name="tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                icon={Smartphone}
                iconAlt="Phone"
                required
                value={phone}
                onChange={event => setPhone(event.target.value)}
                onBlur={event => handleBlur('signup-phone', event.target.value)}
                placeholder="10-digit Indian mobile number"
                aria-describedby="signup-phone-help"
                aria-invalid={invalidField === 'signup-phone' || undefined}
                disabled={submitting}
              />
              <p id="signup-phone-help" className="mt-1.5 text-xs leading-5 text-muted">Use an Indian mobile number or include the country code.</p>
            </div>

            <div>
              <label htmlFor="signup-password" className="mb-2 block text-sm font-medium text-forest">
                Password
              </label>
              <div className="relative">
                <InputWithIcon
                  id="signup-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  icon={Lock}
                  iconAlt="Password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  onBlur={event => handleBlur('signup-password', event.target.value)}
                  aria-invalid={invalidField === 'signup-password' || undefined}
                  aria-describedby={invalidField === 'signup-password' ? 'password-help signup-feedback' : 'password-help'}
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
              <p id="password-help" className="mt-1.5 text-xs leading-5 text-muted">Use 8 to 128 characters.</p>
            </div>

            <div>
              <label htmlFor="signup-confirm-password" className="mb-2 block text-sm font-medium text-forest">
                Confirm password
              </label>
              <InputWithIcon
                id="signup-confirm-password"
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                icon={Shield}
                iconAlt="Confirm"
                required
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                onBlur={event => handleBlur('signup-confirm-password', event.target.value)}
                aria-invalid={invalidField === 'signup-confirm-password' || undefined}
                aria-describedby={invalidField === 'signup-confirm-password' ? 'signup-feedback' : undefined}
                disabled={submitting}
              />
            </div>

            {feedback && (
              <p
                id="signup-feedback"
                role="alert"
                className={`
                  rounded-md border p-3 text-sm leading-5
                  ${invalidField
                    ? 'border-forest/30 bg-red-50 text-red-800'
                    : 'border-forest/15 bg-beige-light text-forest'}
                `}
              >
                {feedback}
              </p>
            )}

            {continuePhone && (
              <Link
                href="/signup/verify"
                className="block min-h-11 w-full rounded-md bg-forest/5 px-4 py-2.5 text-center text-sm font-medium text-forest hover:bg-forest/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors"
                onClick={() => {
                  try { window.sessionStorage.setItem(PENDING_SIGNUP_PHONE_KEY, continuePhone); }
                  catch { /* Verification page allows phone entry if storage is restricted. */ }
                }}
              >
                Continue to phone verification
              </Link>
            )}

            <Button type="submit" disabled={submitting} className="w-full" aria-busy={submitting}>
              {submitting ? 'Creating your account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors">
              Sign in
            </Link>
          </p>
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