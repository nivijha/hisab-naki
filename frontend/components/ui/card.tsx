'use client';

import * as React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={[
      'rounded-[14px] border border-forest/10 bg-white shadow-card',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  />
));

Card.displayName = 'Card';

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={['flex flex-col space-y-1.5 p-6', className].filter(Boolean).join(' ')} {...props} />
));

CardHeader.displayName = 'CardHeader';

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={['text-xl font-semibold tracking-tight text-forest', className].filter(Boolean).join(' ')}
    {...props}
  />
));

CardTitle.displayName = 'CardTitle';

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = React.forwardRef<HTMLParagraphElement, CardDescriptionProps>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={['text-sm text-muted leading-relaxed', className].filter(Boolean).join(' ')}
    {...props}
  />
));

CardDescription.displayName = 'CardDescription';

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={['p-6 pt-0', className].filter(Boolean).join(' ')} {...props} />
));

CardContent.displayName = 'CardContent';

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={['flex items-center p-6 pt-0', className].filter(Boolean).join(' ')} {...props} />
));

CardFooter.displayName = 'CardFooter';
