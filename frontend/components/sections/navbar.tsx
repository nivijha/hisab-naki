'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, Mic, X } from 'lucide-react';

const navLinks = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#use-cases', label: 'Who it’s for' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [activeHref, setActiveHref] = useState('');
  const menuTrigger = useRef<HTMLButtonElement>(null);

  const focusLinkedSection = (href: string) => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      const heading = document.getElementById(href.slice(1))?.querySelector('h2');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
  };

  const handleNavigationKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!open || event.key !== 'Tab') return;

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#mobile-navigation a'));
    if (!links.length) return;

    const firstLink = links[0];
    const lastLink = links.at(-1)!;

    const isFocusInMenu = links.some(link => link === document.activeElement || link.contains(document.activeElement as Node));
    const isFocusOnTrigger = menuTrigger.current === document.activeElement;

    if (event.shiftKey) {
      if (isFocusOnTrigger || (!isFocusInMenu && document.activeElement === document.body)) {
        event.preventDefault();
        lastLink.focus();
      } else if (document.activeElement === firstLink) {
        event.preventDefault();
        menuTrigger.current?.focus();
      }
    } else {
      if (isFocusOnTrigger) {
        event.preventDefault();
        firstLink.focus();
      } else if (document.activeElement === lastLink) {
        event.preventDefault();
        menuTrigger.current?.focus();
      }
    }
  };

  useEffect(() => {
    if (!open) return;

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#mobile-navigation a'));
    links[0]?.focus();

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menuTrigger.current?.getClientRects().length) return;

      event.preventDefault();
      setOpen(false);
      menuTrigger.current.focus({ preventScroll: true });
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  useEffect(() => {
    const sections = navLinks
      .map(({ href }) => document.getElementById(href.slice(1)))
      .filter((section): section is HTMLElement => section !== null);
    if (!sections.length || !('IntersectionObserver' in window)) {
      return;
    }

    const visibleSections = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleSections.set(entry.target.id, entry.intersectionRatio);
          } else {
            visibleSections.delete(entry.target.id);
          }
        });

        const activeSection = Array.from(visibleSections.entries()).sort((a, b) => b[1] - a[1])[0];
        setActiveHref(activeSection ? `#${activeSection[0]}` : '');
      },
      { rootMargin: '-72px 0px -45% 0px', threshold: 0.01 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Main navigation" onKeyDown={handleNavigationKeyDown} className="fixed inset-x-0 top-0 z-50 border-b border-beige/15 bg-forest">
      <div className="site-container">
        <div className="flex h-[72px] items-center justify-between">
          <Link href="/" className="flex min-h-11 items-center gap-3 text-beige" aria-label="HisabNaki home">
            <span className="mic-motion flex h-9 w-9 items-center justify-center bg-purple text-forest-dark">
              <Mic aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="font-semibold tracking-tight">HisabNaki</span>
          </Link>

          <div className="hidden items-center gap-9 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={activeHref === link.href ? 'location' : undefined}
                className="min-h-11 content-center border-b-2 border-transparent text-sm font-medium text-beige transition-[color,border-color] hover:border-purple hover:text-white aria-[current=location]:border-purple aria-[current=location]:text-white focus-visible:outline-offset-4"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="motion-interactive inline-flex min-h-11 items-center gap-2 rounded-sm bg-purple px-5 text-sm font-semibold text-forest-dark hover:bg-beige focus-visible:outline-offset-4"
            >
              Sign in
            </Link>
          </div>

          <button
            ref={menuTrigger}
            type="button"
            className="flex h-11 w-11 items-center justify-center text-beige transition-colors hover:bg-forest-light focus-visible:outline-beige md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls={open ? 'mobile-navigation' : undefined}
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
            tabIndex={-1}
            onClick={() => {
              setOpen(false);
              menuTrigger.current?.focus({ preventScroll: true });
            }}
            className="fixed inset-x-0 bottom-0 top-[72px] z-0 bg-forest md:hidden"
          />
          <div id="mobile-navigation" className="absolute inset-x-0 top-full z-10 border-t border-beige/15 bg-forest px-5 pb-5 pt-2 md:hidden">
            <div className="mx-auto flex max-w-[1296px] flex-col">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => focusLinkedSection(link.href)}
                  aria-current={activeHref === link.href ? 'location' : undefined}
                  className="flex min-h-12 items-center border-b border-beige/15 text-sm font-medium text-beige aria-[current=location]:border-purple aria-[current=location]:font-semibold"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="motion-interactive mt-4 flex min-h-12 items-center justify-center gap-2 rounded-sm bg-purple px-5 text-sm font-semibold text-forest-dark"
              >
                Sign in
              </Link>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
