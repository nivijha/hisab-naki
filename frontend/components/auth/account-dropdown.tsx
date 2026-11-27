'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, User, Settings, Building2, ChevronDown } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';

interface AccountDropdownProps {
  onClose?: () => void;
}

export function AccountDropdown({ onClose }: AccountDropdownProps) {
  const { user, logout, clearSelectedBusiness, beginBusinessSwitch } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    setOpen(false);
    onClose?.();
    triggerRef.current?.focus({ preventScroll: true });
  }, [onClose]);

  const handleLogout = async () => {
    setOpen(false);
    onClose?.();
    await logout();
    clearSelectedBusiness();
    window.location.href = '/login';
  };

  const handleSwitchBusiness = () => {
    const result = beginBusinessSwitch();
    if (result.ok) {
      setOpen(false);
      onClose?.();
    }
  };

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = dropdownRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        closeAndRestoreFocus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, closeAndRestoreFocus]);

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="group flex h-11 items-center gap-1.5 rounded-full px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple focus-visible:ring-offset-2 focus-visible:ring-offset-forest"
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? 'account-dropdown' : undefined}
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-purple text-forest-dark font-medium text-sm transition-colors group-hover:bg-beige"
          aria-hidden="true"
        >
          {initials}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-beige transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          id="account-dropdown"
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-forest/10 bg-white shadow-lg"
        >
          <div className="border-b border-forest/10 px-4 py-3">
            <p className="truncate text-sm font-medium text-forest">{user?.name ?? 'User'}</p>
            <p className="truncate text-xs text-muted">{user?.email ?? user?.phone ?? ''}</p>
          </div>

          <div className="p-1.5">
            <Link
              ref={firstItemRef}
              href="/profile"
              role="menuitem"
              tabIndex={-1}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-forest hover:bg-beige-light focus:bg-beige-light focus:outline-none"
              onClick={() => closeAndRestoreFocus()}
            >
              <User className="h-4 w-4 shrink-0 text-forest/50" aria-hidden="true" />
              Profile
            </Link>

            <Link
              href="/business/select"
              role="menuitem"
              tabIndex={-1}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-forest hover:bg-beige-light focus:bg-beige-light focus:outline-none"
              onClick={handleSwitchBusiness}
            >
              <Building2 className="h-4 w-4 shrink-0 text-forest/50" aria-hidden="true" />
              Switch Business
            </Link>

            <Link
              href="/settings"
              role="menuitem"
              tabIndex={-1}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-forest hover:bg-beige-light focus:bg-beige-light focus:outline-none"
              onClick={() => closeAndRestoreFocus()}
            >
              <Settings className="h-4 w-4 shrink-0 text-forest/50" aria-hidden="true" />
              Settings
            </Link>

            <div className="my-1.5 border-t border-forest/10" aria-hidden="true" />

            <button
              role="menuitem"
              tabIndex={-1}
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}