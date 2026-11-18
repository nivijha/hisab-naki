'use client';

import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Section, SectionHeader, SectionTitle, SectionDescription } from '@/components/ui/section';

export function ProblemSolution() {
  return (
    <Section id="problem-solution" padding="lg" bg="forest">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <ScrollReveal delay={0.1} className="mb-6 inline-flex items-center gap-2 rounded-full border border-forest-light bg-forest-light px-3 py-1 text-xs font-semibold text-purple">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              The problem
            </ScrollReveal>

            <ScrollReveal delay={0.2}>
              <h2 className="text-3xl font-semibold tracking-tight text-beige sm:text-4xl leading-[1.2] mb-8">
                Credit books are still paper and memory
              </h2>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
              <p className="text-lg text-beige/90 max-w-xl leading-relaxed mb-8">
                Small shopkeepers track dues in notebooks or from memory. A missed entry, a forgotten amount,
                or a disputed balance costs real money — and there is no undo.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.4}>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-forest-light shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-beige/80 leading-relaxed">No running balance visible at a glance.</p>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-forest-light shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-beige/80 leading-relaxed">Entries are hard to search or verify later.</p>
                </div>
              </div>
            </ScrollReveal>
          </div>

          <div className="relative">
            <ScrollReveal delay={0.5} className="relative rounded-lg border border-forest-light bg-beige p-[18px] shadow-forest">
              <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-full border border-forest/20 bg-forest/5">
                <div className="h-2 w-2 rounded-full bg-purple animate-pulse" />
                <span className="text-xs font-medium text-forest/60">Ledger view</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md border border-forest/10 bg-white">
                  <div>
                    <p className="text-sm font-semibold text-forest">Raju</p>
                    <p className="text-xs text-forest/40">Outstanding balance</p>
                  </div>
                  <p className="text-sm font-bold text-forest">₹450</p>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-forest/10 bg-white">
                  <div>
                    <p className="text-sm font-semibold text-forest">Meena</p>
                    <p className="text-xs text-forest/40">Outstanding balance</p>
                  </div>
                  <p className="text-sm font-bold text-forest">₹1,200</p>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-forest/10 bg-white">
                  <div>
                    <p className="text-sm font-semibold text-forest">Today’s total</p>
                    <p className="text-xs text-forest/40">Sales + credit</p>
                  </div>
                  <p className="text-sm font-bold text-forest">₹3,150</p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </Section>
  );
}
