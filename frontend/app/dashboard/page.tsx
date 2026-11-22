'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Mic, MicOff, Clock, TrendingUp, CreditCard, Users, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { VoiceWaveform } from '@/components/ui/voice-waveform';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type Transaction = {
  id: string;
  customer?: { name: string } | null;
  description: string;
  amount: number;
  type: string;
  createdAt: string;
};

type Summary = {
  businessName: string;
  todaysSales: number;
  todaysExpenses: number;
  paymentsReceived: number;
  totalOutstanding: number;
};

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  outstandingBalance: number;
  transactionCount: number;
};

type CustomerLedger = Omit<Customer, 'transactionCount'> & { transactions: Transaction[] };

const transactionTypes = {
  ADD_CREDIT: { value: 'CREDIT', label: 'Credit' },
  RECORD_PAYMENT: { value: 'PAYMENT', label: 'Payment received' },
  ADD_SALE: { value: 'SALE', label: 'Sale' },
  ADD_EXPENSE: { value: 'EXPENSE', label: 'Expense' },
} as const;

type WriteIntent = keyof typeof transactionTypes;

const readOnlyIntents = new Set(['GET_BALANCE', 'GET_TOTAL_OUTSTANDING', 'GET_TODAY_TRANSACTIONS', 'GET_CUSTOMER_TRANSACTIONS']);

type ParsedVoiceIntent = {
  intent: string;
  customerName?: string;
  amount?: number;
  description?: string;
  missingFields: string[];
};

type PendingIntent = {
  intent: WriteIntent;
  customerName: string;
  amount: number;
  description: string;
};

type VoiceFeedback = {
  status: 'idle' | 'listening' | 'processing' | 'clarification' | 'success' | 'error' | 'review' | 'uncertain';
  text: string;
};

const idleVoice: VoiceFeedback = { status: 'idle', text: 'Tap Start voice and wait for the listening message before speaking.' };

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
  { key: 'todaysSales', label: "Today's Sales", icon: <IndianRupee className="h-5 w-5" />, color: 'text-purple bg-purple/5' },
  { key: 'todaysExpenses', label: "Today's Expenses", icon: <CreditCard className="h-5 w-5" />, color: 'text-forest-dark bg-forest/5' },
  { key: 'paymentsReceived', label: "Today's payments received", icon: <TrendingUp className="h-5 w-5" />, color: 'text-purple bg-purple/5' },
  { key: 'totalOutstanding', label: 'Total Outstanding', icon: <Users className="h-5 w-5" />, color: 'text-forest bg-beige' },
] as const;

type PanelState<T> =
  | { status: 'loading' | 'error'; data?: T }
  | { status: 'not-found'; data?: never }
  | { status: 'success'; data: T };

function useDashboardPanel<T>(path: string, validate?: (data: unknown) => boolean, handleNotFound = false) {
  const [state, setState] = useState<PanelState<T>>({ status: 'loading' });
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);

  const load = useCallback(async () => {
    if (!active.current) return;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ status: 'loading', data: handleNotFound ? undefined : previous.data }));

    try {
      const response = await fetch(`${API_URL}${path}`, { signal: controller.signal });
      if (handleNotFound && response.status === 404) {
        if (request.current === controller) setState({ status: 'not-found' });
        return;
      }
      if (!response.ok) throw new Error('Dashboard request failed');

      const result = await response.json();
      if (result.ok !== true || result.data === undefined || (validate && !validate(result.data))) {
        throw new Error('Dashboard data unavailable');
      }

      if (request.current === controller) setState({ status: 'success', data: result.data });
    } catch {
      if (request.current === controller) setState(previous => ({ status: 'error', data: previous.data }));
    }
  }, [handleNotFound, path, validate]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, [load]);

  return { state, load };
}

function isTransactionList(data: unknown): data is Transaction[] {
  return Array.isArray(data) && data.every(row => row && typeof row.id === 'string'
    && typeof row.description === 'string' && typeof row.type === 'string'
    && Number.isFinite(row.amount) && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)));
}

