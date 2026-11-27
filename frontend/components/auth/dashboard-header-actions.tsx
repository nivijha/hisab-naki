'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Users, List } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { AccountDropdown } from '@/components/auth/account-dropdown';

export function DashboardHeaderActions() {
  const { beginBusinessSwitch, selectedBusiness, status } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState('');

  const switchBusiness = () => {
    setMessage('');
    const result = beginBusinessSwitch();
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    router.push('/business/select');
  };

  return (
    <div className="relative flex items-center gap-2">
      {status === 'authenticated' && selectedBusiness && (
        <>
          <Link href="/transactions" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-2 text-sm font-medium text-beige underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beige sm:px-3" aria-label="Transactions">
            <List aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Transactions</span>
          </Link>
          <Link href="/customers" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-2 text-sm font-medium text-beige underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beige sm:px-3" aria-label="Customers">
            <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Customers</span>
          </Link>
          <button type="button" onClick={switchBusiness} aria-label="Switch business" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-2 text-sm font-medium text-beige underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beige sm:px-3">
            <Building2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Switch business</span>
          </button>
        </>
      )}
      <Link href="/" className="flex min-h-11 items-center text-sm font-medium text-beige underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-beige">
        Back to site
      </Link>
      <AccountDropdown />
      {message && (
        <div role="alert" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-forest/15 bg-beige-light p-3 text-xs leading-5 text-forest shadow-lg">
          <p>{message}</p>
          <button type="button" onClick={() => setMessage('')} className="mt-2 min-h-11 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Dismiss</button>
        </div>
      )}
    </div>
  );
}
