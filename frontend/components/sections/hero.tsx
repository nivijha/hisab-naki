import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Mic, MoveRight } from 'lucide-react';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { VoiceWaveform } from '@/components/ui/voice-waveform';

export function Hero() {
  return (
    <section className="bg-forest pb-16 pt-28 text-beige lg:pb-24 lg:pt-36">
      <div className="site-container">
        <div className="grid items-center gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14">
          <div className="max-w-[35rem]">
            <ScrollReveal delay={0.05} className="mb-6 inline-flex items-center gap-2 bg-purple px-3 py-1.5 text-xs font-semibold tracking-wide text-forest-dark">
              <Mic aria-hidden="true" className="h-4 w-4 text-forest-dark" />
              A voice-first shop ledger
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <h1 className="mb-6 font-serif text-[2.75rem] font-semibold leading-[1.06] tracking-[-0.035em] text-beige text-balance sm:text-5xl xl:text-[3.65rem]">
                Your shop’s hisaab,
                <br className="hidden sm:block" /> just say it.
              </h1>
              <p className="max-w-[34rem] text-base leading-7 text-beige sm:text-lg sm:leading-8">
                Record udhaar, payments and daily sales in Hindi or English. Check every entry before it reaches your books.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.2} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/dashboard"
                className="motion-interactive inline-flex min-h-12 items-center gap-3 rounded-sm bg-purple px-5 text-sm font-semibold text-forest-dark hover:bg-beige focus-visible:outline-offset-4"
              >
                Open your ledger <MoveRight aria-hidden="true" className="arrow-motion h-4 w-4" />
              </Link>
              <Link href="#how-it-works" className="motion-interactive inline-flex min-h-11 items-center gap-2 text-sm font-medium text-beige underline decoration-beige/50 underline-offset-4 transition-colors hover:decoration-beige">
                See how it works <ArrowDownRight aria-hidden="true" className="arrow-motion h-4 w-4" />
              </Link>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={0.15} className="min-w-0">
            <div className="surface-panel border border-beige/20 bg-beige p-4 text-forest sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest/15 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">NAMASTE STORES</p>
                  <p className="mt-1 text-sm font-medium">Today, 18 November</p>
                </div>
                <Link href="/dashboard" className="motion-interactive inline-flex min-h-10 items-center gap-2 rounded-sm border border-forest/20 px-3 text-xs font-semibold text-forest hover:bg-purple hover:text-forest-dark">
                  View ledger <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 py-5 sm:grid-cols-3">
                <div className="col-span-2 border-l-2 border-purple pl-3 sm:col-span-1">
                  <p className="text-xs text-muted">Outstanding</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">₹18,450</p>
                </div>
                <div className="border-l border-forest/15 pl-3">
                  <p className="text-xs text-muted">Sales today</p>
                  <p className="mt-1 text-lg font-semibold">₹8,200</p>
                </div>
                <div className="border-l border-forest/15 pl-3">
                  <p className="text-xs text-muted">Collected</p>
                  <p className="mt-1 text-lg font-semibold">₹2,650</p>
                </div>
              </div>

              <div className="rounded-sm border border-forest/15 bg-beige-light p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">SAMPLE VOICE ENTRY · NEEDS CONFIRMATION</p>
                  <span className="mic-motion flex h-8 w-8 shrink-0 items-center justify-center bg-purple text-forest-dark">
                    <Mic aria-hidden="true" className="h-4 w-4" />
                  </span>
                </div>
                <div className="my-4">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Decorative sample · not recording</p>
                  <VoiceWaveform />
                </div>
                <p className="voice-demo__transcript mt-3 border-l-2 border-forest/20 pl-3 text-sm leading-6 text-forest">
                  “Raju ko 450 rupaye ka samaan udhaar diya.”
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-forest/15 pt-4">
                  <div className="voice-demo__interpretation">
                    <p className="text-xs text-muted">Customer: Raju</p>
                    <p className="mt-1 font-semibold">
                      <span className="text-xs font-medium text-muted">Amount:</span>{' '}
                      <span className="text-xl">₹450</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-forest">
                      <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /> Credit
                    </span>
                    <span className="voice-demo__confirmation bg-forest px-3 py-2 text-xs font-semibold text-beige">Confirm</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-3 border-t border-forest/15 pt-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">RECENT</p>
                  <p className="mt-2 text-sm font-medium">Meena · Payment received</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">₹1,200</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                    <ArrowDownRight aria-hidden="true" className="h-3.5 w-3.5" /> settled
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
