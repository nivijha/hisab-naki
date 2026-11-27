'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Users, List, Menu, X } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { AccountDropdown } from '@/components/auth/account-dropdown';

export function DashboardHeaderActions() {
  const { beginBusinessSwitch, selectedBusiness, status } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

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
          <Link href="/transactions" className="hidden min-h-11 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-medium text-beige hover:bg-white/10 md:inline-flex" aria-label="Transactions">
            <List aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Transactions</span>
          </Link>
          <Link href="/customers" className="hidden min-h-11 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-medium text-beige hover:bg-white/10 md:inline-flex" aria-label="Customers">
            <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Customers</span>
          </Link>
          <button type="button" onClick={switchBusiness} aria-label="Switch business" className="hidden min-h-11 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-medium text-beige hover:bg-white/10 md:inline-flex">
            <Building2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Switch business</span>
          </button>
        </>
      )}
      <Link href="/" className="hidden min-h-11 items-center text-sm font-medium text-beige md:flex">
        Back to site
      </Link>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-[8px] text-beige hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beige md:hidden"
        aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileOpen}
        aria-controls={mobileOpen ? 'dashboard-mobile-menu' : undefined}
        onClick={() => setMobileOpen(current => !current)}
      >
        {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>
      <AccountDropdown />
      {mobileOpen && (
        <div
          ref={mobileMenuRef}
          id="dashboard-mobile-menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-[14px] border border-forest/10 bg-white p-2 shadow-lg"
        >
          {status === 'authenticated' && selectedBusiness && (
            <>
              <Link href="/transactions" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-medium text-forest hover:bg-beige-light">
                <List className="h-4 w-4" aria-hidden="true" />Transactions
              </Link>
              <Link href="/customers" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-medium text-forest hover:bg-beige-light">
                <Users className="h-4 w-4" aria-hidden="true" />Customers
              </Link>
              <button type="button" onClick={() => { setMobileOpen(false); switchBusiness(); }} className="flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm font-medium text-forest hover:bg-beige-light">
                <Building2 className="h-4 w-4" aria-hidden="true" />Switch business
              </button>
            </>
          )}
          <Link href="/" onClick={() => setMobileOpen(false)} className="flex min-h-11 items-center rounded-[8px] px-3 text-sm font-medium text-forest hover:bg-beige-light">
            Back to site
          </Link>
        </div>
      )}
      {message && (
        <div role="alert" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-forest/15 bg-beige-light p-3 text-xs leading-5 text-forest shadow-lg">
          <p>{message}</p>
          <button type="button" onClick={() => setMessage('')} className="mt-2 min-h-11 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">Dismiss</button>
        </div>
      )}
    </div>
  );
}
