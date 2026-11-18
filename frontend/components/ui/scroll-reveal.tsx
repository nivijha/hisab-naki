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
  ({ className, children, delay = 0, duration = 0.45 }, forwardedRef) => {
    const elementRef = React.useRef<HTMLDivElement | null>(null);

    React.useImperativeHandle(forwardedRef, () => elementRef.current!, []);

    React.useEffect(() => {
      const element = elementRef.current;
      if (
        !element ||
        !('IntersectionObserver' in window) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            element.classList.add('is-revealed');
            observer.unobserve(element);
          }
        },
        { threshold: 0.1, rootMargin: '0px 0px -24px 0px' },
      );

      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    const style: React.CSSProperties & {
      '--reveal-delay': string;
      '--reveal-duration': string;
    } = {
      '--reveal-delay': `${delay}s`,
      '--reveal-duration': `${duration}s`,
    };

    return (
      <div ref={elementRef} className={['scroll-reveal', className].filter(Boolean).join(' ')} style={style}>
        {children}
      </div>
    );
  },
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
    const sizes: Record<string, string> = { sm: 'h-11 w-11', default: 'h-11 w-11', lg: 'h-12 w-12' };
    const variants: Record<string, string> = {
      default: 'bg-purple text-forest hover:bg-purple-dark',
      ghost: 'bg-beige text-forest hover:bg-beige-dark hover:text-forest',
      outline: 'border border-forest/10 bg-white text-forest hover:bg-beige-light',
    };
    return (
      <button
        ref={ref}
        className={['inline-flex items-center justify-center rounded-sm text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple', sizes[size], variants[variant], className].filter(Boolean).join(' ')}
        {...props}
      />
    );
  },
);

IconButton.displayName = 'IconButton';
