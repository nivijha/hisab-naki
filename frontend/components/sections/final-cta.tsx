'use client';

import Link from 'next/link';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-forest py-[112px]">
      <div className="relative mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-beige sm:text-4xl leading-tight mb-6">
            Ready to stop typing your ledger?
          </h2>
          <p className="text-beige/90 text-lg mb-10">
            Start recording your credit book by voice today.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="w-full sm:w-auto">
            <Mic className="mr-2 h-5 w-5" />
            Start recording
          </Button>
          <Link href="/dashboard" className="text-sm font-medium text-beige underline underline-offset-4 hover:text-purple transition-colors">
            See the dashboard →
          </Link>
        </div>
      </div>
    </section>
  );
}
