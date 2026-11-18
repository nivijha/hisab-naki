import Link from 'next/link';
import { Mic } from 'lucide-react';

const productLinks = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#use-cases', label: 'Who it’s for' },
];

export function Footer() {
  return (
    <footer className="bg-forest text-beige">
      <div className="site-container py-12 sm:py-14">
        <div className="grid gap-10 border-b border-beige/25 pb-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-12">
          <div className="max-w-xs">
            <Link href="/" className="inline-flex min-h-11 items-center gap-3" aria-label="HisabNaki home">
              <span className="mic-motion flex h-9 w-9 items-center justify-center bg-purple text-forest-dark">
                <Mic aria-hidden="true" className="h-[18px] w-[18px]" />
              </span>
              <span className="text-lg font-semibold tracking-tight">HisabNaki</span>
            </Link>
            <p className="mt-4 max-w-[16rem] text-sm leading-6 text-beige">
              A clearer daily ledger for the people who keep local shops running.
            </p>
          </div>

          <nav aria-label="Product links">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-beige">Product</h2>
            <ul>
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="flex min-h-11 items-center text-sm text-beige transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-beige">Your ledger</h2>
            <Link href="/dashboard" className="flex min-h-11 items-center text-sm text-beige transition-colors hover:text-white">
              Open dashboard
            </Link>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-beige">Project</h2>
            <a
              href="https://github.com/nivijha/hisab-naki"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-sm text-beige transition-colors hover:text-white"
            >
              GitHub repository
            </a>
          </div>
        </div>

        <p className="pt-6 text-xs text-beige">
          © {new Date().getFullYear()} HisabNaki · Bas bolo, hisaab ho gaya.
        </p>
      </div>
    </footer>
  );
}
