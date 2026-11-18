import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ScrollReveal } from '@/components/ui/scroll-reveal';

export function FinalCta() {
  return (
    <section className="bg-beige pb-16 sm:pb-20">
      <div className="site-container">
        <ScrollReveal className="grid gap-8 bg-purple p-6 text-forest-dark sm:p-10 md:grid-cols-[1fr_auto] md:items-center md:gap-12 lg:p-12">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em]">Bas bolo, hisaab ho gaya.</p>
            <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-forest-dark text-balance sm:text-4xl">
              Keep the shop moving. Keep the books clear.
            </h2>
          </div>
          <Link
            href="/dashboard"
            className="motion-interactive inline-flex min-h-12 items-center justify-center gap-3 rounded-sm bg-forest px-5 text-sm font-semibold text-beige hover:bg-forest-light focus-visible:outline-offset-4"
          >
            Open HisabNaki <ArrowRight aria-hidden="true" className="arrow-motion h-4 w-4" />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}
