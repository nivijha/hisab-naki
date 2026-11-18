import { Navbar, TrustBar } from '@/components/sections/navbar';
import { Hero } from '@/components/sections/hero';
import { ProductDemo } from '@/components/sections/product-demo';
import { ProblemSolution } from '@/components/sections/problem-solution';
import { Features, Trust } from '@/components/sections/features';
import { UseCases } from '@/components/sections/use-cases';
import { FinalCta } from '@/components/sections/final-cta';
import { Footer } from '@/components/sections/footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-beige text-forest">
      <Navbar />
      <TrustBar />
      <Hero />
      <ProductDemo />
      <ProblemSolution />
      <Features />
      <UseCases />
      <Trust />
      <FinalCta />
      <Footer />
    </main>
  );
}
