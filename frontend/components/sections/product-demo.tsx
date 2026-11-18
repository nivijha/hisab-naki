'use client';

import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Mic, Sparkles, CheckCircle2 } from 'lucide-react';
import { Section, SectionHeader, SectionTitle, SectionDescription } from '@/components/ui/section';

const steps = [
  {
    number: '01',
    icon: <Mic className="h-6 w-6 text-purple" />,
    title: 'Speak your transaction',
    body: 'Say what happened in Hindi or English — “Raju ko 450 rupaye ka samaan udhaar diya.”',
  },
  {
    number: '02',
    icon: <Sparkles className="h-6 w-6 text-purple" />,
    title: 'AI interprets the intent',
    body: 'HisabNaki parses the transcript into a structured ledger command — customer, amount, type.',
  },
  {
    number: '03',
    icon: <CheckCircle2 className="h-6 w-6 text-purple" />,
    title: 'Confirm and save',
    body: 'Review the interpreted action, confirm with one tap, and it is recorded to your ledger.',
  },
];

export function ProductDemo() {
  return (
    <Section id="how-it-works" padding="lg" bg="beige">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionHeader>
          <SectionTitle>From voice to ledger in three steps</SectionTitle>
          <SectionDescription>
            No forms to fill. No columns to type. Just speak and your books update themselves.
          </SectionDescription>
        </SectionHeader>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {steps.map((step, i) => (
            <ScrollReveal key={i} delay={i * 0.08} className="rounded-lg border border-forest/10 bg-white p-8 shadow-soft">
              <div className="flex items-start gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple/10 shrink-0">
                  <span className="text-sm font-semibold text-purple-dark">{step.number}</span>
                </div>
                <div>{step.icon}</div>
              </div>
              <h3 className="text-lg font-semibold text-forest mb-3">{step.title}</h3>
              <p className="text-muted leading-relaxed">{step.body}</p>
              {i < steps.length - 1 && (
                <div className="mt-8 h-[1px] w-full bg-forest/10" />
              )}
            </ScrollReveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
