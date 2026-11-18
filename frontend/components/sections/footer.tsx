import Link from 'next/link';
import { Mic } from 'lucide-react';

const footerLinks = {
  product: ['How it works', 'Features', 'Use cases'],
  resources: ['Documentation', 'API', 'Privacy', 'Terms'],
  company: ['About', 'Contact'],
} as const;

export function Footer() {
  return (
    <footer className="border-t border-forest/10 bg-forest py-[80px]">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-12">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple">
              <Mic className="h-5 w-5 text-forest" />
            </div>
            <span className="font-bold text-xl tracking-tight text-beige">HisabNaki</span>
          </div>

          <div className="hidden lg:flex lg:flex-1 lg:gap-16 text-sm">
            <div className="space-y-4">
              <p className="font-semibold text-beige uppercase text-xs tracking-wider">Product</p>
              {footerLinks.product.map((label) => (
                <Link key={label} href={`#${label.toLowerCase()}`} className="text-beige/80 hover:text-purple transition-colors">
                  {label}
                </Link>
              ))}
            </div>
            <div className="space-y-4">
              <p className="font-semibold text-beige uppercase text-xs tracking-wider">Resources</p>
              {footerLinks.resources.map((label) => (
                <Link key={label} href={`#${label.toLowerCase()}`} className="text-beige/80 hover:text-purple transition-colors">
                  {label}
                </Link>
              ))}
            </div>
            <div className="space-y-4">
              <p className="font-semibold text-beige uppercase text-xs tracking-wider">Company</p>
              {footerLinks.company.map((label) => (
                <Link key={label} href={`#${label.toLowerCase()}`} className="text-beige/80 hover:text-purple transition-colors">
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-beige/80">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-purple transition-colors">
              GitHub
            </a>
          </div>
        </div>

        <div className="mt-16 border-t border-forest/10 pt-8 text-center text-xs text-beige/50">
          HisabNaki. Voice-first digital ledger for small businesses.
        </div>
      </div>
    </footer>
  );
}
