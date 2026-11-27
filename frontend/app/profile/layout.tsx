import Link from 'next/link';
import { Mic } from 'lucide-react';
import { ProfileAccessBoundary } from '@/components/auth/profile-access-boundary';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-beige text-forest">
      <header className="border-b border-forest/10 bg-forest sticky top-0 z-40">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex min-h-11 items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple">
                <Mic className="h-5 w-5 text-forest" />
              </div>
              <span className="font-bold text-xl tracking-tight text-beige">HisabNaki</span>
            </Link>
            <nav aria-label="Profile navigation" className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="hidden sm:inline-flex min-h-11 items-center gap-2 rounded-sm bg-purple px-5 text-sm font-semibold text-forest-dark hover:bg-beige focus-visible:outline-offset-4"
              >
                Open Ledger
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
        <ProfileAccessBoundary>{children}</ProfileAccessBoundary>
      </main>
    </div>
  );
}