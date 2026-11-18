import * as React from 'react';

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={[
      'mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </div>
));

Container.displayName = 'Container';

interface SectionProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  bg?: 'beige' | 'forest' | 'white';
}

export const Section = React.forwardRef<HTMLDivElement, SectionProps>(
  ({ className, children, padding = 'lg', bg = 'beige', ...props }, ref) => {
    const paddingMap: Record<string, string> = {
      none: '',
      sm: 'py-20',
      md: 'py-28',
      lg: 'py-[112px]',
    };
    const bgMap: Record<string, string> = {
      beige: 'bg-beige',
      forest: 'bg-forest',
      white: 'bg-white',
    };
    return (
      <section
        ref={ref}
        className={['relative', paddingMap[padding], bgMap[bg], className].filter(Boolean).join(' ')}
        {...props}
      >
        {children}
      </section>
    );
  },
);

Section.displayName = 'Section';

interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={['text-center max-w-2xl mx-auto mb-16 lg:mb-24', className].filter(Boolean).join(' ')} {...props}>
    {children}
  </div>
));

SectionHeader.displayName = 'SectionHeader';

interface SectionTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export const SectionTitle = React.forwardRef<HTMLHeadingElement, SectionTitleProps>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={['text-3xl font-semibold tracking-tight text-forest sm:text-4xl', className].filter(Boolean).join(' ')} {...props} />
));

SectionTitle.displayName = 'SectionTitle';

interface SectionDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const SectionDescription = React.forwardRef<HTMLParagraphElement, SectionDescriptionProps>(({ className, ...props }, ref) => (
  <p ref={ref} className={['text-lg text-muted mt-4 sm:mt-6 max-w-2xl mx-auto leading-relaxed', className].filter(Boolean).join(' ')} {...props} />
));

SectionDescription.displayName = 'SectionDescription';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline';
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant = 'default', ...props }, ref) => {
  const variants: Record<string, string> = {
    default: 'bg-purple text-forest px-2.5 py-0.5 rounded-full text-xs font-semibold',
    secondary: 'bg-beige text-forest px-2.5 py-0.5 rounded-full text-xs font-semibold border border-beige-dark',
    outline: 'border border-forest bg-white text-forest px-2.5 py-0.5 rounded-full text-xs font-semibold',
  };
  return (
    <span ref={ref} className={[variants[variant], className].filter(Boolean).join(' ')} {...props} />
  );
});

Badge.displayName = 'Badge';
