'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mic, Plus } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { createFirstBusiness, createIdempotencyKey, FIRST_BUSINESS_OPERATION_PREFIX, currentSessionSubject } from '@/lib/signup-api';

type PendingBusinessOperation = { name: string; key: string };

function parsePendingOperation(value: string | null): PendingBusinessOperation | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && 'name' in parsed && 'key' in parsed
      && typeof parsed.name === 'string' && parsed.name.trim()
      && typeof parsed.key === 'string' && parsed.key.length >= 8) return { name: parsed.name, key: parsed.key };
  } catch { /* Invalid local retry metadata is ignored; the server remains authoritative. */ }
  return null;
}

function businessSetupError(error: unknown) {
  if (!(error instanceof ApiError)) return 'We could not confirm shop setup. Check your businesses before trying again.';
  if (error.status === 400) return error.message === 'Validation failed' ? 'Check the shop name and try again.' : error.message;
  if (error.status === 401) return 'Your sign-in expired. Sign in again, then check your business list.';
  if (error.status === 403) return 'You cannot create a shop yet. Verify your phone first or sign in with your verified phone.';
  if (error.status === 409) return 'Shop setup conflicts with an existing request or business. Refresh your business list before trying again.';
  if (error.status === 429) return 'Too many shop setup attempts. Please wait before trying again.';
  if (error.kind === 'network' || error.kind === 'timeout' || error.kind === 'aborted' || error.kind === 'session-changed' || error.kind === 'invalid-response' || (error.status !== undefined && error.status >= 500)) {
    return 'We could not confirm whether your shop was created. Do not start a new setup. Retry the same shop name safely or refresh your business list.';
  }
  return error.message;
}

function roleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default function BusinessSelectionPage() {
  const {
    status,
    memberships,
    membershipsStatus,
    membershipsError,
    businessAccessError,
    refreshMemberships,
    selectedBusiness,
    selectBusiness,
    logout,
    financialOperationStatus,
    user,
    getToken,
  } = useAuth();
  const router = useRouter();
  const [selectionError, setSelectionError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessFeedback, setBusinessFeedback] = useState('');
  const [businessFeedbackIsError, setBusinessFeedbackIsError] = useState(false);
  const [invalidBusinessName, setInvalidBusinessName] = useState(false);
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingBusinessOperation | null>(null);
  const [createdBusinessName, setCreatedBusinessName] = useState('');
  const creationLock = useRef(false);
  const refreshListPending = useRef(false);
  const sessionSubject = currentSessionSubject(getToken());
  const operationStorageKey = sessionSubject ? `${FIRST_BUSINESS_OPERATION_PREFIX}${encodeURIComponent(sessionSubject)}` : null;

  useEffect(() => {
    if (status !== 'authenticated' || !operationStorageKey) return;
    try {
      const operation = parsePendingOperation(window.sessionStorage.getItem(operationStorageKey));
      if (operation) {
        setPendingOperation(operation);
        setBusinessName(operation.name);
        setBusinessFeedback('A previous shop setup may have completed. Retry with the same shop name, or refresh your business list first.');
        setBusinessFeedbackIsError(false);
      }
    } catch { /* The in-memory operation still protects retries during this page session. */ }
  }, [operationStorageKey, status]);

  const signOut = async () => {
    setLogoutError('');
    const ok = await logout();
    if (ok) router.replace('/login');
    else setLogoutError('A saved change is pending or its result is uncertain. Do not repeat it; sign-out is blocked until you have reviewed the result.');
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated' && membershipsStatus === 'idle') {
      void refreshMemberships().catch(() => undefined);
    }
  }, [membershipsStatus, refreshMemberships, router, status]);

  const chooseBusiness = (businessId: string) => {
    setSelectionError('');
    if (!selectBusiness(businessId)) {
      setSelectionError(financialOperationStatus === 'uncertain'
        ? 'A saved change has an uncertain result. Do not repeat it. Acknowledge the warning on the dashboard before switching businesses.'
        : financialOperationStatus === 'pending'
          ? 'Wait for the current saved change to finish before switching businesses.'
          : 'This business is no longer available to your account. Refresh the list and try again.');
      return;
    }
    router.replace('/dashboard');
  };

  const createBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creationLock.current) return;
    const normalizedName = businessName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      setInvalidBusinessName(true);
      window.requestAnimationFrame(() => document.getElementById('first-business-name')?.focus());
      setBusinessFeedback('Shop name must be between 2 and 120 characters.');
      setBusinessFeedbackIsError(true);
      return;
    }
    setInvalidBusinessName(false);
    if (pendingOperation && pendingOperation.name !== normalizedName) {
      setBusinessFeedback('A previous shop setup may have completed. Retry that same shop name or refresh your business list before starting another setup.');
      setBusinessFeedbackIsError(true);
      return;
    }

    const operation = pendingOperation ?? { name: normalizedName, key: createIdempotencyKey() };
    if (operationStorageKey && !pendingOperation) {
      try { window.sessionStorage.setItem(operationStorageKey, JSON.stringify(operation)); }
      catch {
        setBusinessFeedback('This browser could not save a safe retry reference. Please enable session storage and try again.');
        setBusinessFeedbackIsError(true);
        return;
      }
    }

    setPendingOperation(operation);
    creationLock.current = true;
    setCreatingBusiness(true);
    setBusinessFeedback('Setting up your shop…');
    setBusinessFeedbackIsError(false);
    try {
      const result = await createFirstBusiness(normalizedName, operation.key, AbortSignal.timeout(20_000));
      setCreatedBusinessName(result.business.name);
      if (operationStorageKey) {
        try { window.sessionStorage.removeItem(operationStorageKey); } catch { /* The server response confirms creation; memberships will reconcile it. */ }
      }
      setPendingOperation(null);
      setBusinessFeedback(`“${result.business.name}” created. Opening your ledger…`);
      setBusinessFeedbackIsError(false);
      await refreshMemberships(true);
      const ok = selectBusiness(result.business.id);
      if (ok) {
        router.replace('/dashboard');
      } else {
        setBusinessFeedback('Business created but could not select it automatically. Please select it from the list below.');
        setBusinessFeedbackIsError(true);
      }
    } catch (error) {
      setBusinessFeedback(businessSetupError(error));
      setBusinessFeedbackIsError(true);
      if (error instanceof ApiError && error.status === 409) {
        try { await refreshMemberships(true); } catch { /* The selection panel exposes its own retry state. */ }
      }
    } finally {
      creationLock.current = false;
      setCreatingBusiness(false);
    }
  };

  const refreshBusinessList = () => {
    if (refreshListPending.current) return;
    refreshListPending.current = true;
    void refreshMemberships(true).then(refreshed => {
      if (!refreshed) return;
      setBusinessFeedback('Business list refreshed. If your shop setup completed, select it below.');
      setBusinessFeedbackIsError(false);
    }).catch(() => undefined).finally(() => { refreshListPending.current = false; });
  };

  const hasBusinesses = memberships.length > 0;
  const isLoading = status === 'loading' || membershipsStatus === 'loading' || membershipsStatus === 'idle';
  const isError = membershipsStatus === 'error';

  return (
    <main className="min-h-screen bg-beige px-5 py-8 text-forest sm:grid sm:place-items-center sm:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mx-auto flex min-h-11 w-fit items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest" aria-label="HisabNaki home">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple"><Mic aria-hidden="true" className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight">HisabNaki</span>
        </Link>

        <section className="mt-7 rounded-xl border border-forest/10 bg-beige-light p-5 shadow-sm sm:mt-8 sm:p-8" aria-labelledby="business-selection-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 id="business-selection-heading" className="text-2xl font-semibold tracking-tight">Choose your business</h1>
              <p className="mt-2 text-sm text-muted">Select the shop you want to work with. You can switch businesses later.</p>
            </div>
            <Button type="button" variant="outline" onClick={signOut}>Log out</Button>
          </div>

          {selectionError && <p role="alert" className="mt-5 rounded-md border border-forest/15 bg-beige p-3 text-sm">{selectionError}</p>}
          {logoutError && <p role="alert" className="mt-5 rounded-md border border-forest/15 bg-beige p-3 text-sm">{logoutError}</p>}
          {businessAccessError && <p role="alert" className="mt-5 rounded-md border border-forest/15 bg-beige p-3 text-sm">{businessAccessError}</p>}

          {isLoading ? (
            <p role="status" className="mt-6 rounded-lg border border-forest/10 bg-beige p-4 text-sm text-forest">Loading your businesses…</p>
          ) : isError ? (
            <div className="mt-6 rounded-lg border border-forest/10 bg-beige p-4" role="group" aria-label="Membership loading error">
              {createdBusinessName && <p role="status" className="mb-3 text-sm text-forest">“{createdBusinessName}” was created. Refresh the list to select it.</p>}
              <p role="alert" className="text-sm text-forest">{membershipsError || 'Could not load your businesses.'}</p>
              <Button type="button" className="mt-4" onClick={() => { void refreshMemberships().catch(() => undefined); }}>Retry</Button>
            </div>
          ) : !hasBusinesses ? (
            <div className="mt-6 rounded-lg border border-forest/10 bg-beige p-4 sm:p-5">
              <h2 id="first-shop-heading" className="text-lg font-semibold">Set up your first shop</h2>
              <p className="mt-2 text-sm leading-6 text-muted">Create a shop to keep its customers and daily ledger together. You’ll choose the shop before opening dashboard data.</p>
              {businessFeedback && <p id="business-setup-feedback" className="mt-4 rounded-md border border-forest/15 bg-beige-light p-3 text-sm leading-5 text-forest" role={invalidBusinessName ? undefined : businessFeedbackIsError ? 'alert' : 'status'}>{businessFeedback}</p>}
              {createdBusinessName ? (
                <Button type="button" variant="outline" className="mt-4 w-full sm:w-auto" onClick={refreshBusinessList}>Refresh business list</Button>
              ) : (
                <>
                  <form className="mt-4 space-y-4" aria-labelledby="first-shop-heading" onSubmit={createBusiness} noValidate>
                    <div>
                      <label htmlFor="first-business-name" className="mb-1.5 block text-sm font-medium">Shop name</label>
                      <input id="first-business-name" name="businessName" autoComplete="organization" required maxLength={120} value={businessName} onChange={event => setBusinessName(event.target.value)} disabled={Boolean(pendingOperation) || creatingBusiness} className="min-h-11 w-full rounded-md border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-70" aria-invalid={invalidBusinessName || undefined} aria-describedby={invalidBusinessName ? 'business-name-help business-setup-feedback' : 'business-name-help'} />
                      <p id="business-name-help" className="mt-1 text-xs leading-5 text-muted">Use 2 to 120 characters.</p>
                    </div>
                    <Button type="submit" className="w-full sm:w-auto" disabled={creatingBusiness} aria-busy={creatingBusiness}>
                      {creatingBusiness ? 'Setting up shop…' : pendingOperation ? 'Retry shop setup safely' : 'Create shop'}
                    </Button>
                  </form>
                  {businessFeedbackIsError && <Button type="button" variant="outline" className="mt-3 w-full sm:w-auto" onClick={refreshBusinessList}>Refresh business list</Button>}
                </>
              )}
            </div>
          ) : (
            <>
              <ul className="mt-6 space-y-3" aria-label="Active business memberships">
                {memberships.map(membership => {
                  const isSelected = selectedBusiness?.businessId === membership.businessId;
                  return (
                    <li key={membership.membershipId} className="flex flex-col gap-4 rounded-lg border border-forest/15 bg-beige p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      <div className="min-w-0">
                        <h2 className="break-words text-base font-semibold text-forest">{membership.businessName}</h2>
                        <p className="mt-1 text-sm text-muted">Your role: {roleLabel(membership.role)}</p>
                        {isSelected && <p className="mt-1 text-xs font-medium text-forest">Currently selected</p>}
                      </div>
                      <Button type="button" className="w-full shrink-0 sm:w-auto" onClick={() => chooseBusiness(membership.businessId)}>
                        {isSelected ? 'Open this business' : 'Select business'}
                      </Button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-6 flex group w-full items-center justify-center gap-3 rounded-lg border border-forest/20 bg-beige-light p-4 text-left text-sm text-muted">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-forest/10 text-forest/50 shrink-0">
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="text-left">
                  <h3 className="font-semibold text-forest">Add another business</h3>
                  <p className="mt-1 text-sm text-muted">The current system only supports your first business. Contact support for multi-business access.</p>
                </div>
              </div>
            </>
          )}
        </section>

        <Link href="/" className="mx-auto mt-5 flex min-h-11 w-fit items-center px-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to site</Link>
      </div>
    </main>
  );
}
