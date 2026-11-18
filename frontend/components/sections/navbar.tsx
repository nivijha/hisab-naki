'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navLinks = [
  { href: '#product-demo', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#use-cases', label: 'Use cases' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="border-b border-forest/10 bg-forest/80 backdrop-blur-md supports-[backdrop-filter]:bg-forest/60">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple">
                <Mic className="h-5 w-5 text-forest" />
              </div>
              <span className="font-bold text-xl tracking-tight text-beige">HisabNaki</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-beige/80 hover:text-beige transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <Button size="lg" variant="default" onClick={() => {}}>
                Start recording
              </Button>
            </div>

            <button
              type="button"
              className="md:hidden p-2 text-beige hover:text-beige"
              onClick={() => setOpen((o) => !o)}
              aria-label="Open menu"
            >
              {open ? <X className="h-6 w-6 text-beige" /> : <Menu className="h-6 w-6 text-beige" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-b border-forest/20 bg-forest px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-md text-sm font-medium text-beige/80 hover:bg-forest-light hover:text-beige"
              >
                {link.label}
              </Link>
            ))}
            <Button variant="default" className="w-full" onClick={() => setOpen(false)}>
              Start recording
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}

export function TrustBar() {
  return (
    <div className="border-y border-forest/10 bg-white px-4 py-3">
      <div className="mx-auto max-w-[1200px] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-6 sm:px-8 lg:px-0">
        <div className="flex items-center gap-3">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-purple">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-xs font-medium text-forest">Encrypted in transit</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-purple">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 2h12a2 2 0 002-2v-2a2 2 0 00-2-2h-2m2 2l-2 2m-2-2l-2-2" />
            </svg>
          </div>
          <p className="text-xs font-medium text-forest">Works offline, syncs online</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-purple">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <p className="text-xs font-medium text-forest">Hindi + English voice</p>
        </div>
      </div>
    </div>
  );
}
