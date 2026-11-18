'use client';

import { ArrowDownRight, ArrowUpRight, BookOpenText } from 'lucide-react';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Section } from '@/components/ui/section';

const balances = [
  { name: 'Raju Sharma', entry: 'Grocery · 10:42 am', amount: '₹450', direction: 'up' },
  { name: 'Meena Devi', entry: 'Payment · 10:18 am', amount: '₹1,200', direction: 'down' },
  { name: 'Amit Kumar', entry: 'Household · 9:56 am', amount: '₹780', direction: 'up' },
];

export function ProblemSolution() {
  return (
    <Section id="problem-solution" padding="lg" bg="forest" className="text-beige">
      <ScrollReveal className="site-container grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="max-w-xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-beige">The cost of a missed entry</p>
          <h2 className="mb-6 font-serif text-3xl font-semibold leading-tight tracking-tight text-beige text-balance sm:text-4xl">
            A paper book can’t keep up with a busy counter.
          </h2>
          <p className="max-w-lg text-base leading-7 text-beige sm:text-lg sm:leading-8">
            When customers are waiting, a sale gets written down later—or not at all. Then it’s hard to remember who paid, what’s still due, or where the number came from.
          </p>
          <div className="mt-8 border-t border-beige/25">
            <p className="border-b border-beige/25 py-3 text-sm text-beige">Entries get delayed until closing time.</p>
            <p className="border-b border-beige/25 py-3 text-sm text-beige">Old balances are difficult to check quickly.</p>
            <p className="py-3 text-sm text-beige">A disputed amount means searching page by page.</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="surface-panel border border-beige/20 bg-beige p-5 text-forest sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-forest/20 pb-5">
              <div>
                <div className="mb-3 flex items-center gap-2 text-muted">
                  <BookOpenText aria-hidden="true" className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.12em]">Customer ledger</span>
                </div>
                <p className="font-serif text-2xl font-semibold tracking-tight text-forest">Outstanding balances</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs text-muted">3 customers due</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-forest">₹18,450</p>
              </div>
            </div>

            <div className="divide-y divide-forest/15">
              {balances.map((balance) => (
                <div key={balance.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-forest">{balance.name}</p>
                    <p className="mt-1 text-xs text-muted">{balance.entry}</p>
                  </div>
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest">
                    {balance.direction === 'up' ? (
                      <ArrowUpRight aria-label="Credit added" className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight aria-label="Payment received" className="h-4 w-4" />
                    )}
                    {balance.amount}
                  </p>
                </div>
              ))}
            </div>

            <p className="border-t border-forest/20 pt-4 text-xs leading-5 text-muted">
              Each balance is the sum of confirmed entries—not an estimate.
            </p>
          </div>
        </div>
      </ScrollReveal>
    </Section>
  );
}
