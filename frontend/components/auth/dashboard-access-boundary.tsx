'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';

export function DashboardAccessBoundary({ children }: { children: ReactNode }) {
  const { status, selectedBusiness, businessContextGeneration } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    else if (status === 'authenticated' && !selectedBusiness) router.replace('/business/select');
  }, [router, selectedBusiness, status]);

  if (status === 'loading') {
    return <p role="status" className="rounded-lg border border-forest/10 bg-beige-light p-5 text-sm text-forest">Checking your sign-in…</p>;
  }
  if (status === 'unauthenticated') {
    return <p role="status" className="rounded-lg border border-forest/10 bg-beige-light p-5 text-sm text-forest">Returning to sign in…</p>;
  }
  if (!selectedBusiness) {
    return <p role="status" className="rounded-lg border border-forest/10 bg-beige-light p-5 text-sm text-forest">Opening business selection…</p>;
  }

  return (
    <div key={`${selectedBusiness.businessId}:${businessContextGeneration}`}>{children}</div>
  );
}
