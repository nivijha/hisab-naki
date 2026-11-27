'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mic, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { createFirstBusiness, createIdempotencyKey } from '@/lib/signup-api';

export default function BusinessCreatePage() {
  const router = useRouter();
  const {
    status,
    refreshMemberships,
    selectBusiness,
    memberships,
    membershipsStatus,
    membershipsError,
  } = useAuth();

  const [businessName, setBusinessName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [invalidName, setInvalidName] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdBusiness, setCreatedBusiness] = useState<{ id: string; name: string } | null>(null);
  const creationLock = useRef(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const validateForm = (): boolean => {
    const trimmedName = businessName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      setInvalidName(true);
      setFeedback('Business name must be between 2 and 120 characters.');
      setFeedbackIsError(true);
      return false;
    }
    setInvalidName(false);
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creationLock.current) return;
    if (!validateForm()) return;

    creationLock.current = true;
    setCreating(true);
    setFeedback('Creating business…');
    setFeedbackIsError(false);

    const operationKey = createIdempotencyKey();
    try {
      const result = await createFirstBusiness(businessName.trim(), operationKey, AbortSignal.timeout(20_000));
      setCreatedBusiness({ id: result.business.id, name: result.business.name });
      setFeedback(`"${result.business.name}" created successfully. Redirecting…`);
      setFeedbackIsError(false);

      await refreshMemberships(true);
      const ok = selectBusiness(result.business.id);
      if (ok) {
        router.replace('/dashboard');
      } else {
        setFeedback('Business created but could not select it automatically. Please select it from the business list.');
        setFeedbackIsError(true);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setFeedback('You already have a business. The current system only supports creating your first business during initial setup. Please use your existing business or contact support.');
        } else if (error.status === 401) {
          setFeedback('Your session has expired. Please sign in again.');
        } else if (error.status === 403) {
          setFeedback('You cannot create a business yet. Verify your phone first.');
        } else if (error.status === 429) {
          setFeedback('Too many attempts. Please wait before trying again.');
        } else if (error.kind === 'network' || error.kind === 'timeout') {
          setFeedback('Network error. Please check your connection and try again.');
        } else {
          setFeedback(error.message || 'Failed to create business. Please try again.');
        }
      } else {
        setFeedback('An unexpected error occurred. Please try again.');
      }
      setFeedbackIsError(true);
    } finally {
      creationLock.current = false;
      setCreating(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const handleBackToSelection = () => {
    router.push('/business/select');
  };

  const hasActiveBusiness = memberships.length > 0;
  const isLoading = status === 'loading' || membershipsStatus === 'loading';
  const isError = membershipsStatus === 'error';
  const showForm = !hasActiveBusiness && !createdBusiness && !isLoading && !isError && !feedbackIsError;

  return (
    <main className="min-h-screen bg-beige px-5 py-10 text-forest sm:grid sm:place-items-center sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/business/select"
          className="mb-6 flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          aria-label="Back to business selection"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to business selection
        </Link>

        <Link
          href="/"
          className="mx-auto flex min-h-11 w-fit items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest"
          aria-label="HisabNaki home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple"><Mic aria-hidden="true" className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight">HisabNaki</span>
        </Link>

        <section className="mt-7 rounded-xl border border-forest/10 bg-beige-light p-5 shadow-sm sm:mt-8 sm:p-8" aria-labelledby="create-business-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 id="create-business-heading" className="text-2xl font-semibold tracking-tight">Create your shop</h1>
              <p className="mt-2 text-sm text-muted">Set up your first shop to start managing customers and daily ledger.</p>
            </div>
          </div>

          {isLoading && (
            <div className="mt-6 rounded-lg border border-forest/10 bg-beige p-5 text-center" role="status" aria-live="polite">
              <p className="text-sm text-forest">Checking your businesses…</p>
            </div>
          )}

          {isError && !hasActiveBusiness && (
            <div className="mt-6 rounded-lg border border-forest/15 bg-beige p-5" role="alert">
              <p className="text-sm text-forest">Could not load your businesses. {membershipsError || 'Please try again.'}</p>
              <Button type="button" className="mt-4 w-full sm:w-auto" onClick={() => router.refresh()}>
                Retry
              </Button>
            </div>
          )}

          {hasActiveBusiness && !isLoading && (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-forest/10 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest/10 shrink-0">
                    <svg className="h-5 w-5 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-forest">You already have a business</h2>
                    <p className="mt-1 text-sm text-muted">Your account is linked to <span className="font-medium">{memberships[0].businessName}</span>. The current system only supports creating your first business during initial setup.</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">To manage multiple businesses, please contact support or use your existing business.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={handleBackToSelection}>
                  Back to business selection
                </Button>
              </div>
            </div>
          )}

          {createdBusiness && !hasActiveBusiness && !isLoading && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-forest">Business created successfully. Redirecting to dashboard…</p>
              <Button type="button" className="w-full sm:w-auto" onClick={() => router.replace('/dashboard')}>
                Go to dashboard
              </Button>
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={handleCancel}>
                Back to business list
              </Button>
            </div>
          )}

          {showForm && (
            <form className="mt-6 space-y-6" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="business-name" className="mb-1.5 block text-sm font-medium">Business name <span className="text-forest" aria-hidden="true">*</span></label>
                <input
                  id="business-name"
                  name="businessName"
                  autoComplete="organization"
                  required
                  maxLength={120}
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  disabled={creating}
                  className={`min-h-11 w-full rounded-md border bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-70 transition-colors ${invalidName ? 'border-forest/60' : 'border-forest/20'}`}
                  aria-invalid={invalidName || undefined}
                  aria-describedby="business-name-help"
                />
                <p id="business-name-help" className="mt-1 text-xs leading-5 text-muted">Use 2 to 120 characters.</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={creating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating} aria-busy={creating}>
                  {creating ? 'Creating business…' : 'Create business'}
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}