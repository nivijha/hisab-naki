import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { ScrollReveal } from '@/components/ui/scroll-reveal';

const useCases = [
  {
    number: '01',
    title: 'The kirana owner',
    body: 'Add a customer’s udhaar while packing the order. No need to put the queue on hold to find a pen.',
  },
  {
    number: '02',
    title: 'The neighbourhood retailer',
    body: 'Record payments as they come in and check what each regular customer still owes.',
  },
  {
    number: '03',
    title: 'The family-run shop',
    body: 'Keep one running book of sales, expenses and credit that everyone can review at closing.',
  },
];

export function UseCases() {
  return (
    <Section id="use-cases" padding="lg" bg="beige">
      <div className="site-container">
        <SectionHeader className="grid gap-5 md:grid-cols-[1.1fr_0.9fr] md:items-end">
          <SectionTitle>Made for the rhythm of a local shop</SectionTitle>
          <SectionDescription className="mt-0">
            When your hands are busy and customers are waiting, your ledger should still be easy to keep.
          </SectionDescription>
        </SectionHeader>

        <ScrollReveal className="reveal-stagger grid gap-8 md:grid-cols-3 md:gap-10">
          {useCases.map((item) => (
            <article key={item.number} className="use-case min-h-full border-t-2 border-forest/30 pt-5">
              <p className="mb-5 text-xs font-semibold tracking-[0.12em] text-muted">{item.number}</p>
              <h3 className="font-serif text-xl font-semibold leading-snug tracking-tight text-forest">{item.title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted sm:text-base">{item.body}</p>
            </article>
          ))}
        </ScrollReveal>
      </div>
    </Section>
  );
}
