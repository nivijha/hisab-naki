'use client';

import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { User, DollarSign, Building } from 'lucide-react';
import { Section, SectionHeader, SectionTitle, SectionDescription } from '@/components/ui/section';

const useCases = [
  {
    icon: <User className="h-6 w-6 text-purple" />,
    title: 'Individual shopkeeper',
    body: 'Run your daily credit book by voice while serving customers — no paperwork between sales.',
  },
  {
    icon: <DollarSign className="h-6 w-6 text-purple" />,
    title: 'Proprietor',
    body: 'Track sales, expenses, and payments across the day with a live outstanding balance.',
  },
  {
    icon: <Building className="h-6 w-6 text-purple" />,
    title: 'Small store team',
    body: 'Record transactions as they happen and reconcile the ledger at closing time.',
  },
];

export function UseCases() {
  return (
    <Section id="use-cases" padding="lg" bg="beige">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionHeader>
          <SectionTitle>Who uses HisabNaki</SectionTitle>
          <SectionDescription>
            Anyone who runs a shop on credit and wants their books up to date without touching a keyboard.
          </SectionDescription>
        </SectionHeader>

        <div className="grid md:grid-cols-3 gap-6">
          {useCases.map((item, i) => (
            <ScrollReveal key={i} delay={i * 0.08} className="rounded-lg border border-forest/10 bg-white p-8 shadow-soft">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-purple/10 mb-6">
                {item.icon}
              </div>
              <h3 className="text-lg font-semibold text-forest mb-3">{item.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{item.body}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
