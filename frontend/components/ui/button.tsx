'use client';

import * as React from 'react';

type Variant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';

type Size = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[8px] text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:transform-none motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]';

const variants: Record<Variant, string> = {
  default: 'bg-purple text-forest-dark shadow-sm hover:bg-beige',
  destructive: 'bg-forest-dark text-beige hover:bg-forest',
  outline: 'border border-forest/20 bg-white hover:bg-beige-light text-forest',
  secondary: 'bg-beige text-forest hover:bg-beige-dark',
  ghost: 'hover:bg-beige-light text-forest/80 hover:text-forest',
  link: 'text-forest underline-offset-4 hover:underline',
};

const sizes: Record<Size, string> = {
  default: 'h-11 px-4 py-2',
  sm: 'h-11 rounded-sm px-3',
  lg: 'h-11 rounded-sm px-8',
  icon: 'h-11 w-11',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={[base, variants[variant], sizes[size], className].filter(Boolean).join(' ')}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
