'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, Mic, X } from 'lucide-react';

const navLinks = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#use-cases', label: 'Who it’s for' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 top-0 z-50 border-b border-beige/15 bg-forest">
      <div className="site-container">
        <div className="flex h-[72px] items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-beige" aria-label="HisabNaki home">
            <span className="flex h-9 w-9 items-center justify-center bg-purple text-forest-dark">
              <Mic aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="font-semibold tracking-tight">HisabNaki</span>
          </Link>

          <div className="hidden items-center gap-9 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="min-h-11 content-center text-sm font-medium text-beige transition-colors hover:text-white focus-visible:outline-offset-4"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center gap-2 bg-purple px-5 text-sm font-semibold text-forest-dark transition-colors hover:bg-beige focus-visible:outline-offset-4"
            >
              Open ledger
            </Link>
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-beige transition-colors hover:bg-forest-light md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            {open ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="fixed inset-x-0 bottom-0 top-[72px] z-0 bg-forest md:hidden"
          />
          <div id="mobile-navigation" className="absolute inset-x-0 top-full z-10 border-t border-beige/15 bg-forest px-5 pb-5 pt-2 md:hidden">
            <div className="mx-auto flex max-w-[1296px] flex-col">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-beige/15 text-sm font-medium text-beige"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="mt-4 flex min-h-12 items-center justify-center gap-2 bg-purple px-5 text-sm font-semibold text-forest-dark"
              >
                Open ledger
              </Link>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
