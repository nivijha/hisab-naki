'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/auth-provider';

export function ProfileAccessBoundary({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [router, status]);

  if (status === 'loading') {
    return <p role="status" className="rounded-lg border border-forest/10 bg-beige-light p-5 text-sm text-forest">Checking your sign-in…</p>;
  }
  if (status === 'unauthenticated') {
    return <p role="status" className="rounded-lg border border-forest/10 bg-beige-light p-5 text-sm text-forest">Returning to sign in…</p>;
  }

  return <>{children}</>;
}