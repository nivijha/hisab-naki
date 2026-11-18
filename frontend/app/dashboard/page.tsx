'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, X, Clock, TrendingUp, CreditCard, Users, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { VoiceWaveform } from '@/components/ui/voice-waveform';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Summary = {
  businessName: string;
  todaysSales: number;
  todaysExpenses: number;
  paymentsReceived: number;
  newCredit: number;
  totalOutstanding: number;
  recentTransactions: Array<{
    id: string;
    customer?: { name: string };
    description: string;
    amount: number;
    type: string;
    createdAt: string;
  }>;
};

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  outstandingBalance: number;
  transactionCount: number;
};

type PendingIntent = {
  intent: string;
  customerName: string;
  amount: number;
  description: string;
  type: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const statCards = [
  { label: "Today's Sales", value: '₹0', delta: '+12%', icon: <DollarSign className="h-5 w-5" />, color: 'text-purple bg-purple/5' },
  { label: "Today's Expenses", value: '₹0', delta: '-8%', icon: <CreditCard className="h-5 w-5" />, color: 'text-forest-dark bg-forest/5' },
  { label: 'Payments Received', value: '₹0', delta: '+22%', icon: <TrendingUp className="h-5 w-5" />, color: 'text-purple bg-purple/5' },
  { label: 'Total Outstanding', value: '₹0', delta: '₹0 due', icon: <Users className="h-5 w-5" />, color: 'text-forest bg-beige' },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [responseText, setResponseText] = useState('Tap the microphone and tell me what happened.');
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const recognitionRef = useRef<any>(null);

  const loadDashboard = async () => {
    const response = await fetch(`${API_URL}/api/dashboard/summary`);
    const result = await response.json();
    if (result.ok) {
      setSummary(result.data);
    }
  };

  const loadCustomers = async () => {
    const response = await fetch(`${API_URL}/api/customers`);
    const result = await response.json();
    if (result.ok) {
      setCustomers(result.data);
    }
  };

  const loadTransactions = async () => {
    const response = await fetch(`${API_URL}/api/transactions`);
    const result = await response.json();
    if (result.ok) {
      setTransactions(result.data);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    loadDashboard();
    loadCustomers();
    loadTransactions();
  }, []);

  useEffect(() => () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
  }, []);

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'hi-IN';
    utterance.rate = 0.98;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleActionResult = async (intent: string, customerName: string, amount?: number, description?: string) => {
    const typeMap: Record<string, string> = {
      ADD_CREDIT: 'CREDIT',
      RECORD_PAYMENT: 'PAYMENT',
      ADD_SALE: 'SALE',
      ADD_EXPENSE: 'EXPENSE',
    };

    const body = {
      intent,
      customerName,
      amount,
      description,
      type: typeMap[intent],
    };

    const response = await fetch(`${API_URL}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    setVoiceStatus('idle');

    if (!result.ok) {
      setResponseText(result.message || 'I could not complete that transaction.');
      return;
    }

    const responseTextValue = result.responseText || 'Action complete.';
    setResponseText(responseTextValue);
    speak(responseTextValue);
    await loadDashboard();
    await loadCustomers();
    await loadTransactions();
  };

  const handleTranscript = async (text: string) => {
    if (!text.trim()) {
      return;
    }

    setLastTranscript(text);
    setVoiceStatus('processing');

    const response = await fetch(`${API_URL}/api/ai/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: text }),
    });

    const result = await response.json();
    const parsed = result.data;

    if (!parsed) {
      setResponseText('I could not understand that right now. Please try again.');
      return;
    }

    const isReadOnly = ['GET_BALANCE', 'GET_TOTAL_OUTSTANDING', 'GET_TODAY_TRANSACTIONS', 'GET_CUSTOMER_TRANSACTIONS'].includes(parsed.intent);

    if (parsed.missingFields && parsed.missingFields.length > 0) {
      setResponseText('Kitne rupaye ka udhaar diya?');
      speak('Kitne rupaye ka udhaar diya?');
      setVoiceStatus('idle');
      return;
    }

    if (isReadOnly) {
      const actionResponse = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: parsed.intent,
          customerName: parsed.customerName,
          amount: parsed.amount,
          description: parsed.description,
        }),
      });

      const actionResult = await actionResponse.json();
      const finalText = actionResult.responseText || 'Query complete.';
      setResponseText(finalText);
      speak(finalText);
      setVoiceStatus('idle');
      await loadDashboard();
      await loadCustomers();
      await loadTransactions();
      return;
    }

    if (parsed.customerName && parsed.amount) {
      const typeLabel =
        parsed.intent === 'ADD_CREDIT'
          ? 'Credit'
          : parsed.intent === 'RECORD_PAYMENT'
            ? 'Payment'
            : parsed.intent === 'ADD_SALE'
              ? 'Sale'
              : 'Expense';

      setPendingIntent({
        intent: parsed.intent,
        customerName: parsed.customerName,
        amount: parsed.amount,
        description: parsed.description || 'Ledger update',
        type: typeLabel,
      });
      setResponseText(`Add ${formatCurrency(parsed.amount)} ${parsed.intent === 'ADD_CREDIT' ? 'credit' : parsed.intent === 'RECORD_PAYMENT' ? 'payment' : parsed.intent === 'ADD_SALE' ? 'sale' : 'expense'} to ${parsed.customerName}?`);
      setVoiceStatus('idle');
      return;
    }

    setResponseText('I may have heard that incorrectly. Please repeat or edit the details.');
    setVoiceStatus('idle');
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setResponseText('Voice input is not supported in this browser. Use text input instead.');
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'hi-IN,en-IN';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => {
        setVoiceStatus('listening');
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');

        if (transcript.trim()) {
          setLastTranscript(transcript);
          setVoiceStatus('processing');
        }

        if (event.results && event.results[0] && event.results[0].isFinal) {
          handleTranscript(transcript);
        }
      };

      recognition.onerror = () => {
        setResponseText('I may have heard that incorrectly. Please repeat.');
        setVoiceStatus('idle');
      };

      recognition.onend = () => {
        setVoiceStatus((status) => (status === 'listening' ? 'idle' : status));
      };

      recognitionRef.current = recognition;
    }

    recognitionRef.current.start();
  };

  const summaryCards = statCards.map((card) => ({
    ...card,
    value: (() => {
      switch (card.label) {
        case "Today's Sales": return formatCurrency(summary?.todaysSales || 0);
        case "Today's Expenses": return formatCurrency(summary?.todaysExpenses || 0);
        case 'Payments Received': return formatCurrency(summary?.paymentsReceived || 0);
        case 'Total Outstanding': return formatCurrency(summary?.totalOutstanding || 0);
        default: return card.value;
      }
    })(),
  }));

  if (!isMounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-forest/60">
          <div className="h-8 w-8 rounded-full border-2 border-current border-r-transparent animate-spin" />
          <p className="text-sm font-medium text-forest">Loading HisabNaki…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-forest tracking-tight">{summary?.businessName || 'My Shop'}</h1>
          <p className="mt-1 text-sm text-forest/60">Voice-first digital ledger</p>
        </div>
        <Button
          onClick={() => {
            if (voiceStatus === 'listening') {
              recognitionRef.current?.stop();
            } else if (voiceStatus === 'idle') {
              startListening();
            }
          }}
          aria-pressed={voiceStatus === 'listening'}
          disabled={voiceStatus === 'processing'}
          className="ml-auto lg:ml-0"
        >
          <span className="mic-motion mr-2 flex h-7 w-7 items-center justify-center">
            {voiceStatus === 'listening' ? (
              <MicOff aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Mic aria-hidden="true" className="h-5 w-5" />
            )}
          </span>
          {voiceStatus === 'listening' ? 'Stop listening' : voiceStatus === 'processing' ? 'Processing…' : 'Start voice'}
        </Button>
      </div>

      <ScrollReveal className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-forest/60">{card.label}</CardTitle>
              <div className={`h-9 w-9 rounded-md flex items-center justify-center ${card.color}`}>{card.icon}</div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-forest">{card.value}</span>
                <span className="text-xs font-medium text-purple">{card.delta}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </ScrollReveal>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <ScrollReveal className="rounded-md border border-forest/10 bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center gap-3">
              <div className={`recording-indicator ${voiceStatus === 'listening' ? 'is-live' : ''}`} />
              <h2 aria-live="polite" aria-atomic="true" className="text-xl font-semibold text-forest">
                {voiceStatus === 'listening' ? 'Listening…' : voiceStatus === 'processing' ? 'Understanding…' : 'Voice input'}
              </h2>
            </div>
            {voiceStatus === 'listening' && <VoiceWaveform className="my-4" />}
            {lastTranscript && (
              <div className="mb-4 p-3 rounded-lg border border-forest/10 bg-beige">
                <p className="text-xs uppercase tracking-wider text-forest/40">Transcript</p>
                <p className="mt-1 text-sm text-forest">“{lastTranscript}”</p>
              </div>
            )}
            <div className="rounded-lg border border-purple/20 bg-purple/5 p-4">
              <p className="text-sm text-forest">{responseText}</p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.1} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">Recent transactions</CardTitle>
            </CardHeader>
            <CardContent className="py-0">
              <div className="space-y-3">
                {(transactions || []).slice(0, 5).length > 0 ? (
                  (transactions || []).slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between rounded-lg border border-forest/10 p-3 hover:bg-beige transition-colors">
                      <div>
                        <p className="font-semibold text-forest text-sm">{transaction.customer?.name || 'General'}</p>
                        <p className="text-xs text-forest/40">{transaction.description || 'Transaction'} • {formatDate(transaction.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-forest text-sm">{formatCurrency(transaction.amount)}</p>
                        <p className="text-xs uppercase tracking-wider text-forest/40">{transaction.type}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-forest/40">
                    <Clock className="h-8 w-8 opacity-50 mb-2" />
                    <p className="text-sm">No recent transactions</p>
                  </div>
                )}
              </div>
            </CardContent>
          </ScrollReveal>
        </div>

        <div className="space-y-6">
          <ScrollReveal delay={0.2} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft">
            <CardHeader>
              <CardTitle className="text-lg">Customers</CardTitle>
            </CardHeader>
            <CardContent className="py-0">
              <div className="space-y-3">
                {customers.length > 0 ? (
                  customers.map((customer) => (
                    <div key={customer.id} className="rounded-lg border border-forest/10 p-3 hover:bg-beige transition-colors">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div>
                          <p className="font-semibold text-forest text-sm">{customer.name}</p>
                          <p className="text-xs text-forest/40">{customer.phone || 'No phone saved'}</p>
                        </div>
                        <span className="rounded-full bg-purple/10 px-2.5 py-0.5 text-xs font-semibold text-purple">
                          {customer.transactionCount} txns
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-forest">{formatCurrency(customer.outstandingBalance)}</span>
                        <span className="text-xs text-forest/40">outstanding</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-forest/40">
                    <Users className="h-8 w-8 opacity-50 mb-2" />
                    <p className="text-sm">No customers yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </ScrollReveal>
        </div>
      </div>

      {pendingIntent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/40 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md rounded-lg border border-forest/10 bg-white p-6 shadow-forest"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-2xl">Confirm transaction</CardTitle>
            </CardHeader>
            <CardContent className="py-0 space-y-4">
              <div className="grid gap-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-forest/50">Customer</span>
                  <strong className="text-sm text-forest">{pendingIntent.customerName}</strong>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-forest/50">Amount</span>
                  <strong className="text-lg font-bold text-forest">{formatCurrency(pendingIntent.amount)}</strong>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-forest/50">Type</span>
                  <strong className="text-sm text-forest">{pendingIntent.type}</strong>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-forest/50">Description</span>
                  <strong className="text-sm text-forest">{pendingIntent.description}</strong>
                </div>
              </div>
              <p className="text-base font-medium text-forest">
                Add {formatCurrency(pendingIntent.amount)} {pendingIntent.type.toLowerCase()} to {pendingIntent.customerName}?
              </p>
            </CardContent>
            <CardFooter className="pt-4 space-y-2">
              <Button
                className="w-full"
                onClick={async () => {
                  await handleActionResult(pendingIntent.intent, pendingIntent.customerName, pendingIntent.amount, pendingIntent.description);
                  setPendingIntent(null);
                }}
              >
                Confirm
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setPendingIntent(null)}>
                Cancel
              </Button>
            </CardFooter>
          </motion.div>
        </div>
      )}
    </div>
  );
}
