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
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]';

const variants: Record<Variant, string> = {
  default: 'bg-purple text-forest shadow-sm hover:bg-purple-dark',
  destructive: 'bg-forest-dark text-beige hover:bg-forest',
  outline: 'border border-forest/20 bg-white hover:bg-beige-light text-forest',
  secondary: 'bg-beige text-forest hover:bg-beige-dark',
  ghost: 'hover:bg-beige-light text-forest/80 hover:text-forest',
  link: 'text-purple underline-offset-4 hover:underline',
};

const sizes: Record<Size, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 rounded-sm px-3',
  lg: 'h-11 rounded-md px-8',
  icon: 'h-10 w-10',
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
