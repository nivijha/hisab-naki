'use client';

import { ScrollReveal, RevealList } from '@/components/ui/scroll-reveal';
import { Mic, Sparkles, CheckCircle2 } from 'lucide-react';
import { Section, SectionHeader, SectionTitle, SectionDescription } from '@/components/ui/section';

const steps = [
  {
    icon: <Mic className="h-6 w-6 text-purple" />,
    title: 'Speak your transaction',
    body: 'Say what happened in Hindi or English — “Raju ko 450 rupaye ka samaan udhaar diya.”',
  },
  {
    icon: <Sparkles className="h-6 w-6 text-purple" />,
    title: 'AI interprets the intent',
    body: 'HisabNaki parses the transcript into a structured ledger command — customer, amount, type.',
  },
  {
    icon: <CheckCircle2 className="h-6 w-6 text-purple" />,
    title: 'Confirm and save',
    body: 'Review the interpreted action, confirm with one tap, and it is recorded to your ledger.',
  },
];

export function ProductDemo() {
  return (
    <Section id="product-demo" padding="lg" bg="beige">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <SectionHeader>
          <SectionTitle>From voice to ledger in three steps</SectionTitle>
          <SectionDescription>
            No forms to fill. No columns to type. Just speak and your books update themselves.
          </SectionDescription>
        </SectionHeader>

        <div className="grid md:grid-cols-3 gap-8">
          <RevealList stagger={0.1}>
            {steps.map((step, i) => (
              <div key={i} className="rounded-lg border border-forest/10 bg-white p-8 shadow-soft">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple/10 mb-6">
                  {step.icon}
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-forest mb-3">{step.title}</h3>
                  <p className="text-muted leading-relaxed">{step.body}</p>
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-8 flex justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-forest/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </RevealList>
        </div>
      </div>
    </Section>
  );
}