function isCustomerLedger(data: unknown): data is CustomerLedger {
  if (!data || typeof data !== 'object') return false;
  const ledger = data as Partial<CustomerLedger>;
  return typeof ledger.id === 'string' && typeof ledger.name === 'string'
    && Number.isFinite(ledger.outstandingBalance) && isTransactionList(ledger.transactions);
}

function TransactionRows({ transactions, customerLedger = false }: { transactions: Transaction[]; customerLedger?: boolean }) {
  return (
    <ul className="space-y-3" role="list">
      {transactions.map(transaction => (
        <li key={transaction.id} className="flex items-center justify-between gap-2 rounded-lg border border-forest/10 p-3">
          <div className="min-w-0 break-words">
            {customerLedger ? (
              <p className="text-sm font-semibold text-forest">{transaction.description || 'Transaction'}</p>
            ) : (
              <p className="text-sm font-semibold text-forest">{transaction.customer?.name || 'General'}</p>
            )}
            <p className="text-xs text-muted">
              {!customerLedger && `${transaction.description || 'Transaction'} • `}
              {formatDate(transaction.createdAt)}
            </p>
          </div>
          <div className="max-w-[50%] shrink-0 text-right [overflow-wrap:anywhere]">
            <p className="text-sm font-bold text-forest">{formatCurrency(transaction.amount)}</p>
            <p className={`mt-0.5 inline-block max-w-full rounded-full px-2 text-xs font-medium ${
              transaction.type === 'PAYMENT' ? 'bg-purple/10 text-forest' : transaction.type === 'CREDIT' ? 'bg-beige text-forest' : 'text-muted'
            }`}>
              {transaction.type === 'PAYMENT' ? 'Repayment' : transaction.type === 'CREDIT' ? 'Credit' : transaction.type}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function focusInView(element: HTMLElement | null, spaceBelow = 0) {
  if (!element) return;
  element.focus({ preventScroll: true });
  const { top, bottom } = element.getBoundingClientRect();
  const topInset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  if (top < topInset || bottom > window.innerHeight - spaceBelow) {
    element.scrollIntoView({ block: spaceBelow ? 'start' : 'nearest', behavior: 'instant' });
  }
}

function LedgerSection({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => focusInView(heading.current, 112), []);

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="space-y-3 rounded-lg border border-forest/10 bg-beige-light p-3"
      onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h4 id={`${id}-title`} ref={heading} tabIndex={-1} className="scroll-mt-2 text-base font-semibold text-forest [overflow-wrap:anywhere]">{title}</h4>
        <Button type="button" variant="link" size="sm" onClick={onClose}>Close</Button>
      </div>
      {children}
    </section>
  );
}

function CustomerLedgerDetails({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const sectionId = `customer-ledger-${customerId}`;
  const { state, load } = useDashboardPanel<CustomerLedger>(`/api/customers/${encodeURIComponent(customerId)}`, isCustomerLedger, true);
  const ledger = state.status === 'success' && state.data.id === customerId ? state.data : null;

  return (
    <LedgerSection id={sectionId} title="Customer ledger" onClose={onClose}>
      {state.status === 'loading' ? (
          <p role="status" className="min-h-24 text-sm text-muted">Loading customer ledger…</p>
      ) : state.status === 'not-found' ? (
        <p role="status" className="text-sm text-muted">This customer could not be found.</p>
      ) : ledger ? (
        <>
          <div className="space-y-1 [overflow-wrap:anywhere]">
            <p className="text-lg font-semibold text-forest">{ledger.name}</p>
            {ledger.phone && <p className="text-sm text-muted">{ledger.phone}</p>}
            <p className="text-xs text-muted">Customer ID {ledger.id}</p>
            <p className="text-sm text-muted">Outstanding balance <strong className="text-forest">{formatCurrency(ledger.outstandingBalance)}</strong></p>
          </div>
          {ledger.transactions.length > 0 ? (
            <>
              <p className="text-xs text-muted">Entries returned by the ledger: {ledger.transactions.length}. Older records may be outside this view.</p>
              <TransactionRows transactions={ledger.transactions} customerLedger />
            </>
          ) : <p role="status" className="text-sm text-muted">No transactions for this customer.</p>}
        </>
      ) : <PanelError panel="customer ledger" retry={load} focusTarget={`${sectionId}-title`} />}
    </LedgerSection>
  );
}

function PanelError({ panel, retry, focusTarget, retained }: { panel: string; retry: () => void; focusTarget?: string; retained?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-muted">
      <p role="status">Couldn’t load {panel}.{retained && ' Showing last loaded information.'}</p>
      <Button type="button" variant="link" size="sm" aria-label={`Retry ${panel}`} onClick={() => {
        if (focusTarget) focusInView(document.getElementById(focusTarget));
        retry();
      }} className="underline">
        Retry
      </Button>
    </div>
  );
}

export default function DashboardPage() {
  const { state: summaryState, load: loadDashboard } = useDashboardPanel<Summary | null>('/api/dashboard/summary');
  const { state: customerState, load: loadCustomers } = useDashboardPanel<Customer[]>('/api/customers');
  const { state: transactionState, load: loadTransactions } = useDashboardPanel<Transaction[]>('/api/transactions', isTransactionList);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const ledgerTrigger = useRef<HTMLButtonElement | null>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const historyOpener = useRef<HTMLButtonElement | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<VoiceFeedback>(idleVoice);
  const voiceStatus = voiceFeedback.status;
  const reportVoiceError = (text: string) => setVoiceFeedback({ status: 'error', text });
  const [lastTranscript, setLastTranscript] = useState('');
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const microphone = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useRef<HTMLHeadingElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<any>(null);
  const isConfirmationOpen = pendingIntent !== null;
  const summary = summaryState.data;
  const { customers, filteredCustomers, customerNameCounts } = useMemo(() => {
    const customers = customerState.data ?? [];
    const query = customerSearch.trim().toLowerCase();
    const phoneQuery = /^[+\d\s().-]+$/.test(query) ? query.replace(/\D/g, '') : '';
    const customerNameCounts = new Map<string, number>();
    const filteredCustomers = customers.filter(customer => {
      const name = customer.name.trim().toLowerCase();
      customerNameCounts.set(name, (customerNameCounts.get(name) ?? 0) + 1);
      return name.includes(query) || customer.phone?.toLowerCase().includes(query)
        || (phoneQuery && customer.phone?.replace(/\D/g, '').includes(phoneQuery));
    });
    return { customers, filteredCustomers, customerNameCounts };
  }, [customerSearch, customerState.data]);
  const transactions = transactionState.data ?? [];

  const updateSearch = (value: string) => {
    setCustomerSearch(value);
    setSelectedCustomerId(null);
  };

  const clearSearch = () => {
    updateSearch('');
    searchInput.current?.focus();
  };

  const closeLedger = () => {
    setSelectedCustomerId(null);
    focusInView(ledgerTrigger.current);
  };
  const openHistory = (opener: HTMLButtonElement) => {
    historyOpener.current = opener;
    if (showHistory) focusInView(document.getElementById('transaction-history-title'), 112);
    else setShowHistory(true);
  };
  const closeHistory = () => {
    setShowHistory(false);
    focusInView(historyOpener.current?.isConnected ? historyOpener.current : historyTrigger.current);
  };

  useEffect(() => {
    if (selectedCustomerId && !customerState.data?.some(customer => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(null);
    }
  }, [customerState.data, selectedCustomerId]);

  useEffect(() => {
    const modal = dialog.current;
    const trigger = microphone.current;
    if (!isConfirmationOpen || !modal) return;

    modal.showModal();
    cancelButton.current?.focus();

    return () => {
      modal.close();
      trigger?.focus({ preventScroll: true });
    };
  }, [isConfirmationOpen]);

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

  const refreshLedger = () => Promise.all([loadDashboard(), loadCustomers(), loadTransactions()]);

  const closeConfirmation = () => {
    dialog.current?.close();
    setPendingIntent(null);
  };

  const cancelConfirmation = () => {
    if (saving.current) return;

    closeConfirmation();
    setVoiceFeedback({ status: 'idle', text: 'Transaction cancelled.' });
  };

  const confirmTransaction = async () => {
    if (saving.current || !pendingIntent) return;

    const { intent, customerName, amount, description } = pendingIntent;
    const uncertainSave: VoiceFeedback = {
      status: 'uncertain',
      text: 'Couldn’t confirm whether the transaction was saved. Check transaction history before repeating it. A missing entry doesn’t prove the save failed.',
    };
    saving.current = true;
    setIsSaving(true);
    dialogTitle.current?.focus();

    let feedback: VoiceFeedback;
    let spokenAnswer: string | undefined;
    try {
      const response = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, customerName, amount, description, type: transactionTypes[intent].value }),
      });
      const result = await response.json();

      if (!response.ok || result.ok !== true) {
        // The API's structured 400 is a validation rejection. Other failures may leave the save outcome unknown.
        feedback = response.status === 400 && result.ok === false ? {
          status: 'error',
          text: `Transaction not saved. ${typeof result.message === 'string' && result.message ? `${result.message} ` : ''}Check the details before trying again.`,
        } : uncertainSave;
      } else {
        spokenAnswer = result.responseText || undefined;
        feedback = { status: 'success', text: spokenAnswer ? `Transaction saved. ${spokenAnswer}` : 'Transaction saved.' };
      }
    } catch {
      feedback = uncertainSave;
    }

    closeConfirmation();
    setVoiceFeedback(feedback);
    saving.current = false;
    setIsSaving(false);

    if (feedback.status === 'success') {
      speak(spokenAnswer ?? feedback.text);
      void refreshLedger();
    } else if (feedback.status === 'uncertain') {
      void loadTransactions();
    }
  };

  const handleTranscript = async (text: string) => {
    if (!text.trim()) {
      return;
    }

    setLastTranscript(text);
    setVoiceFeedback({ status: 'processing', text: 'Understanding what you said…' });

    let parsed: ParsedVoiceIntent;
    try {
      const response = await fetch(`${API_URL}/api/ai/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !result.data) throw new Error('Interpretation failed');
      parsed = result.data;
    } catch {
      reportVoiceError('Couldn’t understand that request. Please try again.');
      return;
    }

    const clarify = (prompt: string) => {
      setVoiceFeedback({ status: 'clarification', text: prompt });
      speak(prompt);
    };
    const isReadOnly = readOnlyIntents.has(parsed.intent);
    const isWrite = Object.prototype.hasOwnProperty.call(transactionTypes, parsed.intent);

    // The parser's confidence reflects field presence, so it cannot vouch for the intent.
    const repeatRequest = 'Poori baat dobara boliye: udhaar diya, payment mila, ya balance chahiye?';
    if ((!isReadOnly && !isWrite) || !Array.isArray(parsed.missingFields)) {
      clarify(repeatRequest);
      return;
    }

    const { customerName, amount } = parsed;
    const hasCustomer = typeof customerName === 'string' && customerName.trim().length > 0;
    const hasAmount = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
    const customerRequired = isWrite || parsed.intent === 'GET_BALANCE' || parsed.intent === 'GET_CUSTOMER_TRANSACTIONS';
    const missingCustomer = customerRequired && (!hasCustomer || parsed.missingFields.includes('customerName'));
    const missingAmount = isWrite && (!hasAmount || parsed.missingFields.includes('amount'));

    if (missingCustomer || missingAmount || parsed.missingFields.length > 0) {
      if (missingCustomer && !missingAmount) {
        clarify('Customer ka naam batakar poori baat dobara boliye.');
      } else if (missingAmount && !missingCustomer) {
        clarify('Poori baat dobara boliye. Len-den darj karna hai toh rakam bhi batayein.');
      } else {
        clarify(repeatRequest);
      }
      return;
    }

    if (isReadOnly) {
      setVoiceFeedback({ status: 'processing', text: 'Checking your ledger…' });
      let answer: string;
      try {
        const response = await fetch(`${API_URL}/api/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: parsed.intent,
            customerName,
            amount,
            description: parsed.description,
          }),
        });
        const result = await response.json();

        if (!response.ok || result.ok !== true) {
          reportVoiceError(result.message || 'Couldn’t complete the ledger query. Please try again.');
          return;
        }
        if (typeof result.responseText !== 'string' || !result.responseText.trim()) throw new Error('Ledger answer unavailable');
        answer = result.responseText;
      } catch {
        reportVoiceError('Couldn’t complete the ledger query. Please try again.');
        return;
      }
      setVoiceFeedback({ status: 'success', text: answer });
      speak(answer);
      return;
    }

    if (hasCustomer && hasAmount) {
      setPendingIntent({
        intent: parsed.intent as WriteIntent,
        customerName,
        amount,
        description: parsed.description || 'Ledger update',
      });
      setVoiceFeedback({ status: 'review', text: 'Check the suggested transaction before saving.' });
    }
  };

  const startListening = () => {
    setLastTranscript('');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      reportVoiceError('Voice input is unavailable in this browser. Try a browser that supports speech recognition.');
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'hi-IN,en-IN';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => {
        setVoiceFeedback({ status: 'listening', text: 'Listening… Speak now.' });
      };

      recognition.onresult = (event: any) => {
        if (!event.results?.[0]?.isFinal) return;

        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');

        if (transcript.trim()) void handleTranscript(transcript);
      };

      recognition.onerror = (event: { error: string }) => {
        switch (event.error) {
          case 'not-allowed':
            reportVoiceError('Microphone permission was denied. Allow microphone access in your browser and try again.');
            break;
          case 'service-not-allowed':
            reportVoiceError('Speech recognition is blocked in this browser. Check your browser settings and try again.');
            break;
          case 'audio-capture':
            reportVoiceError('No microphone is available. Connect or enable a microphone and try again.');
            break;
          case 'network':
            reportVoiceError('The speech recognition service is unavailable. Please try again.');
            break;
          case 'no-speech':
            reportVoiceError('No speech was detected. Please try again.');
            break;
          default:
            reportVoiceError('I may have heard that incorrectly. Please repeat.');
        }
      };

      recognition.onend = () => {
        setVoiceFeedback((feedback) => feedback.status === 'listening' ? idleVoice : feedback);
      };

      recognitionRef.current = recognition;
    }

    try {
      recognitionRef.current.start();
    } catch {
      reportVoiceError('Couldn’t start the microphone. Please try again.');
    }
  };

  const transactionPanel = showHistory ? 'transaction history' : 'recent transactions';
  const transactionContent = (
    <>
      {transactionState.status === 'loading' && (
        <p role="status" className={transactions.length ? 'text-sm text-muted' : 'flex min-h-28 items-center justify-center text-sm text-muted'}>
          {transactions.length ? 'Updating transactions. Showing last loaded information.' : `Loading ${transactionPanel}…`}
        </p>
      )}
      {transactionState.status === 'error' && (
        <div className={transactions.length ? undefined : 'flex min-h-28 items-center justify-center'}>
          <PanelError panel={transactionPanel} retry={loadTransactions} retained={transactions.length > 0} focusTarget={showHistory ? 'transaction-history-title' : 'recent-transactions'} />
        </div>
      )}
      {transactions.length > 0 ? (
        <>
          {showHistory && <p className="text-xs text-muted">Entries returned by the ledger: {transactions.length}. Older records may be outside this view.</p>}
          <TransactionRows transactions={showHistory ? transactions : transactions.slice(0, 5)} />
        </>
      ) : transactionState.status === 'success' && (
        <div className="flex flex-col items-center justify-center py-8 text-muted">
          {!showHistory && <Clock className="mb-2 h-8 w-8 opacity-50" aria-hidden="true" />}
          <p className="text-sm">{showHistory ? 'No transactions returned.' : 'No recent transactions'}</p>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="min-w-0 break-words">
        <h1 className="text-3xl font-bold text-forest tracking-tight">{summary?.businessName || 'My Shop'}</h1>
        <p className="mt-1 text-sm text-muted">Voice-first digital ledger</p>
      </div>

      <ScrollReveal className="break-words rounded-md border border-forest/10 bg-white p-4 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`recording-indicator ${voiceStatus === 'listening' ? 'is-live' : ''}`} />
            <h2 id="voice-input" tabIndex={-1} className="text-xl font-semibold text-forest">Voice input</h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button
              ref={microphone}
              onClick={() => {
                if (voiceStatus === 'listening') {
                  recognitionRef.current?.stop();
                } else if (voiceStatus !== 'processing') {
                  startListening();
                }
              }}
              aria-pressed={voiceStatus === 'listening'}
              disabled={voiceStatus === 'processing'}
              className="w-40 shrink-0"
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
            <a href="#customers" className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-forest underline underline-offset-4 hover:bg-beige-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
              Find customer
            </a>
          </div>
        </div>
        {voiceStatus === 'listening' && <VoiceWaveform animate className="mt-3" />}
        <div className="mt-3 rounded-lg border border-purple/20 bg-purple/5 p-3 sm:p-4">
          <p
            role="status"
            aria-atomic="true"
            className={`text-sm text-forest ${voiceStatus === 'success' ? 'font-semibold' : ''}`}
          >
            {voiceFeedback.text}
          </p>
          {voiceStatus === 'uncertain' && (
            <Button type="button" variant="link" size="sm" className="px-0 underline" onClick={event => openHistory(event.currentTarget)}>
              Check transaction history
            </Button>
          )}
        </div>
        {lastTranscript && (
          <div className="mt-3 rounded-lg border border-forest/10 bg-beige p-3">
            <p className="text-xs uppercase tracking-wider text-muted">What the microphone heard</p>
            <p className="mt-1 text-sm text-forest [overflow-wrap:anywhere]" dir="auto">“{lastTranscript}”</p>
          </div>
        )}
        {voiceStatus === 'idle' && (
          <div className="mt-3 text-xs text-muted">
            <p>Example phrases. Check suggested details before saving.</p>
            <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1" role="list">
              <li><span className="font-semibold">Credit</span> <span lang="hi-Latn">“Raju ko 450 rupaye ka udhaar diya.”</span></li>
              <li><span className="font-semibold">Repayment</span> <span lang="hi-Latn">“Raju ne 200 rupaye payment ki.”</span></li>
              <li><span className="font-semibold">Balance</span> <span lang="hi-Latn">“Raju ka kitna baki?”</span></li>
            </ul>
          </div>
        )}
      </ScrollReveal>

      <section id="financial-summary" tabIndex={-1} aria-label="Dashboard summary">
        {summaryState.status === 'error' && (
          <div className="mb-2">
            <PanelError panel="dashboard summary" retry={loadDashboard} focusTarget="financial-summary" retained={Boolean(summary)} />
          </div>
        )}
        <ScrollReveal className="grid gap-4 min-[375px]:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.key}>
              <CardHeader className="items-center justify-between space-y-0 px-2 pb-2 text-center sm:px-4">
                <h3 className={`flex min-h-10 items-center text-sm font-medium tracking-tight ${card.key === 'totalOutstanding' ? 'text-forest' : 'text-muted'}`}>
                  {card.label}
                </h3>
                <div className={`h-9 w-9 rounded-md flex items-center justify-center ${card.color}`}>{card.icon}</div>
              </CardHeader>
              <CardContent className="px-1 text-center">
                {summaryState.status === 'loading' && !summary ? (
                  <div aria-hidden="true" className="flex h-8 items-center justify-center">
                    <span className="h-4 w-16 max-w-[80%] rounded-full bg-forest/10" />
                  </div>
                ) : (
                  <p className="text-2xl font-bold leading-8 text-forest [overflow-wrap:anywhere] min-[375px]:max-sm:text-[clamp(1rem,4vw,1.25rem)]">
                    {summary ? formatCurrency(summary[card.key]) : '—'}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </ScrollReveal>
        {summaryState.status === 'loading' && (
          <p role="status" className={summary ? 'mt-2 text-center text-sm text-muted' : 'sr-only'}>
            {summary ? 'Updating dashboard summary. Showing last loaded amounts.' : 'Loading dashboard summary…'}
          </p>
        )}
        {summaryState.status === 'success' && !summary && <p role="status" className="mt-2 text-center text-sm text-muted">No dashboard summary available.</p>}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ScrollReveal delay={0.1} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft">
          <CardHeader className="px-0 pt-0">
            <CardTitle id="customers" tabIndex={-1} className="text-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest">Customers</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-3">
              {customers.length > 0 && (
                <div className="space-y-1">
                  <label htmlFor="customer-search" className="text-sm font-medium text-forest">Search customers</label>
                  <div className="relative">
                    <input
                      ref={searchInput}
                      id="customer-search"
                      type="search"
                      value={customerSearch}
                      autoComplete="off"
                      placeholder="Name or phone number"
                      onChange={event => updateSearch(event.target.value)}
                      onKeyDown={event => {
                        if (event.key !== 'Escape' || !customerSearch) return;
                        event.preventDefault();
                        clearSearch();
                      }}
                      className="block min-h-11 w-full rounded-sm border border-forest/20 bg-white py-2 pl-3 pr-16 text-base text-forest placeholder:text-muted focus:border-forest focus:outline-2 focus:outline-offset-2 focus:outline-forest [&::-webkit-search-cancel-button]:hidden"
                    />
                    {customerSearch && (
                      <Button type="button" variant="link" size="sm" aria-label="Clear search" onClick={clearSearch} className="absolute inset-y-0 right-0">
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {customerState.status === 'loading' && customers.length > 0 && <p role="status" className="text-sm text-muted">Updating customers. Showing last loaded information.</p>}
              {customerState.status === 'error' && customers.length > 0 && <PanelError panel="customers" retry={loadCustomers} focusTarget="customers" retained />}
              {customerState.status === 'loading' && !customers.length ? (
                <p role="status" className="flex min-h-28 items-center justify-center text-sm text-muted">Loading customers…</p>
              ) : customerState.status === 'error' && !customers.length ? (
                <div className="flex min-h-28 items-center justify-center">
                  <PanelError panel="customers" retry={loadCustomers} focusTarget="customers" />
                </div>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map(customer => {
                  const isOpen = selectedCustomerId === customer.id;
                  const duplicate = (customerNameCounts.get(customer.name.trim().toLowerCase()) ?? 0) > 1;
                  return (
                    <div key={customer.id} className="space-y-2">
                      <div className="rounded-lg border border-forest/10 p-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <div className="min-w-0 break-words">
                            <p className="font-semibold text-forest text-sm">{customer.name}</p>
                            <p className="text-xs text-muted [overflow-wrap:anywhere]">{customer.phone || 'No phone saved'}</p>
                            {duplicate && <p className="text-xs text-muted [overflow-wrap:anywhere]">Customer ID {customer.id}</p>}
                          </div>
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-purple/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            {customer.transactionCount} txns
                          </span>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-x-1">
                          <span className="min-w-0 text-lg font-bold text-forest [overflow-wrap:anywhere]">{formatCurrency(customer.outstandingBalance)}</span>
                          <span className="text-xs text-muted">outstanding</span>
                        </div>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="px-0 underline"
                          aria-label={`View ledger for ${customer.name}${customer.phone ? `, ${customer.phone}` : ''}${duplicate ? `, customer ID ${customer.id}` : ''}`}
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? `customer-ledger-${customer.id}` : undefined}
                          onClick={event => {
                            if (isOpen) {
                              closeLedger();
                            } else {
                              ledgerTrigger.current = event.currentTarget;
                              setSelectedCustomerId(customer.id);
                            }
                          }}
                        >
                          View ledger
                        </Button>
                      </div>
                      {isOpen && <CustomerLedgerDetails customerId={customer.id} onClose={closeLedger} />}
                    </div>
                  );
                })
              ) : customers.length > 0 ? (
                <p role="status" className="min-h-28 py-4 text-sm text-muted">No customers match that name or phone number. Try a different name or number.</p>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted">
                  <Users className="h-8 w-8 opacity-50 mb-2" />
                  <p className="text-sm">No customers yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </ScrollReveal>

        <ScrollReveal delay={0.2} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft">
          <CardHeader className="px-0 pt-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <CardTitle id="recent-transactions" tabIndex={-1} className="text-lg">Recent transactions</CardTitle>
              <Button
                ref={historyTrigger}
                type="button"
                variant="link"
                size="sm"
                className="px-0 underline"
                aria-expanded={showHistory}
                aria-controls={showHistory ? 'transaction-history' : undefined}
                onClick={event => showHistory ? closeHistory() : openHistory(event.currentTarget)}
              >
                {showHistory ? 'Hide history' : 'View history'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-3">
              {showHistory ? (
                <LedgerSection id="transaction-history" title="Transaction history" onClose={closeHistory}>
                  {transactionContent}
                  <a href="#voice-input" className="inline-flex min-h-11 items-center text-sm font-medium text-forest underline underline-offset-4">Back to voice</a>
                </LedgerSection>
              ) : transactionContent}
            </div>
          </CardContent>
        </ScrollReveal>
      </div>

      {pendingIntent && (
        <dialog
          ref={dialog}
          aria-labelledby="confirm-transaction-title"
          aria-describedby="confirm-transaction-guidance"
          aria-modal="true"
          className="fixed inset-0 !m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg bg-transparent p-0 shadow-forest backdrop:bg-forest/40 backdrop:backdrop-blur-sm"
          onCancel={(event) => {
            event.preventDefault();
            cancelConfirmation();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return;

            if (saving.current) {
              event.preventDefault();
            } else if (event.shiftKey && document.activeElement === confirmButton.current) {
              event.preventDefault();
              cancelButton.current?.focus();
            } else if (!event.shiftKey && document.activeElement === cancelButton.current) {
              event.preventDefault();
              confirmButton.current?.focus();
            }
          }}
        >
          <div className="confirmation-enter rounded-lg border border-forest/10 bg-white p-6">
            <CardHeader className="pb-3">
              <CardTitle id="confirm-transaction-title" ref={dialogTitle} tabIndex={-1} className="text-2xl">Confirm transaction</CardTitle>
            </CardHeader>
            <CardContent className="py-0 space-y-4 [overflow-wrap:anywhere]">
              <div className="grid gap-4">
                <div className="flex justify-between items-baseline gap-x-2">
                  <span className="shrink-0 text-sm text-forest/50">Customer</span>
                  <strong className="text-right text-sm text-forest">{pendingIntent.customerName}</strong>
                </div>
                <div className="flex flex-wrap justify-between items-baseline gap-x-2">
                  <span className="text-sm text-forest/50">Amount</span>
                  <strong className="ml-auto text-right text-lg font-bold text-forest">{formatCurrency(pendingIntent.amount)}</strong>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-forest/50">Suggested type</span>
                  <strong className="text-right text-sm text-forest">{transactionTypes[pendingIntent.intent].label}</strong>
                </div>
                <div className="flex justify-between items-baseline gap-x-2">
                  <span className="shrink-0 text-sm text-forest/50">Description</span>
                  <strong className="text-right text-sm text-forest">{pendingIntent.description}</strong>
                </div>
              </div>
              <p id="confirm-transaction-guidance" className="text-sm text-forest">
                {pendingIntent.intent === 'ADD_CREDIT'
                  ? 'Record credit given to this customer?'
                  : pendingIntent.intent === 'RECORD_PAYMENT'
                    ? 'Record a repayment received from this customer?'
                    : 'Record this suggested transaction?'}{' '}
                Check the details above. If anything is wrong, cancel and repeat.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-2 pt-4">
              <Button ref={confirmButton} type="button" className="w-full" disabled={isSaving} onClick={confirmTransaction}>
                {isSaving ? 'Saving…' : 'Confirm'}
              </Button>
              <Button ref={cancelButton} type="button" variant="outline" className="w-full" disabled={isSaving} onClick={cancelConfirmation}>
                Cancel
              </Button>
              <p role="status" className="sr-only">{isSaving ? 'Saving transaction…' : ''}</p>
            </CardFooter>
          </div>
        </dialog>
      )}
    </div>
  );
}
