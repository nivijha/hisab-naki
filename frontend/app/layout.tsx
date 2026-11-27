import './globals.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth/auth-provider';

const inter = Inter({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'HisabNaki',
  description: 'Voice-first digital ledger for small businesses.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'HisabNaki — Voice-first digital ledger',
    description: 'Record sales, expenses, and credit by speaking. Built for small Indian shopkeepers.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased"><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
