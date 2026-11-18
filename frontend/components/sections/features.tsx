'use client';

import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Smartphone, CreditCard, Users, TrendingUp, ShieldCheck } from 'lucide-react';
import { Section, SectionHeader, SectionTitle, SectionDescription, Badge } from '@/components/ui/section';

const features = [
  {
    title: 'Voice-first entry',
    body: 'Record sales, expenses, and credit by speaking naturally. No typing required.',
    icon: <Smartphone className="h-6 w-6 text-purple" />,
  },
  {
    title: 'Deterministic ledger',
    body: 'Calculations are done on the backend, not by an LLM — your balances are always exact.',
    icon: <CreditCard className="h-6 w-6 text-purple" />,
  },
  {
    title: 'Customer-wise outstanding',
    body: 'See exactly how much each customer owes you at a glance.',
    icon: <Users className="h-6 w-6 text-purple" />,
  },
  {
    title: 'Daily summary',
    body: 'Track today’s sales, expenses, payments, and outstanding credit in one view.',
    icon: <TrendingUp className="h-6 w-6 text-purple" />,
  },
];

export function Features() {
  return (
    <Section id="features" padding="lg" bg="beige">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionHeader className="mb-16 lg:mb-24">
          <SectionTitle>Built for shopkeepers, not accountants</SectionTitle>
          <SectionDescription>
            Everything you need to run your shop’s credit book — nothing you don’t.
          </SectionDescription>
        </SectionHeader>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
            <ScrollReveal key={i} delay={i * 0.05} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft hover:shadow-forest transition-shadow group">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white mb-4 group-hover:bg-purple transition-colors">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-forest mb-3">{feature.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{feature.body}</p>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function Trust() {
  return (
    <section className="border-y border-forest/10 bg-forest py-[80px]">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-10 lg:gap-20 opacity-90">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-beige" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-beige/90">Encrypted in transit</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-beige/30 text-beige/90">Offline-first</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-beige/30 text-beige/90">Hindi + English</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-beige/30 text-beige/90">No LLM math</Badge>
          </div>
        </div>
      </div>
    </section>
  );
}
