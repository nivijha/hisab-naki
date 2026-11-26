import { Navbar } from '@/components/sections/navbar';
import { Hero } from '@/components/sections/hero';
import { ProductDemo } from '@/components/sections/product-demo';
import { ProblemSolution } from '@/components/sections/problem-solution';
import { Features } from '@/components/sections/features';
import { UseCases } from '@/components/sections/use-cases';
import { FinalCta } from '@/components/sections/final-cta';
import { Footer } from '@/components/sections/footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-beige text-forest">
      <Navbar />
      <main>
        <Hero />
        <ProductDemo />
        <ProblemSolution />
        <Features />
        <UseCases />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
