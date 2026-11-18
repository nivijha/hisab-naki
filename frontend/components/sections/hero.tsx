'use client';

import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { Mic, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-32 lg:pt-32 lg:pb-48 bg-forest">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div className="lg:pr-24">
            <ScrollReveal delay={0.1} className="mb-8 inline-flex items-center gap-2 rounded-full border border-forest-light bg-forest-light px-3 py-1 text-xs font-semibold text-purple">
              <Mic className="h-4 w-4 text-purple" />
              Voice-first ledger
            </ScrollReveal>

            <ScrollReveal delay={0.2}>
              <h1 className="text-4xl font-bold tracking-tight text-beige sm:text-5xl lg:text-6xl leading-[1.1] mb-8">
                Record your shop’s{' '}
                <br />
                <span className="text-purple">entire ledger by voice.</span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={0.3}>
              <p className="text-lg text-beige/90 max-w-xl leading-relaxed mb-10">
                Speak in Hindi or English. HisabNaki interprets your transactions, confirms them with you, and saves them to a
                deterministic ledger — no typing, no mistakes.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.4} className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="w-full sm:w-auto">
                Start recording <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                See how it works
              </Button>
            </ScrollReveal>
          </div>

          <div className="relative hidden lg:block">
            <ScrollReveal delay={0.5} className="relative rounded-xl border border-forest-light bg-white shadow-forest p-[18px]">
              <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-full border border-forest/20 bg-forest/5">
                <div className="h-2 w-2 rounded-full bg-purple animate-pulse" />
                <span className="text-xs font-medium text-forest/60">Listening…</span>
              </div>
              <div className="mb-6 p-4 rounded-lg border border-forest/10 bg-beige">
                <p className="text-xs uppercase tracking-wider text-forest/40">Transcript</p>
                <p className="mt-1 text-forest">“Raju ko 450 rupaye ka samaan udhaar diya.”</p>
              </div>
              <div className="mb-6 p-4 rounded-lg border border-purple/20 bg-purple/5">
                <p className="text-xs uppercase tracking-wider text-purple-dark">Interpreted intent</p>
                <p className="mt-1 text-forest">Add credit of ₹450 to Raju</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" className="flex-1">
                  Confirm
                </Button>
                <Button variant="destructive" size="sm" className="flex-1">
                  Edit
                </Button>
              </div>
              <div className="absolute -bottom-8 -left-8 flex items-center gap-2 rounded-lg border border-forest-light bg-white p-3 shadow-soft">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-purple">
                  <Mic className="h-5 w-5 text-forest" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-forest">₹450</p>
                  <p className="text-xs text-forest/60">Credit · Raju</p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
