'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mic } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { Button } from '@/components/ui/button';

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
  } = useAuth();
  const router = useRouter();
  const [selectionError, setSelectionError] = useState('');
  const [logoutError, setLogoutError] = useState('');

  const signOut = () => {
    if (logout()) router.replace('/login');
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

          {status === 'loading' || membershipsStatus === 'loading' || membershipsStatus === 'idle' ? (
            <p role="status" className="mt-6 rounded-lg border border-forest/10 bg-beige p-4 text-sm text-forest">Loading your businesses…</p>
          ) : membershipsStatus === 'error' ? (
            <div className="mt-6 rounded-lg border border-forest/10 bg-beige p-4" role="group" aria-label="Membership loading error">
              <p role="alert" className="text-sm text-forest">{membershipsError || 'Could not load your businesses.'}</p>
              <Button type="button" className="mt-4" onClick={() => { void refreshMemberships(true).catch(() => undefined); }}>Retry</Button>
            </div>
          ) : memberships.length === 0 ? (
            <div className="mt-6 rounded-lg border border-forest/10 bg-beige p-4">
              <p role="status" className="text-sm text-forest">No active businesses are linked to this account.</p>
              <p className="mt-2 text-sm text-muted">Ask your business administrator to add you, then retry.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={() => { void refreshMemberships(true).catch(() => undefined); }}>Retry</Button>
                <Button type="button" onClick={signOut}>Log out</Button>
              </div>
            </div>
          ) : (
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
          )}
        </section>

        <Link href="/" className="mx-auto mt-5 flex min-h-11 w-fit items-center px-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Back to site</Link>
      </div>
    </main>
  );
}
