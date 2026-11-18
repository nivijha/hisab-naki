import { ArrowDownRight, ArrowUpRight, Check, Mic } from 'lucide-react';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';

const ledgerRows = [
  { name: 'Raju Sharma', detail: 'Credit · grocery', amount: '₹450', icon: ArrowUpRight },
  { name: 'Meena Devi', detail: 'Payment received', amount: '₹1,200', icon: ArrowDownRight },
  { name: 'Amit Kumar', detail: 'Credit · household', amount: '₹780', icon: ArrowUpRight },
];

const supportingFeatures = [
  {
    number: '01',
    title: 'Speak in your own words',
    body: 'Say a name, amount and what happened. Hindi and English fit naturally in the same sentence.',
  },
  {
    number: '02',
    title: 'Balances come from entries',
    body: 'Credits add to what’s due; payments reduce it. The ledger calculates the running total.',
  },
  {
    number: '03',
    title: 'Close the day with a clear view',
    body: 'See sales, expenses, payments received and new credit together, without searching through pages.',
  },
];

export function Features() {
  return (
    <Section id="features" padding="lg" bg="beige">
      <div className="site-container">
        <SectionHeader className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <SectionTitle>A ledger that keeps pace with the shop</SectionTitle>
          <SectionDescription className="mt-0">
            Fast to update at the counter. Clear enough to check at the end of the day.
          </SectionDescription>
        </SectionHeader>

        <ScrollReveal className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="surface-panel min-w-0 rounded-sm border border-forest/20 bg-beige-light p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-forest/20 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Daily ledger</p>
                <p className="mt-1 font-serif text-2xl font-semibold tracking-tight text-forest">Namaste Stores</p>
              </div>
              <p className="text-sm text-muted">Tuesday, 18 November</p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-b border-forest/20 py-5 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Sales</p>
                <p className="mt-1 text-lg font-semibold text-forest">₹8,200</p>
              </div>
              <div>
                <p className="text-xs text-muted">Payments in</p>
                <p className="mt-1 text-lg font-semibold text-forest">₹2,650</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-muted">Outstanding</p>
                <p className="mt-1 text-lg font-semibold text-forest">₹18,450</p>
              </div>
            </div>

            <div className="py-4">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-forest">Recent entries</h3>
                <span className="text-xs text-muted">Today</span>
              </div>
              <div className="divide-y divide-forest/15">
                {ledgerRows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-forest">{row.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{row.detail}</p>
                      </div>
                      <p className="inline-flex items-center gap-1 text-sm font-semibold text-forest">
                        <Icon aria-hidden="true" className="h-4 w-4" /> {row.amount}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-purple p-4 text-forest-dark sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 gap-3">
                <span className="mic-motion mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                  <Mic aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em]">Voice entry · review first</p>
                  <p className="mt-1 text-sm leading-5">“Raju ko 450 rupaye ka samaan udhaar diya.”</p>
                </div>
              </div>
              <div className="mt-3 flex shrink-0 items-center gap-3 sm:mt-0">
                <span className="text-sm font-semibold">₹450 · Credit</span>
                <span className="inline-flex min-h-9 items-center gap-1.5 bg-forest px-3 text-xs font-semibold text-beige">
                  <Check aria-hidden="true" className="h-3.5 w-3.5" /> Confirm
                </span>
              </div>
            </div>
          </div>

          <div className="divide-y divide-forest/20">
            {supportingFeatures.map((feature) => (
              <article key={feature.number} className="grid grid-cols-[2.5rem_1fr] gap-4 py-6 first:pt-0 last:pb-0">
                <span className="pt-1 text-xs font-semibold tracking-[0.1em] text-muted">{feature.number}</span>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-forest">{feature.title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted sm:text-base">{feature.body}</p>
                </div>
              </article>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </Section>
  );
}
