import Link from 'next/link';
import { Mic } from 'lucide-react';
import { DashboardAccessBoundary } from '@/components/auth/dashboard-access-boundary';
import { DashboardHeaderActions } from '@/components/auth/dashboard-header-actions';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-beige text-forest">
      <header className="border-b border-forest/10 bg-forest sticky top-0 z-40">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="flex h-[64px] items-center justify-between gap-3">
            <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2" aria-label="HisabNaki home">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-purple">
                <Mic className="h-5 w-5 text-forest" />
              </div>
              <span className="text-lg font-bold tracking-tight text-beige sm:text-xl">HisabNaki</span>
            </Link>

            <DashboardHeaderActions />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <DashboardAccessBoundary>{children}</DashboardAccessBoundary>
      </main>
    </div>
  );
}
