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

        {/* Prominent first feature */}
        <ScrollReveal delay={0.1} className="mb-12 lg:mb-20">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-forest sm:text-3xl mb-6">
                {features[0].title}
              </h3>
              <p className="text-lg text-muted leading-relaxed mb-8 max-w-lg">
                {features[0].body}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-forest/10">
                  {features[0].icon}
                </div>
                <span className="text-sm font-medium text-forest">Start by speaking</span>
              </div>
            </div>
            <div className="rounded-lg border border-forest/10 bg-white p-8 shadow-soft">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-md border border-forest/10 bg-beige">
                  <div>
                    <p className="text-sm font-semibold text-forest">“Raju ko 450 rupaye ka samaan udhaar diya.”</p>
                    <p className="text-xs text-forest/40">Transcript</p>
                  </div>
                  <span className="text-xs font-medium text-purple">Voice input</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-forest/10 bg-white">
                  <div>
                    <p className="text-sm font-semibold text-forest">Add credit of ₹450 to Raju</p>
                    <p className="text-xs text-forest/40">Interpreted intent</p>
                  </div>
                  <span className="text-xs font-medium text-forest">AI processing</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-forest/10 bg-beige">
                  <div>
                    <p className="text-sm font-semibold text-forest">Confirmed and saved</p>
                    <p className="text-xs text-forest/40">Ledger entry</p>
                  </div>
                  <span className="text-xs font-medium text-forest">Saved</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Supporting features - varied composition */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.slice(1).map((feature, i) => (
            <ScrollReveal key={i} delay={i * 0.05} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white mb-4 border border-forest/10">
                {feature.icon}
              </div>
              <h4 className="text-base font-semibold text-forest mb-3">{feature.title}</h4>
              <p className="text-sm text-muted leading-relaxed">{feature.body}</p>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={0.5} className="mt-16 lg:mt-24 border-y border-forest/10 bg-white py-[80px]">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Badge variant="outline">Encrypted in transit</Badge>
              <Badge variant="outline">Offline-first</Badge>
              <Badge variant="outline">No LLM math</Badge>
            </div>
            <h3 className="text-xl font-semibold text-forest mb-4">Trust built in</h3>
            <p className="text-muted leading-relaxed">
              Your ledger data stays yours. Calculations are deterministic — no guesswork, no hallucinated numbers.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </Section>
  );
}

export function Trust() {
  return null;
}
