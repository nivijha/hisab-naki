'use client';

import * as React from 'react';
import { motion } from 'framer-motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

export const ScrollReveal = React.forwardRef<HTMLDivElement, ScrollRevealProps>(
  ({ className, children, delay = 0, duration = 0.6 }, ref) => (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, transition: { duration, delay, ease: 'easeOut' as const } }}
    >
      {children}
    </motion.div>
  ),
);

ScrollReveal.displayName = 'ScrollReveal';

interface RevealListProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}

export const RevealList = React.forwardRef<HTMLDivElement, RevealListProps>(
  ({ className, children, stagger = 0.1 }, ref) => (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const, staggerChildren: stagger }}
    >
      {children}
    </motion.div>
  ),
);

RevealList.displayName = 'RevealList';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'default' | 'lg';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'default', ...props }, ref) => {
    const sizes: Record<string, string> = { sm: 'h-8 w-8', default: 'h-10 w-10', lg: 'h-12 w-12' };
    const variants: Record<string, string> = {
      default: 'bg-purple text-forest hover:bg-purple-dark',
      ghost: 'bg-beige text-forest hover:bg-beige-dark hover:text-forest',
      outline: 'border border-forest/10 bg-white text-forest hover:bg-beige-light',
    };
    return (
      <button
        ref={ref}
        className={['inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple', sizes[size], variants[variant], className].filter(Boolean).join(' ')}
        {...props}
      />
    );
  },
);

IconButton.displayName = 'IconButton';
