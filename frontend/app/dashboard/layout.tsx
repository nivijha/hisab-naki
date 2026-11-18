import Link from 'next/link';
import { Mic } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-beige text-forest">
      <header className="border-b border-forest/10 bg-forest sticky top-0 z-40">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple">
                <Mic className="h-5 w-5 text-forest" />
              </div>
              <span className="font-bold text-xl tracking-tight text-beige">HisabNaki</span>
            </Link>

            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm font-medium text-forest/80 hover:text-forest transition-colors">
                Back to site
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
