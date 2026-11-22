import { Check, Mic, ScanText } from 'lucide-react';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';

const steps = [
  {
    number: '01',
    icon: Mic,
    title: 'Say what happened',
    body: '“Raju ko 450 rupaye ka samaan udhaar diya.” Speak naturally, in Hindi or English.',
  },
  {
    number: '02',
    icon: ScanText,
    title: 'Check the entry',
    body: 'HisabNaki shows the customer, amount and transaction type before saving.',
  },
  {
    number: '03',
    icon: Check,
    title: 'Confirm to save',
    body: 'One confirmation adds the entry. Your running balance updates from the ledger.',
  },
];

export function ProductDemo() {
  return (
    <Section id="how-it-works" padding="lg" bg="beige">
      <div className="site-container">
        <SectionHeader className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <SectionTitle>From spoken words to a saved entry</SectionTitle>
          <SectionDescription className="mt-0">
            Every transaction is shown for review before it becomes part of the customer’s account.
          </SectionDescription>
        </SectionHeader>

        <ScrollReveal className="reveal-stagger relative grid gap-8 lg:grid-cols-3 lg:gap-10">
          <div aria-hidden="true" className="absolute left-5 right-[calc((100%_-_5rem)/3_-_1.25rem)] top-5 hidden h-px bg-forest/25 lg:block" />
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <article key={step.number} className="process-step relative grid grid-cols-[2.5rem_1fr] gap-x-4 lg:block">
                <div className="process-step__number relative z-10 flex h-10 w-10 items-center justify-center bg-purple text-sm font-semibold text-forest-dark">
                  {step.number}
                </div>
                <div className="pb-2 pt-1 lg:mt-6 lg:pt-0">
                  <h3 className="mb-2 flex items-start gap-2 text-lg font-semibold tracking-tight text-forest">
                    <Icon aria-hidden="true" className="mt-1.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                    {step.title}
                  </h3>
                  <p className="max-w-sm text-sm leading-6 text-muted sm:text-base">{step.body}</p>
                </div>
              </article>
            );
          })}
        </ScrollReveal>
      </div>
    </Section>
  );
}
