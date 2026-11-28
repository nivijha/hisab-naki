'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Mic, Clock, TrendingUp, CreditCard, Users, IndianRupee, X, HelpCircle, ArrowRight, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatInrAmount, readInrAmount } from '@/lib/inr';
import { isSupportedPreviewWrite, normalizeTransactionPreview, type TransactionPreview } from '@/lib/preview-contract';
import { VoiceWaveform } from '@/components/ui/voice-waveform';
import { TransactionDetailStatus, TransactionRowStatus } from '@/components/dashboard/transaction-status';
import {
  buildTransactionHistoryPath,
  isValidManualAmount,
  normalizeTransaction,
  normalizeTransactionHistory,
  normalizeTransactionList,
  updateTransactionHistoryFilters,
  changeTransactionHistoryPage,
  type NormalizedTransaction,
  type TransactionHistoryResponse,
} from '@/lib/transaction-contract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type Money = string;

type Transaction = NormalizedTransaction;

type Summary = {
  businessName: string;
  todaysSales: Money;
  todaysExpenses: Money;
  paymentsReceived: Money;
  newCredit: Money;
  totalOutstanding: Money;
  recentTransactions: Transaction[];
};

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  outstandingBalance: Money;
  transactionCount: number;
};

type CustomerLedger = Omit<Customer, 'transactionCount'> & { transactions: Transaction[] };

type SpeechRecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechRecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

// Give the browser time to request permission and open the audio input.
const SPEECH_STARTUP_TIMEOUT_MS = 10_000;

const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const statCards = [
  { key: 'todaysSales', label: "Today's Sales", icon: <IndianRupee className="h-5 w-5" />, color: 'text-purple bg-purple/5' },
  { key: 'todaysExpenses', label: "Today's Expenses", icon: <CreditCard className="h-5 w-5" />, color: 'text-forest-dark bg-forest/5' },
  { key: 'paymentsReceived', label: "Today's payments received", icon: <TrendingUp className="h-5 w-5" />, color: 'text-purple bg-purple/5' },
  { key: 'newCredit', label: "Today's new credit", icon: <IndianRupee className="h-5 w-5" />, color: 'text-purple bg-purple/5' },
  { key: 'totalOutstanding', label: 'Total Outstanding', icon: <Users className="h-5 w-5" />, color: 'text-forest bg-beige' },
] as const;

const readOnlyPreviewIntents = new Set([
  'GET_BALANCE', 'GET_TOTAL_OUTSTANDING', 'GET_TODAY_TRANSACTIONS', 'GET_CUSTOMER_TRANSACTIONS',
]);

type PanelState<T> =
  | { status: 'loading'; data?: T }
  | { status: 'error'; data?: T; message?: string }
  | { status: 'not-found'; data?: never }
  | { status: 'success'; data: T };

function panelErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return undefined;
  if (error.kind === 'timeout' || error.kind === 'network') return error.message;
  if (error.status === 429) return 'Too many requests. Please wait before retrying.';
  if (error.status && error.status >= 500) return 'HisabNaki is temporarily unavailable. Please try again later.';
}

function useDashboardPanel<T>(path: string, normalize: (data: unknown) => T | null, handleNotFound = false, enabled = true) {
  const [state, setState] = useState<PanelState<T>>({ status: 'loading' });
  const [dataPath, setDataPath] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);

  const load = useCallback(async (force = false): Promise<boolean> => {
    if (!active.current || (request.current && !force)) return false;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ status: 'loading', data: handleNotFound ? undefined : previous.data }));

    try {
      const result = await apiClient.requestJson(path, { signal: controller.signal });
      if (!isRecord(result) || result.ok !== true || !Object.prototype.hasOwnProperty.call(result, 'data')) {
        throw new Error('Dashboard response envelope is invalid.');
      }
      const data = normalize(result.data);
      if (data === null) throw new Error('Dashboard response data is invalid.');
      if (request.current === controller) {
        setState({ status: 'success', data });
        setDataPath(path);
        return true;
      }
      return false;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (handleNotFound && error instanceof ApiError && error.status === 404) {
        if (request.current === controller) setState({ status: 'not-found' });
        return false;
      }
      if (request.current === controller) {
        setState(previous => ({ status: 'error', data: previous.data, message: panelErrorMessage(error) }));
      }
      return false;
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [handleNotFound, normalize, path]);

  useEffect(() => {
    active.current = enabled;
    if (enabled) void load();
    else {
      request.current?.abort();
      request.current = null;
    }
    return () => {
      active.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, [enabled, load]);

  return { state, load, dataPath };
}

function normalizeNonnegativeAmount(value: unknown): Money | null {
  const text = readInrAmount(value);
  return text?.startsWith('-') ? null : text;
}

function normalizeSummary(value: unknown): Summary | null {
  if (!isRecord(value) || typeof value.businessName !== 'string' || !value.businessName.trim()) return null;
  const todaysSales = normalizeNonnegativeAmount(value.todaysSales);
  const todaysExpenses = normalizeNonnegativeAmount(value.todaysExpenses);
  const paymentsReceived = normalizeNonnegativeAmount(value.paymentsReceived);
  const newCredit = normalizeNonnegativeAmount(value.newCredit);
  const totalOutstanding = readInrAmount(value.totalOutstanding);
  const recentTransactions = normalizeTransactionList(value.recentTransactions);
  if ([todaysSales, todaysExpenses, paymentsReceived, newCredit, totalOutstanding, recentTransactions].some(item => item === null)) return null;
  return {
    businessName: value.businessName,
    todaysSales: todaysSales!,
    todaysExpenses: todaysExpenses!,
    paymentsReceived: paymentsReceived!,
    newCredit: newCredit!,
    totalOutstanding: totalOutstanding!,
    recentTransactions: recentTransactions!,
  };
}

function normalizeCustomers(value: unknown): Customer[] | null {
  if (!Array.isArray(value)) return null;
  const customers: Customer[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.name !== 'string' || !item.name.trim()
      || (item.phone !== undefined && item.phone !== null && typeof item.phone !== 'string')
      || typeof item.transactionCount !== 'number' || !Number.isInteger(item.transactionCount) || item.transactionCount < 0) return null;
    const outstandingBalance = readInrAmount(item.outstandingBalance);
    if (outstandingBalance === null) return null;
    customers.push({
      id: item.id,
      name: item.name,
      phone: item.phone as string | null | undefined,
      outstandingBalance,
      transactionCount: item.transactionCount,
    });
  }
  return customers;
}

function normalizeMutationCustomer(value: unknown, expectedId?: string): Pick<Customer, 'id' | 'name' | 'phone'> | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.trim()
    || (value.phone !== undefined && value.phone !== null && typeof value.phone !== 'string')) return null;
  return { id: value.id, name: value.name, phone: value.phone as string | null | undefined };
}

function normalizeCustomerLedger(value: unknown): CustomerLedger | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.name !== 'string' || !value.name.trim()
    || (value.phone !== undefined && value.phone !== null && typeof value.phone !== 'string')) return null;
  const outstandingBalance = readInrAmount(value.outstandingBalance);
  const transactions = normalizeTransactionList(value.transactions);
  if (outstandingBalance === null || transactions === null) return null;
  return {
    id: value.id,
    name: value.name,
    phone: value.phone as string | null | undefined,
    outstandingBalance,
    transactions,
  };
}

function TransactionRows({ transactions, customerLedger = false, onViewDetails }: {
  transactions: Transaction[];
  customerLedger?: boolean;
  onViewDetails?: (id: string, opener: HTMLButtonElement) => void;
}) {
  return (
    <ul className="divide-y divide-forest/10" role="list">
      {transactions.map(transaction => (
        <li key={transaction.id} className="flex min-w-0 flex-col items-stretch justify-between gap-3 py-3 first:pt-1 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 break-words">
            {customerLedger ? (
              <p className="text-sm font-semibold leading-5 text-forest">{transaction.description || 'Transaction'}</p>
            ) : (
              <p className="text-sm font-semibold leading-5 text-forest">{transaction.customer?.name || 'General'}</p>
            )}
            <p className="mt-1 text-xs leading-5 text-muted [overflow-wrap:anywhere]">
              {!customerLedger && `${transaction.description || 'Transaction'} • `}
              {formatDate(transaction.createdAt)}
            </p>
          </div>
          <div className="max-w-full shrink-0 text-left sm:max-w-[50%] sm:text-right">
            <p className={`text-xs font-bold [overflow-wrap:anywhere] sm:text-sm ${transaction.status === 'VOIDED' ? 'text-muted line-through decoration-muted' : 'text-forest'}`}>
              {formatInrAmount(transaction.amount)}
            </p>
            <p className={`mt-0.5 inline-block max-w-full rounded-full px-2 text-xs font-medium ${
              transaction.status === 'VOIDED' ? 'bg-beige-light text-muted' : transaction.type === 'PAYMENT' ? 'bg-purple/10 text-forest' : transaction.type === 'CREDIT' ? 'bg-beige text-forest' : 'text-muted'
            }`}>
              {transaction.status === 'VOIDED' ? `Voided ${transaction.type === 'PAYMENT' ? 'repayment' : transaction.type.toLowerCase()}` : transaction.type === 'PAYMENT' ? 'Repayment' : transaction.type === 'CREDIT' ? 'Credit' : transaction.type}
            </p>
            <TransactionRowStatus status={transaction.status} />
            {onViewDetails && <Button type="button" variant="link" size="sm" className="mt-1 min-h-11 px-0 underline" aria-label={`View details for transaction ${transaction.id}`} onClick={event => onViewDetails(transaction.id, event.currentTarget)}>Details</Button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TransactionDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const sectionId = `transaction-details-${id}`;
  const { state, load } = useDashboardPanel<Transaction>(`/api/transactions/${encodeURIComponent(id)}`, normalizeTransaction, true);
  const detail = state.status === 'success' && state.data.id === id ? state.data : null;

  return (
    <LedgerSection id={sectionId} title="Transaction details" onClose={onClose}>
      {state.status === 'loading' ? (
        <p role="status" className="min-h-16 text-sm text-muted">Loading transaction details…</p>
      ) : state.status === 'not-found' ? (
        <p role="status" className="text-sm text-muted">This transaction could not be found.</p>
      ) : detail ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium text-muted">Type</dt><dd className="font-semibold text-forest">{detail.type === 'PAYMENT' ? 'Repayment' : detail.type === 'CREDIT' ? 'Credit' : detail.type}</dd>
          <dt className="font-medium text-muted">Status</dt><dd><TransactionDetailStatus status={detail.status} /></dd>
          <dt className="font-medium text-muted">Amount</dt><dd className={`text-[clamp(0.75rem,4vw,1.125rem)] font-semibold [overflow-wrap:anywhere] ${detail.status === 'VOIDED' ? 'text-muted line-through decoration-muted' : 'text-forest'}`}>{formatInrAmount(detail.amount)}</dd>
          <dt className="font-medium text-muted">Customer</dt><dd className="text-forest [overflow-wrap:anywhere]">{detail.customer?.name || 'No customer linked'}</dd>
          <dt className="font-medium text-muted">Date</dt><dd className="text-forest">{formatDate(detail.createdAt)}</dd>
          <dt className="font-medium text-muted">Description</dt><dd className="text-forest [overflow-wrap:anywhere]">{detail.description || 'No description provided'}</dd>
          <dt className="font-medium text-muted">Transaction ID</dt><dd className="break-all font-mono text-xs text-forest">{detail.id}</dd>
        </dl>
      ) : <PanelError panel="transaction details" retry={load} focusTarget={`${sectionId}-title`} message={state.status === 'error' ? state.message : undefined} />}
    </LedgerSection>
  );
}

function HistoryEntries({ transactions }: { transactions: Transaction[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const closeDetail = () => {
    setSelectedId(null);
    window.requestAnimationFrame(() => {
      if (detailTrigger.current?.isConnected) detailTrigger.current.focus();
      else focusInView(document.getElementById('transaction-history-title'));
    });
  };

  useEffect(() => {
    if (selectedId && !transactions.some(transaction => transaction.id === selectedId)) setSelectedId(null);
  }, [selectedId, transactions]);

  return (
    <>
      <TransactionRows transactions={transactions} onViewDetails={(id, opener) => {
        detailTrigger.current = opener;
        setSelectedId(id);
      }} />
      {selectedId && <TransactionDetails key={selectedId} id={selectedId} onClose={closeDetail} />}
    </>
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
      className="min-w-0 space-y-3 rounded-[10px] border border-forest/10 bg-white p-3"
      onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h4 id={`${id}-title`} ref={heading} tabIndex={-1} className="min-w-0 scroll-mt-2 text-base font-semibold text-forest [overflow-wrap:anywhere]">{title}</h4>
        <Button type="button" variant="link" size="sm" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>Close</Button>
      </div>
      {children}
    </section>
  );
}

function CustomerLedgerDetails({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const sectionId = `customer-ledger-${customerId}`;
  const { state, load } = useDashboardPanel<CustomerLedger>(`/api/customers/${encodeURIComponent(customerId)}`, normalizeCustomerLedger, true);
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
            <p className="text-sm text-muted">Outstanding balance</p>
            <strong className="block text-[clamp(0.75rem,4vw,1.125rem)] text-forest [overflow-wrap:anywhere]">{formatInrAmount(ledger.outstandingBalance)}</strong>
          </div>
          {ledger.transactions.length > 0 ? (
            <>
              <p className="text-xs text-muted">Entries returned by the ledger: {ledger.transactions.length}. Older records may be outside this view.</p>
              <TransactionRows transactions={ledger.transactions} customerLedger />
            </>
          ) : <p role="status" className="text-sm text-muted">No transactions for this customer.</p>}
        </>
      ) : <PanelError panel="customer ledger" retry={load} focusTarget={`${sectionId}-title`} message={state.status === 'error' ? state.message : undefined} />}
    </LedgerSection>
  );
}

function PanelError({ panel, retry, focusTarget, retained, message }: {
  panel: string;
  retry: () => void;
  focusTarget?: string;
  retained?: boolean;
  message?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-muted">
      <p role="status">Couldn’t load {panel}.{message && ` ${message}`}{retained && ' Showing last loaded information.'}</p>
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
  const { selectedBusiness, businessContextGeneration, financialOperationStatus, setFinancialOperationStatus } = useAuth();
  const { state: summaryState, load: loadDashboard } = useDashboardPanel<Summary>('/api/dashboard/summary', normalizeSummary);
  const { state: customerState, load: loadCustomers } = useDashboardPanel<Customer[]>('/api/customers', normalizeCustomers);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFiltersState, setHistoryFiltersState] = useState({ page: 1, type: '', customerId: '', from: '', to: '' });
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualType, setManualType] = useState<'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE'>('CREDIT');
  const [manualCustomerId, setManualCustomerId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualReview, setManualReview] = useState(false);
  const [voicePhase, setVoicePhase] = useState<'idle' | 'starting' | 'listening' | 'processing' | 'preview' | 'error'>('idle');
  const [voiceFeedback, setVoiceFeedback] = useState('Tap the microphone and speak naturally in Hindi or Hinglish.');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voicePreview, setVoicePreview] = useState<TransactionPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewActionBusy, setPreviewActionBusy] = useState<'resolve' | 'create' | 'confirm' | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionSequenceRef = useRef(0);
  const recognitionStopRequestedRef = useRef(false);
  const recognitionStartupTimerRef = useRef<number | null>(null);
  const voiceMountedRef = useRef(false);
  const previewRequestRef = useRef<AbortController | null>(null);
  const previewRequestSequence = useRef(0);
  const [customerEditor, setCustomerEditor] = useState<{ mode: 'create' } | { mode: 'edit'; customerId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [customerFormError, setCustomerFormError] = useState('');
  const [customerNotice, setCustomerNotice] = useState('');
  const [customerNoticeError, setCustomerNoticeError] = useState(false);
  const [mutationUncertain, setMutationUncertain] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [ledgerRevision, setLedgerRevision] = useState(0);
  const { page: historyPage, type: historyType, customerId: historyCustomerId, from: historyFrom, to: historyTo } = historyFiltersState;
  const invalidHistoryDates = Boolean(historyFrom && historyTo && historyFrom > historyTo);
  const historyPath = useMemo(() => buildTransactionHistoryPath({
    page: showHistory ? historyPage : 1,
    limit: showHistory ? 10 : 5,
    ...(showHistory ? {
      type: historyType || undefined,
      customerId: historyCustomerId || undefined,
      from: historyFrom || undefined,
      to: historyTo || undefined,
    } : {}),
  }), [historyFiltersState, showHistory]);
  const { state: transactionState, load: loadTransactions, dataPath: transactionDataPath } = useDashboardPanel<TransactionHistoryResponse>(
    historyPath,
    normalizeTransactionHistory,
    false,
    !showHistory || !invalidHistoryDates,
  );
  const searchInput = useRef<HTMLInputElement>(null);
  const customerNameField = useRef<HTMLInputElement>(null);
  const deleteCancelButton = useRef<HTMLButtonElement>(null);
  const uncertainPanel = useRef<HTMLDivElement>(null);
  const addCustomerTrigger = useRef<HTMLButtonElement>(null);
  const customerActionTrigger = useRef<HTMLButtonElement | null>(null);
  const mutationLock = useRef(false);
  const manualEntryTrigger = useRef<HTMLButtonElement>(null);
  const manualTypeField = useRef<HTMLSelectElement>(null);
  const manualReviewHeading = useRef<HTMLHeadingElement>(null);
  const ledgerTrigger = useRef<HTMLButtonElement | null>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const historyOpener = useRef<HTMLButtonElement | null>(null);
  const selectedBusinessId = selectedBusiness?.businessId ?? '';
  const previewContextRef = useRef(`${selectedBusinessId}:${businessContextGeneration}`);
  previewContextRef.current = `${selectedBusinessId}:${businessContextGeneration}`;
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
  const history = transactionState.data;
  const historyDataCurrent = transactionDataPath === historyPath;
  const isPreviewResponse = !showHistory && historyDataCurrent && transactionState.status === 'success';
  const summaryTransactions = isPreviewResponse ? [] : summary?.recentTransactions ?? [];
  const previewTransactions = isPreviewResponse ? history?.transactions ?? [] : summaryTransactions;
  const transactions = showHistory ? historyDataCurrent ? history?.transactions ?? [] : [] : previewTransactions;

  const requestVoicePreview = useCallback(async (transcript: string) => {
    if (!selectedBusinessId) {
      setVoicePhase('error');
      setVoiceFeedback('Select a business before asking for an interpretation.');
      return;
    }
    previewRequestRef.current?.abort();
    const controller = new AbortController();
    previewRequestRef.current = controller;
    const sequence = ++previewRequestSequence.current;
    const contextKey = `${selectedBusinessId}:${businessContextGeneration}`;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setPreviewBusy(true);
    setVoicePhase('processing');
    setVoiceFeedback('Checking what you said. Please wait…');
    try {
      const result = await apiClient.requestJson('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
        signal: controller.signal,
      });
      if (sequence !== previewRequestSequence.current || contextKey !== previewContextRef.current) return;
      if (!isRecord(result) || result.ok !== true) throw new Error('The interpretation response was incomplete.');
      const preview = normalizeTransactionPreview(result.data, selectedBusinessId);
      if (!preview || preview.state !== 'pending') throw new Error('The server returned an incomplete or mismatched preview. Nothing was confirmed.');
      applyPreviewResult(preview);
    } catch (error) {
      if (sequence !== previewRequestSequence.current || contextKey !== previewContextRef.current) return;
      if (controller.signal.aborted) {
        setVoicePhase('error');
        setVoiceFeedback('The interpretation took too long or its request was cancelled. Nothing was confirmed. You can try speaking again.');
      } else if (error instanceof ApiError && (error.kind === 'business-changed' || error.kind === 'session-changed' || error.kind === 'aborted')) {
        setVoicePhase('idle');
        setVoiceFeedback('The selected business or sign-in session changed. Start again in the current business.');
      } else {
        setVoicePhase('error');
        setVoiceFeedback(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'The interpretation did not complete. Nothing was confirmed.');
      }
    } finally {
      window.clearTimeout(timeout);
      if (sequence === previewRequestSequence.current) {
        setPreviewBusy(false);
        previewRequestRef.current = null;
      }
    }
  }, [businessContextGeneration, selectedBusinessId]);

  const clearRecognitionStartup = useCallback(() => {
    const timer = recognitionStartupTimerRef.current;
    recognitionStartupTimerRef.current = null;
    if (timer !== null) window.clearTimeout(timer);
  }, []);

  const releaseRecognition = useCallback((abort = false) => {
    clearRecognitionStartup();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognitionSequenceRef.current += 1;
    recognitionStopRequestedRef.current = false;
    if (!recognition) return;

    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    if (abort) {
      try { recognition.abort(); } catch { /* The browser may already have retired the instance. */ }
    }
  }, [clearRecognitionStartup]);

  const startVoiceCapture = () => {
    const activeRecognition = recognitionRef.current;
    if (activeRecognition) {
      if (voicePhase === 'listening' && !recognitionStopRequestedRef.current) {
        clearRecognitionStartup();
        recognitionStopRequestedRef.current = true;
        setVoiceFeedback('Stopping listening…');
        try {
          activeRecognition.stop();
        } catch {
          releaseRecognition(true);
          setVoicePhase('error');
          setVoiceFeedback('Speech capture could not stop cleanly. Try again.');
        }
      }
      return;
    }
    if (previewRequestRef.current || previewBusy || voicePreview) return;
    const speechWindow = window as SpeechRecognitionWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setVoicePhase('error');
      setVoiceFeedback('Speech recognition is not available in this browser. Use a supported browser with microphone access.');
      return;
    }
    setVoiceTranscript('');
    setVoicePhase('starting');
    setVoiceFeedback('Starting microphone… Press Escape to cancel.');
    try {
      const recognition = new Constructor();
      const sequence = ++recognitionSequenceRef.current;
      const contextKey = `${selectedBusinessId}:${businessContextGeneration}`;
      const isCurrentCapture = () => voiceMountedRef.current
        && recognitionSequenceRef.current === sequence
        && recognitionRef.current === recognition
        && previewContextRef.current === contextKey;
      recognitionRef.current = recognition;
      recognitionStopRequestedRef.current = false;
      recognition.lang = 'hi-IN';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onstart = () => {
        if (!isCurrentCapture() || recognitionStartupTimerRef.current === null) return;
        clearRecognitionStartup();
        setVoicePhase('listening');
        setVoiceFeedback('Listening. Speak one transaction or question.');
      };
      recognition.onresult = event => {
        if (!isCurrentCapture()) return;
        const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0]?.transcript ?? '').join(' ').trim();
        releaseRecognition();
        if (!transcript) {
          setVoicePhase('error');
          setVoiceFeedback('No clear speech was captured. Try speaking again.');
          return;
        }
        setVoiceTranscript(transcript);
        void requestVoicePreview(transcript);
      };
      recognition.onerror = event => {
        if (!isCurrentCapture()) return;
        releaseRecognition();
        if (event.error === 'aborted') {
          setVoicePhase('idle');
          setVoiceFeedback('Speech capture stopped. You can try again when ready.');
          return;
        }
        const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone permission was denied. Allow microphone access in your browser settings and try again.'
          : event.error === 'audio-capture'
            ? 'No microphone was available. Check your device and try again.'
            : event.error === 'network'
              ? 'Speech recognition could not connect. Check your internet connection and try again.'
            : event.error === 'no-speech'
              ? 'No speech was heard. Try again when you are ready.'
              : event.error === 'nomatch'
                ? 'Speech was heard but not recognized. Try speaking more clearly.'
                : 'Speech recognition stopped before a transcript was ready. Please try again.';
        setVoicePhase('error');
        setVoiceFeedback(message);
      };
      recognition.onend = () => {
        if (!isCurrentCapture()) return;
        releaseRecognition();
        setVoicePhase('idle');
        setVoiceFeedback('Listening stopped without a transcript. Try again when you are ready.');
      };
      recognitionStartupTimerRef.current = window.setTimeout(() => {
        if (!isCurrentCapture() || recognitionStartupTimerRef.current === null) return;
        releaseRecognition(true);
        setVoicePhase('error');
        setVoiceFeedback('The microphone didn’t start in time. Check microphone permissions and try again.');
      }, SPEECH_STARTUP_TIMEOUT_MS);
      recognition.start();
    } catch {
      releaseRecognition(true);
      setVoicePhase('error');
      setVoiceFeedback('The microphone could not start. Check browser permission and try again.');
    }
  };

  const clearVoicePreview = () => {
    setVoicePreview(null);
    setVoiceTranscript('');
    setVoicePhase('idle');
    setVoiceFeedback('Preview cleared from this screen. The server-held preview remains until its configured expiry; no transaction was recorded.');
  };

  const PREVIEW_ACTION_TIMEOUT_MS = 15_000;

  const runPreviewAction = async (action: 'resolve' | 'create' | 'confirm', body?: Record<string, unknown>) => {
    if (!voicePreview || !selectedBusinessId) return;
    const previewId = voicePreview.id;
    const endpoint = action === 'resolve'
      ? `/api/preview/${encodeURIComponent(previewId)}/resolve-customer`
      : action === 'create'
        ? `/api/preview/${encodeURIComponent(previewId)}/create-customer`
        : `/api/preview/${encodeURIComponent(previewId)}/confirm`;
    setPreviewActionBusy(action);
    try {
      const result = await apiClient.requestJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }, 'business', PREVIEW_ACTION_TIMEOUT_MS);
      if (!isRecord(result) || result.ok !== true) throw new ApiError('Preview action did not complete.', 'invalid-response');
      const preview = normalizeTransactionPreview(result.data, selectedBusinessId);
      if (!preview) throw new ApiError('The server returned an invalid preview response.', 'invalid-response');
      applyPreviewResult(preview);
      if (action === 'confirm' && preview.state === 'confirmed') {
        setVoiceFeedback('Transaction confirmed and recorded in the ledger.');
        void loadDashboard(true);
        void loadCustomers(true);
        void loadTransactions(true);
      }
    } catch (error) {
      setVoicePhase('error');
      setVoiceFeedback(error instanceof ApiError ? error.message : 'Preview action failed. Nothing was confirmed.');
    } finally {
      setPreviewActionBusy(null);
    }
  };

  const applyPreviewResult = (preview: TransactionPreview) => {
    setVoicePreview(preview);
    if (preview.state === 'confirmed') {
      setVoicePhase('preview');
      return;
    }
    setVoicePhase('preview');
    const resolution = preview.customerResolution;
    if (preview.intent === 'ADD_CUSTOMER') {
      setVoiceFeedback(resolution?.status === 'created'
        ? 'Customer created. Review the preview; no transaction was recorded. Add a transaction separately after explicit confirmation.'
        : 'Customer creation requires your explicit approval. No customer or transaction has been created yet.');
      return;
    }
    if (resolution?.status === 'ambiguous') {
      setVoiceFeedback('Multiple customers match this name. Select the correct customer before confirming any transaction.');
      return;
    }
    if (resolution?.status === 'unknown') {
      setVoiceFeedback('No matching customer was found in this business. You can explicitly create the customer, then confirm the transaction separately.');
      return;
    }
    const readOnlyIntent = readOnlyPreviewIntents.has(preview.intent);
    setVoiceFeedback(isSupportedPreviewWrite(preview)
      ? 'Preview is ready. Review the details below and confirm only if everything is correct.'
      : readOnlyIntent && preview.confidence > 0
        ? 'This is a read-only question. This preview does not fetch a live balance or transaction history, and nothing was recorded. Use Find customer to view the ledger.'
        : readOnlyIntent
          ? 'The server could not understand this request. No balance or transaction history was fetched, and nothing was recorded. Try speaking again or use Find customer.'
          : 'The server could not prepare a complete transaction suggestion. Review the missing details below.');
  };

  useEffect(() => {
    releaseRecognition(true);
    setVoicePreview(null);
    setVoiceTranscript('');
    setPreviewBusy(false);
    setVoicePhase('idle');
    setVoiceFeedback('Tap the microphone and speak naturally in Hindi or Hinglish.');
    previewRequestSequence.current += 1;
    previewRequestRef.current?.abort();
    previewRequestRef.current = null;
  }, [selectedBusinessId, businessContextGeneration, releaseRecognition]);

  useEffect(() => {
    voiceMountedRef.current = true;
    return () => {
      voiceMountedRef.current = false;
      releaseRecognition(true);
      previewRequestSequence.current += 1;
      previewRequestRef.current?.abort();
      previewRequestRef.current = null;
    };
  }, [releaseRecognition]);

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
    else {
      setHistoryFiltersState(current => updateTransactionHistoryFilters(current, {}));
      setShowHistory(true);
    }
  };
  const closeHistory = () => {
    setShowHistory(false);
    focusInView(historyOpener.current?.isConnected ? historyOpener.current : historyTrigger.current);
  };

  const restoreCustomerActionFocus = () => {
    window.requestAnimationFrame(() => {
      if (customerActionTrigger.current?.isConnected) customerActionTrigger.current.focus();
      else addCustomerTrigger.current?.focus();
    });
  };

  useEffect(() => {
    if (customerEditor) customerNameField.current?.focus();
  }, [customerEditor]);

  useEffect(() => {
    if (deleteTarget) deleteCancelButton.current?.focus();
  }, [deleteTarget]);

  useEffect(() => {
    if (mutationUncertain) focusInView(uncertainPanel.current);
  }, [mutationUncertain]);

  useEffect(() => {
    if (!manualEntryOpen) return;
    if (manualReview) manualReviewHeading.current?.focus();
    else manualTypeField.current?.focus();
  }, [manualEntryOpen, manualReview]);

  const closeCustomerForm = (restoreFocus = true) => {
    setCustomerEditor(null);
    setCustomerFormError('');
    if (restoreFocus) restoreCustomerActionFocus();
  };

  const openCreateCustomer = () => {
    customerActionTrigger.current = addCustomerTrigger.current;
    setDeleteTarget(null);
    setCustomerFormError('');
    setCustomerNotice('');
    setCustomerNoticeError(false);
    setCustomerNameInput('');
    setCustomerPhoneInput('');
    setCustomerEditor({ mode: 'create' });
  };

  const openEditCustomer = (customer: Customer, opener: HTMLButtonElement) => {
    customerActionTrigger.current = opener;
    setDeleteTarget(null);
    setCustomerFormError('');
    setCustomerNotice('');
    setCustomerNoticeError(false);
    setCustomerNameInput(customer.name);
    setCustomerPhoneInput(customer.phone ?? '');
    setCustomerEditor({ mode: 'edit', customerId: customer.id });
  };

  const acknowledgeUncertainMutation = () => {
    setMutationUncertain(false);
    setMutationPending(false);
    mutationLock.current = false;
    setFinancialOperationStatus('idle');
    setCustomerFormError('');
    setCustomerNotice('The previous request was not repeated. Check the current customer details before making the same change again.');
    setDeleteTarget(null);
    setCustomerEditor(null);
    restoreCustomerActionFocus();
  };

  const runCustomerMutation = async (
    path: string,
    init: RequestInit,
    expectedId?: string,
  ): Promise<'success' | 'definite-error' | 'uncertain'> => {
    if (mutationLock.current || financialOperationStatus !== 'idle') return 'definite-error';
    mutationLock.current = true;
    setMutationPending(true);
    setFinancialOperationStatus('pending');
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    try {
      const result = await apiClient.requestJson(path, { ...init, signal: controller.signal });
      if (!isRecord(result) || result.ok !== true || !Object.prototype.hasOwnProperty.call(result, 'data')) {
        throw new ApiError('The server returned an invalid customer response.', 'invalid-response');
      }
      if (init.method === 'DELETE') {
        if (!isRecord(result.data) || typeof result.data.id !== 'string' || result.data.id !== expectedId) {
          throw new ApiError('The server returned an invalid customer response.', 'invalid-response');
        }
      } else if (!normalizeMutationCustomer(result.data, expectedId)) {
        throw new ApiError('The server returned an invalid customer response.', 'invalid-response');
      }
      setFinancialOperationStatus('idle');
      setCustomerNotice('Customer request completed. The list is updating.');
      setCustomerNoticeError(false);
      window.clearTimeout(timeout);
      setFinancialOperationStatus('idle');
      void loadCustomers(true);
      setMutationPending(false);
      mutationLock.current = false;
      return 'success';
    } catch (error) {
      const definite = error instanceof ApiError && error.kind === 'http'
        && [400, 401, 403, 404, 409, 429].includes(error.status ?? 0);
      if (timedOut || !definite) {
        setMutationUncertain(true);
        setMutationPending(false);
        setFinancialOperationStatus('uncertain');
        const uncertainty = 'We could not confirm the result. The customer change may have completed. Do not repeat it yet; refresh the customer list and check the current details.';
        setCustomerFormError(uncertainty);
        setCustomerNotice(uncertainty);
        setCustomerNoticeError(true);
        return 'uncertain';
      }
      setMutationPending(false);
      mutationLock.current = false;
      setFinancialOperationStatus('idle');
      const message = error instanceof ApiError ? error.message : 'Could not save customer changes. Check the details and try again.';
      setCustomerFormError(message);
      setCustomerNotice(message);
      setCustomerNoticeError(true);
      return 'definite-error';
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const saveCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = customerNameInput.trim();
    if (!name) {
      setCustomerFormError('Enter the customer name.');
      customerNameField.current?.focus();
      return;
    }
    if (mutationUncertain || mutationLock.current) return;

    if (customerEditor?.mode === 'edit') {
      const current = customers.find(customer => customer.id === customerEditor.customerId);
      if (!current) {
        setCustomerFormError('This customer is no longer in the list. Refresh the list and try again.');
        return;
      }
      const updates: { name?: string; phone?: string } = {};
      if (name !== current.name) updates.name = name;
      if (customerPhoneInput !== (current.phone ?? '')) updates.phone = customerPhoneInput;
      if (Object.keys(updates).length === 0) {
        setCustomerFormError('No changes to save.');
        return;
      }
      const outcome = await runCustomerMutation(`/api/customers/${encodeURIComponent(current.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }, current.id);
      if (outcome === 'success') {
        closeCustomerForm(false);
        restoreCustomerActionFocus();
        if (selectedCustomerId === current.id) setLedgerRevision(value => value + 1);
        setCustomerNotice('Customer details updated.');
      }
      return;
    }

    const payload: { name: string; phone?: string } = { name };
    if (customerPhoneInput.trim()) payload.phone = customerPhoneInput.trim();
    const outcome = await runCustomerMutation('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (outcome === 'success') {
      closeCustomerForm(false);
      restoreCustomerActionFocus();
      setCustomerNotice('Customer request completed. The customer list has been refreshed.');
    }
  };

  const deleteCustomer = async () => {
    if (!deleteTarget || mutationUncertain || mutationLock.current) return;
    const target = deleteTarget;
    const outcome = await runCustomerMutation(`/api/customers/${encodeURIComponent(target.id)}`, { method: 'DELETE' }, target.id);
    if (outcome === 'success') {
      setDeleteTarget(null);
      setCustomerNotice(`${target.name} was deleted.`);
      setSelectedCustomerId(current => current === target.id ? null : current);
      window.requestAnimationFrame(() => focusInView(addCustomerTrigger.current));
    } else if (outcome === 'definite-error') {
      setDeleteTarget(null);
      restoreCustomerActionFocus();
    }
  };

  const openDeleteConfirmation = (customer: Customer, opener: HTMLButtonElement) => {
    customerActionTrigger.current = opener;
    setCustomerEditor(null);
    setCustomerFormError('');
    setCustomerNotice('');
    setCustomerNoticeError(false);
    setDeleteTarget(customer);
  };

  const startManualEntry = () => {
    setManualType('CREDIT');
    setManualCustomerId('');
    setManualAmount('');
    setManualDescription('');
    setManualError('');
    setManualReview(false);
    setManualEntryOpen(true);
  };
  const cancelManualEntry = () => {
    setManualEntryOpen(false);
    setManualReview(false);
    setManualError('');
    window.requestAnimationFrame(() => manualEntryTrigger.current?.focus());
  };
  const openManualReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError('');
    if (!isValidManualAmount(manualAmount)) {
      setManualError('Enter a positive rupee amount with up to two decimal places and no more than 12 digits before the decimal.');
      return;
    }
    if ((manualType === 'CREDIT' || manualType === 'PAYMENT') && !customers.some(customer => customer.id === manualCustomerId)) {
      setManualError('Choose a customer for credit or payment.');
      return;
    }
    setManualReview(true);
  };

  const manualCustomer = customers.find(customer => customer.id === manualCustomerId);
  const manualDirection = manualType === 'CREDIT'
    ? 'Credit given to a customer'
    : manualType === 'PAYMENT'
      ? 'Payment received from a customer'
      : manualType === 'SALE'
        ? 'Sale activity; this does not represent customer debt'
        : 'Expense activity; this does not represent customer debt';
  const previewDirection = voicePreview?.type === 'CREDIT'
    ? 'Suggested direction: add credit to the customer ledger.'
    : voicePreview?.type === 'PAYMENT'
      ? 'Suggested direction: record a customer repayment.'
      : voicePreview?.type === 'SALE'
        ? 'Suggested direction: record a sale; this is not a customer debt change.'
        : voicePreview?.type === 'EXPENSE'
          ? 'Suggested direction: record an expense; this is not a customer debt change.'
          : '';

  useEffect(() => {
    if (selectedCustomerId && !customerState.data?.some(customer => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(null);
    }
  }, [customerState.data, selectedCustomerId]);

  const transactionPanel = showHistory ? 'transaction history' : 'recent transactions';
  const invalidActiveHistoryDates = showHistory && invalidHistoryDates;
  const transactionContent = (
    <>
      {showHistory && invalidHistoryDates && <p role="alert" className="rounded-md border border-forest/15 bg-beige-light p-3 text-sm text-forest">The start date must be on or before the end date.</p>}
      {!invalidActiveHistoryDates && (transactionState.status === 'loading' || (transactionState.status === 'success' && showHistory && !historyDataCurrent)) && (
        <p role="status" className={transactions.length ? 'text-sm text-muted' : 'flex min-h-28 items-center justify-center text-sm text-muted'}>
          {transactions.length ? 'Updating transactions. Showing last loaded information.' : `Loading ${transactionPanel}…`}
        </p>
      )}
      {!invalidActiveHistoryDates && transactionState.status === 'error' && (
        <div className={transactions.length ? undefined : 'flex min-h-28 items-center justify-center'}>
          <PanelError panel={transactionPanel} retry={loadTransactions} message={transactionState.message} retained={(historyDataCurrent && Boolean(history)) || summaryTransactions.length > 0} focusTarget={showHistory ? 'transaction-history-title' : 'recent-transactions'} />
        </div>
      )}
      {showHistory && historyDataCurrent && !invalidActiveHistoryDates && transactionState.status === 'success' && history && (
        <p className="text-xs leading-5 text-muted">
          {history.total !== null && history.total !== undefined
            ? `Showing ${history.transactions.length} entries on this page; ${history.total} matching transactions across ${history.totalPages ?? 'unknown'} pages.`
            : `Showing ${history.transactions.length} entries returned by the API. The response does not include history-completeness metadata.`}
        </p>
      )}
      {!invalidActiveHistoryDates && (showHistory ? historyDataCurrent ? history?.transactions ?? [] : [] : transactions).length > 0 ? (
        <>
          {showHistory
            ? <HistoryEntries key={`${historyPage}-${historyType}-${historyCustomerId}-${historyFrom}-${historyTo}`} transactions={history?.transactions ?? []} />
            : <TransactionRows transactions={transactions.slice(0, 5)} />}
        </>
      ) : !invalidActiveHistoryDates && transactionState.status === 'success' && (!showHistory || historyDataCurrent) && (
        <div className="flex flex-col items-center justify-center py-8 text-muted">
          {!showHistory && <Clock className="mb-2 h-8 w-8 opacity-50" aria-hidden="true" />}
          <p className="text-sm">{showHistory ? 'No transactions returned.' : 'No recent transactions'}</p>
          {showHistory && (historyType || historyCustomerId || historyFrom || historyTo) && <p className="mt-1 text-xs">Try changing or resetting the filters.</p>}
        </div>
      )}
      {showHistory && historyDataCurrent && !invalidActiveHistoryDates && history?.totalPages !== null && history?.totalPages !== undefined && history.totalPages > 1 && (
        <nav aria-label="Transaction history pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-forest/10 pt-3">
          <Button type="button" variant="outline" disabled={transactionState.status !== 'success' || historyPage <= 1} onClick={() => setHistoryFiltersState(current => changeTransactionHistoryPage(current, current.page - 1, history.totalPages!))}>Previous</Button>
          <p role="status" className="text-sm text-muted">Page {historyPage} of {history.totalPages}</p>
          <Button type="button" variant="outline" disabled={transactionState.status !== 'success' || historyPage >= history.totalPages} onClick={() => setHistoryFiltersState(current => changeTransactionHistoryPage(current, current.page + 1, history.totalPages!))}>Next</Button>
        </nav>
      )}
    </>
  );

  const historyFilters = showHistory ? (
    <div className="min-w-0 space-y-3 rounded-[10px] border border-forest/10 bg-beige-light p-3" role="group" aria-label="Transaction filters">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <label htmlFor="history-type" className="text-xs font-medium text-forest">Transaction type</label>
          <select id="history-type" value={historyType} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { type: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
            <option value="">All transactions</option>
            <option value="CREDIT">Credit</option>
            <option value="PAYMENT">Payment</option>
            <option value="SALE">Sale</option>
            <option value="EXPENSE">Expense</option>
          </select>
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor="history-customer" className="text-xs font-medium text-forest">Customer</label>
          <select id="history-customer" value={historyCustomerId} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { customerId: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
            <option value="">All customers</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.id}</option>)}
          </select>
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor="history-from" className="text-xs font-medium text-forest">From date</label>
          <input id="history-from" type="date" max={historyTo || undefined} value={historyFrom} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { from: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
        </div>
        <div className="min-w-0 space-y-1">
          <label htmlFor="history-to" className="text-xs font-medium text-forest">To date</label>
          <input id="history-to" type="date" min={historyFrom || undefined} value={historyTo} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { to: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-forest/10 pt-2">
        <p className="text-xs text-muted">{historyType || historyCustomerId || historyFrom || historyTo ? 'Filters are applied to the returned transaction history.' : 'No filters applied.'}</p>
        <Button type="button" variant="link" size="sm" className="px-0 underline" disabled={!historyType && !historyCustomerId && !historyFrom && !historyTo} onClick={() => {
            setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { type: '', customerId: '', from: '', to: '' }));
        }}>Reset filters</Button>
      </div>
    </div>
  ) : null;

return (
    <div className="mx-auto max-w-[1200px] min-w-0 space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      <header className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Daily ledger</p>
          <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-bold leading-tight tracking-tight text-forest">{selectedBusiness?.businessName || summary?.businessName || 'Dashboard'}</h1>
          <p className="text-sm leading-6 text-muted">Voice-first digital ledger</p>
        </div>
      </header>

      <ScrollReveal className="min-w-0 rounded-[14px] border border-forest/10 bg-white p-4 shadow-card sm:p-5">
        <div className="text-center">
          <h2 id="voice-input" className="sr-only">Voice input</h2>

          <div className="relative flex flex-col items-center gap-3">
            <div className="relative h-[80px] w-[80px]">
              <div aria-hidden="true" className={`voice-ring ${voicePhase === 'listening' ? 'is-listening' : ''} ${voicePhase === 'processing' ? 'is-processing' : ''} ${voicePhase === 'preview' ? 'has-preview' : ''} ${voicePhase === 'error' ? 'has-error' : ''} ${voicePhase === 'starting' ? 'is-starting' : ''}`}>
                <div className="voice-ring-inner" />
              </div>

              <Button
                type="button"
                onClick={startVoiceCapture}
                onKeyDown={event => {
                  if (event.key !== 'Escape' || recognitionStartupTimerRef.current === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  releaseRecognition(true);
                  setVoicePhase('idle');
                  setVoiceFeedback('Microphone startup cancelled. You can try again when ready.');
                }}
                disabled={previewBusy || Boolean(voicePreview)}
                aria-pressed={voicePhase === 'listening'}
                aria-describedby="voice-feedback"
                aria-label={voicePhase === 'listening' ? 'Stop listening' : voicePhase === 'starting' ? 'Starting microphone…' : 'Start voice recording'}
                className={`voice-mic-button ${voicePhase === 'listening' ? 'is-listening' : ''} ${voicePhase === 'processing' ? 'is-processing' : ''} ${voicePhase === 'preview' ? 'has-preview' : ''} ${voicePhase === 'error' ? 'has-error' : ''} ${voicePhase === 'starting' ? 'is-starting' : ''}`}
              >
                <span className="mic-motion flex h-full w-full items-center justify-center">
                  <Mic aria-hidden="true" className="h-10 w-10" />
                </span>
              </Button>
            </div>

            <div className="voice-status" role="status" aria-live="polite" aria-atomic="true">
              {voicePhase === 'listening' && (
                <div className="voice-status-listening">
                  <VoiceWaveform animate={true} className="h-6 w-full max-w-xs sm:max-w-sm" />
                  <p className="mt-2 text-sm text-forest">Listening… speak now</p>
                </div>
              )}
              {voicePhase === 'starting' && (
                <p className="text-sm text-muted">Starting microphone…</p>
              )}
              {voicePhase === 'processing' && (
                <div className="voice-status-processing">
                  <div className="voice-spinner" aria-hidden="true" />
                  <p className="text-sm text-forest">Processing your speech…</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (previewRequestRef.current) {
                        previewRequestRef.current.abort();
                        previewRequestRef.current = null;
                      }
                      setPreviewBusy(false);
                      setVoicePhase('idle');
                      setVoiceFeedback('Interpretation cancelled. You can try speaking again.');
                    }}
                    className="mt-2 min-h-0 px-3 py-1.5 text-xs"
                    aria-label="Cancel interpretation"
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {voicePhase === 'preview' && (
                <p className="text-sm text-purple">Preview ready — review below</p>
              )}
              {voicePhase === 'error' && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-full px-4 py-1.5">{voiceFeedback}</p>
              )}
              {voicePhase === 'idle' && !voiceTranscript && !voicePreview && (
                <p className="text-sm text-muted">Tap the microphone and speak in Hindi or Hinglish</p>
              )}
            </div>
          </div>

          <div id="voice-feedback" className="mt-4 min-h-[2.5rem] text-sm text-forest" aria-live="polite" aria-atomic="true">
            {voicePhase === 'idle' && !voiceTranscript && !voicePreview ? (
              <p className="text-muted">Your words become ledger entries automatically.</p>
            ) : (
              <p>{voiceFeedback}</p>
            )}
          </div>

          {voiceTranscript && <div className="mt-4 rounded-md border border-forest/10 bg-white p-3 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Recognized speech</p>
            <p className="mt-1 [overflow-wrap:anywhere] text-sm text-forest">{voiceTranscript}</p>
          </div>}

          <div className="mx-auto mt-4 max-w-3xl rounded-[14px] border border-forest/10 bg-beige-light p-3 text-left sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Try saying</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2" role="list">
              <li className="flex min-h-11 items-center gap-2 rounded-[8px] border border-forest/10 bg-white px-3 py-2 text-sm leading-5 text-forest">
                <Mic className="h-4 w-4 shrink-0 text-purple" aria-hidden="true" />
                "Rahul ko 500 rupaye udhaar diye"
              </li>
              <li className="flex min-h-11 items-center gap-2 rounded-[8px] border border-forest/10 bg-white px-3 py-2 text-sm leading-5 text-forest">
                <Mic className="h-4 w-4 shrink-0 text-purple" aria-hidden="true" />
                "Amit se 200 rupaye mile"
              </li>
              <li className="flex min-h-11 items-center gap-2 rounded-[8px] border border-forest/10 bg-white px-3 py-2 text-sm leading-5 text-forest">
                <Mic className="h-4 w-4 shrink-0 text-purple" aria-hidden="true" />
                "Suman ka 300 rupaye baaki hai"
              </li>
              <li className="flex min-h-11 items-center gap-2 rounded-[8px] border border-forest/10 bg-white px-3 py-2 text-sm leading-5 text-forest">
                <Mic className="h-4 w-4 shrink-0 text-purple" aria-hidden="true" />
                "Rajesh ne 1000 rupaye wapas kiye"
              </li>
            </ul>
          </div>

          {voicePreview && <section aria-labelledby="voice-preview-title" className="mt-5 space-y-4 rounded-xl border border-forest/15 bg-white p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="voice-preview-title" className="font-semibold text-forest">Review transaction preview</h3>
                <p className="mt-1 text-xs text-muted">This is a suggestion only — no transaction has been recorded yet.</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={previewActionBusy !== null} onClick={clearVoicePreview}>
                <X className="h-4 w-4 mr-1" aria-hidden="true" />
                Clear
              </Button>
            </div>

            <div className="rounded-lg border border-purple/20 bg-purple/5 p-4">
              <dl className="grid min-w-0 gap-x-4 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
                {voicePreview.type && (
                  <>
                    <dt className="font-medium text-forest">Transaction type</dt>
                    <dd className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center rounded-full bg-purple/20 px-2.5 py-0.5 text-xs font-semibold text-purple">
                        {voicePreview.type}
                      </span>
                      <span className="text-forest capitalize">
                        {voicePreview.type === 'CREDIT' ? 'Credit given' : voicePreview.type === 'PAYMENT' ? 'Payment received' : voicePreview.type === 'SALE' ? 'Sale recorded' : 'Expense recorded'}
                      </span>
                    </dd>
                  </>
                )}
                {voicePreview.customerName && (
                  <>
                    <dt className="font-medium text-forest">Customer</dt>
                    <dd className="break-words text-forest">
                      {voicePreview.customerName}
                      {voicePreview.customerId && <span className="text-xs text-muted ml-2">(ID: {voicePreview.customerId.slice(0, 8)}…)</span>}
                    </dd>
                  </>
                )}
                {typeof voicePreview.amount === 'number' && (
                  <>
                    <dt className="font-medium text-forest">Amount</dt>
                    <dd className="text-[clamp(1rem,4vw,1.25rem)] font-bold text-forest [overflow-wrap:anywhere]">
                      {formatInrAmount(voicePreview.amount)}
                    </dd>
                  </>
                )}
                {voicePreview.description && (
                  <>
                    <dt className="font-medium text-forest">Description</dt>
                    <dd className="break-words text-forest">{voicePreview.description}</dd>
                  </>
                )}
                <dt className="font-medium text-forest">Parser confidence</dt>
                <dd className="text-forest">{Math.round(voicePreview.confidence * 100)}%</dd>
                <dt className="font-medium text-forest">Preview ID</dt>
                <dd className="break-all font-mono text-xs text-forest">{voicePreview.id}</dd>
                <dt className="font-medium text-forest">Prepared</dt>
                <dd className="text-forest">{formatDate(voicePreview.createdAt)}</dd>
              </dl>
            </div>

            {voicePreview.customerResolution && (
              <div className="space-y-3">
                {voicePreview.customerResolution.status === 'matched' && (
                  <div className="rounded-lg border border-forest/10 bg-beige-light p-3 text-sm text-forest" role="status">
                    <p className="font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-forest/10 text-forest" aria-hidden="true">✓</span>
                      Customer matched: <strong>{voicePreview.customerResolution.customerName}</strong>
                      {voicePreview.customerResolution.customerId && <span className="text-xs text-muted">(ID: {voicePreview.customerResolution.customerId.slice(0, 8)}…)</span>}
                    </p>
                  </div>
                )}
                {voicePreview.customerResolution.status === 'ambiguous' && (
                  <div role="alert" className="rounded-lg border border-forest/15 bg-beige-light p-4 text-sm text-forest">
                    <p className="font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple/20 text-purple" aria-hidden="true">!</span>
                      Multiple customers match this name. Please select the correct one:
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {voicePreview.customerResolution.candidates.map((candidate) => (
                        <Button
                          key={candidate.id}
                          type="button"
                          variant="outline"
                          disabled={previewActionBusy !== null}
                          onClick={() => void runPreviewAction('resolve', { customerId: candidate.id })}
                          className="min-w-0 sm:min-w-[140px] flex-1 sm:flex-initial"
                        >
                          {candidate.name}{candidate.phone ? ` · ${candidate.phone}` : ''}
                        </Button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">Selecting a customer will update the preview. You can then review and confirm.</p>
                  </div>
                )}
                {voicePreview.customerResolution.status === 'unknown' && (
                  <div role="alert" className="rounded-lg border border-forest/15 bg-beige-light p-4 text-sm text-forest">
                    <p className="font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700" aria-hidden="true">✕</span>
                      No matching customer found for <strong>"{voicePreview.customerResolution.requestedName ?? voicePreview.customerName}"</strong>
                    </p>
                    <p className="mt-2">Create this customer only if you explicitly approve. Customer creation does not record a transaction.</p>
                    <div className="mt-3">
                      <Button
                        type="button"
                        disabled={previewActionBusy !== null || !voicePreview.customerResolution.requestedName}
                        onClick={() => void runPreviewAction('create', { name: voicePreview.customerResolution?.requestedName ?? voicePreview.customerName })}
                      >
                        {previewActionBusy === 'create' ? 'Creating customer…' : 'Create customer'}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted">After creation, the preview will update. You can then review and confirm the transaction separately.</p>
                  </div>
                )}
                {voicePreview.customerResolution.status === 'created' && (
                  <div className="rounded-lg border border-forest/10 bg-beige-light p-3 text-sm text-forest" role="status">
                    <p className="font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple/20 text-purple" aria-hidden="true">✓</span>
                      Customer created: <strong>{voicePreview.customerResolution.customerName}</strong>
                      {voicePreview.customerResolution.customerId && <span className="text-xs text-muted">(ID: {voicePreview.customerResolution.customerId.slice(0, 8)}…)</span>}
                    </p>
                    <p className="mt-1 text-xs text-muted">Review the updated preview and confirm the transaction if correct.</p>
                  </div>
                )}
                {voicePreview.customerResolution.status === 'not_required' && (
                  <div className="rounded-lg border border-forest/10 bg-beige-light p-3 text-sm text-forest" role="status">
                    <p className="font-medium flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-forest/10 text-forest" aria-hidden="true">ℹ</span>
                      No customer needed for this transaction type.
                    </p>
                  </div>
                )}
              </div>
            )}

            {voicePreview.missingFields.length > 0 && (
              <div role="alert" className="rounded-lg border border-forest/15 bg-beige-light p-4 text-sm text-forest">
                <p className="font-medium flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700" aria-hidden="true">!</span>
                  Missing information:
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {voicePreview.missingFields.map((field, index) => (
                    <li key={`${field}-${index}`} className="break-words">{field}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">Try speaking again with the missing details, or use manual entry.</p>
              </div>
            )}

            {readOnlyPreviewIntents.has(voicePreview.intent) && (
              <div className="rounded-lg border border-forest/10 bg-beige-light p-4 text-sm text-forest" role="status">
                <p className="font-medium flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-forest/10 text-forest" aria-hidden="true">ℹ</span>
                  Read-only request
                </p>
                <p className="mt-1">
                  {voicePreview.confidence > 0
                    ? 'This is a balance or history query. No live ledger lookup was performed, and nothing was recorded.'
                    : 'The server could not understand this request. No balance or transaction history was fetched.'}
                </p>
                <p className="mt-2 text-xs text-muted">Use "Find customer" to view the ledger, or try speaking again.</p>
              </div>
            )}

            {isSupportedPreviewWrite(voicePreview) && (
              <div className="rounded-lg border border-forest/15 bg-beige-light p-4 text-sm text-forest" role="alert">
                <p className="font-medium flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple/20 text-purple" aria-hidden="true">⚠</span>
                  Ready to confirm
                </p>
                <p className="mt-1">Review the details above carefully. Confirming will record this financial transaction in the ledger.</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2 border-t border-forest/10">
              {isSupportedPreviewWrite(voicePreview) && (
                <Button
                  type="button"
                  size="lg"
                  disabled={previewActionBusy !== null}
                  onClick={() => void runPreviewAction('confirm')}
                  className="flex-1 min-w-0 sm:min-w-[140px]"
                >
                  {previewActionBusy === 'confirm' ? (
                    <>
                      <span className="mr-2 flex h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                      Confirming…
                    </>
                  ) : (
                    'Confirm transaction'
                  )}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={previewActionBusy !== null}
                onClick={clearVoicePreview}
                className="flex-1 min-w-0 sm:min-w-[140px]"
              >
                <X className="h-4 w-4 mr-1" aria-hidden="true" />
                Cancel
              </Button>
            </div>

            {voicePreview.state === 'confirmed' && (
              <div className="rounded-lg border border-forest/10 bg-green-50 p-4 text-sm text-green-800" role="status">
                <p className="font-medium flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700" aria-hidden="true">✓</span>
                  Transaction confirmed and recorded.
                </p>
                {voicePreview.customerId && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/customers/${voicePreview.customerId}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-forest underline underline-offset-2 hover:text-forest-dark"
                    >
                      <span aria-hidden="true">→</span>
                      View customer ledger
                    </Link>
                    <Button type="button" variant="outline" size="sm" onClick={clearVoicePreview}>
                      Continue
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-xs text-green-700">The dashboard and customer list have been updated with the new transaction.</p>
              </div>
            )}
          </section>}
        </div>
      </ScrollReveal>

<section id="financial-summary" tabIndex={-1} aria-labelledby="dashboard-summary-heading">
        <h2 id="dashboard-summary-heading" className="sr-only">Dashboard summary</h2>
        {summaryState.status === 'error' && (
          <div className="mb-2">
            <PanelError panel="dashboard summary" retry={loadDashboard} focusTarget="financial-summary" retained={Boolean(summary)} message={summaryState.message} />
          </div>
        )}
        <ScrollReveal className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {statCards.map((card) => {
            const amount = formatInrAmount(summary?.[card.key]);
            const compactAmount = amount.length > 12;
            return (
            <Card key={card.key} className="relative min-w-0 overflow-hidden p-4">
              <CardHeader className="flex-row items-start justify-between space-y-0 p-0">
                <h3 className={`min-h-10 max-w-[9rem] text-sm font-medium leading-5 ${card.key === 'totalOutstanding' ? 'text-forest' : 'text-muted'}`}>
                  {card.label}
                </h3>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${card.color}`}>{card.icon}</div>
              </CardHeader>
              <CardContent className="mt-3 p-0">
                {summaryState.status === 'loading' && !summary ? (
                  <div aria-hidden="true" className="flex h-8 items-center">
                    <span className="h-4 w-20 max-w-[80%] rounded-full bg-forest/10" />
                  </div>
                ) : (
                  <p className={`font-bold leading-8 text-forest [overflow-wrap:anywhere] ${compactAmount ? 'text-[clamp(0.8125rem,1.5vw,1rem)]' : 'text-[clamp(1.25rem,2vw,1.5rem)]'} ${card.key === 'totalOutstanding' ? 'border-l-2 border-purple pl-3' : ''}`}>
                    {amount}
                  </p>
                )}
              </CardContent>
            </Card>
            );
          })}
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="rounded-[14px] border border-forest/10 bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-purple/10">
                <List className="h-5 w-5 text-purple" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-forest">Quick actions</h3>
                <p className="mt-0.5 text-xs leading-5 text-muted">Open a detailed ledger or customer view</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[375px]:grid-cols-2 sm:flex sm:flex-wrap">
              <Link
                href="/transactions"
                className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg border border-forest/20 bg-white text-sm font-medium text-forest hover:bg-beige-light hover:border-forest/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors"
              >
                <List className="h-4 w-4" aria-hidden="true" />
                View all transactions
              </Link>
              <Link
                href="/customers"
                className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg border border-forest/20 bg-white text-sm font-medium text-forest hover:bg-beige-light hover:border-forest/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors"
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Manage customers
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {summaryState.status === 'loading' && (
          <p role="status" className={summary ? 'mt-2 text-center text-sm text-muted' : 'sr-only'}>
            {summary ? 'Updating dashboard summary. Showing last loaded amounts.' : 'Loading dashboard summary…'}
          </p>
        )}
      </section>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <ScrollReveal delay={0.1} className="min-w-0 rounded-[14px] border border-forest/10 bg-white p-4 shadow-card sm:p-5">
          <CardHeader className="flex-row items-center justify-between gap-3 px-0 pt-0">
            <CardTitle id="customers" tabIndex={-1} className="text-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest">Customers</CardTitle>
            <Button ref={addCustomerTrigger} type="button" size="sm" className="shrink-0" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={openCreateCustomer}>
              Add customer
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-3">
              {customerNotice && !mutationUncertain && !(customerEditor && customerFormError) && <p role={customerNoticeError ? 'alert' : 'status'} className="rounded-md border border-forest/10 bg-beige-light p-3 text-sm text-forest">{customerNotice}</p>}
              {mutationUncertain && (
                <div ref={uncertainPanel} tabIndex={-1} className="space-y-3 rounded-md border border-forest/20 bg-beige-light p-3 text-sm text-forest focus-visible:outline-2 focus-visible:outline-forest" role="group" aria-labelledby="customer-mutation-warning">
                  <p id="customer-mutation-warning">{customerNotice}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={mutationPending} onClick={() => { void loadCustomers(); }}>Refresh customer list</Button>
                    <Button type="button" variant="outline" onClick={acknowledgeUncertainMutation}>I understand; allow switching</Button>
                  </div>
                  <p className="text-xs">Acknowledging does not confirm whether the change completed. It only unlocks navigation; do not repeat the original request until you have checked the customer details.</p>
                </div>
              )}
              {customerEditor && (
                <form
                  aria-labelledby="customer-form-title"
                  className="min-w-0 space-y-3 rounded-[10px] border border-forest/15 bg-beige-light p-3 sm:p-4"
                  onSubmit={saveCustomer}
                  onKeyDown={event => {
                    if (event.key !== 'Escape' || mutationPending) return;
                    event.preventDefault();
                    event.stopPropagation();
                    closeCustomerForm();
                  }}
                >
                  <div>
                    <h3 id="customer-form-title" className="font-semibold text-forest">{customerEditor.mode === 'create' ? 'Add customer' : 'Edit customer'}</h3>
                    {customerEditor.mode === 'edit' && (() => {
                      const customer = customers.find(item => item.id === customerEditor.customerId);
                      return customer ? <p className="mt-1 text-xs text-muted">Editing {customer.name} · Customer ID {customer.id}</p> : null;
                    })()}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="customer-name-input" className="text-sm font-medium text-forest">Customer name <span aria-hidden="true">*</span></label>
                    <input ref={customerNameField} id="customer-name-input" name="name" required autoComplete="off" value={customerNameInput} onChange={event => setCustomerNameInput(event.target.value)} aria-describedby={mutationUncertain ? 'customer-mutation-warning' : customerFormError ? 'customer-form-error' : undefined} className="min-h-11 w-full rounded-sm border border-forest/60 bg-white px-3 py-2 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="customer-phone-input" className="text-sm font-medium text-forest">Phone number <span className="font-normal text-muted">(optional)</span></label>
                    <input id="customer-phone-input" name="phone" type="tel" autoComplete="off" value={customerPhoneInput} onChange={event => setCustomerPhoneInput(event.target.value)} aria-describedby={mutationUncertain ? 'customer-mutation-warning' : customerFormError ? 'customer-form-error' : undefined} className="min-h-11 w-full rounded-sm border border-forest/60 bg-white px-3 py-2 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                  </div>
                  {customerFormError && !mutationUncertain && <p id="customer-form-error" role="alert" className="text-sm text-forest-dark">{customerFormError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'}>{mutationPending ? 'Saving…' : customerEditor.mode === 'create' ? 'Save customer' : 'Save changes'}</Button>
                    <Button type="button" variant="outline" disabled={mutationPending} onClick={() => closeCustomerForm()}>Cancel</Button>
                  </div>
                </form>
              )}
              {deleteTarget && (
                <section role="dialog" aria-labelledby="delete-customer-title" aria-describedby="delete-customer-identity delete-customer-warning" className="space-y-3 rounded-lg border border-forest/20 bg-beige-light p-4 text-forest" onKeyDown={event => {
                  if (event.key !== 'Escape' || mutationPending) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDeleteTarget(null);
                  restoreCustomerActionFocus();
                }}>
                  <div>
                    <h3 id="delete-customer-title" className="font-semibold">Delete this customer?</h3>
                    <p id="delete-customer-identity" className="mt-1 break-words text-sm">{deleteTarget.name}{deleteTarget.phone ? ` · ${deleteTarget.phone}` : ''}<span className="block text-xs">Customer ID {deleteTarget.id}</span></p>
                  </div>
                  <p id="delete-customer-warning" className="text-sm">This removes the customer from the active list. Existing transaction history is retained, but the customer ledger may no longer be available. Check the balance before continuing.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="destructive" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={() => { void deleteCustomer(); }}>{mutationPending ? 'Deleting…' : 'Delete customer'}</Button>
                    <Button ref={deleteCancelButton} type="button" variant="outline" disabled={mutationPending} onClick={() => { setDeleteTarget(null); restoreCustomerActionFocus(); }}>Cancel</Button>
                  </div>
                </section>
              )}
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
                      className="block min-h-11 w-full rounded-sm border border-forest/60 bg-white py-2 pl-3 pr-16 text-base text-forest placeholder:text-muted focus:border-forest focus:outline-2 focus:outline-offset-2 focus:outline-forest [&::-webkit-search-cancel-button]:hidden"
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
              {customerState.status === 'error' && customers.length > 0 && <PanelError panel="customers" retry={loadCustomers} focusTarget="customers" message={customerState.message} retained />}
              {customerState.status === 'loading' && !customers.length ? (
                <p role="status" className="flex min-h-28 items-center justify-center text-sm text-muted">Loading customers…</p>
              ) : customerState.status === 'error' && !customers.length ? (
                <div className="flex min-h-28 items-center justify-center">
                  <PanelError panel="customers" retry={loadCustomers} focusTarget="customers" message={customerState.message} />
                </div>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map(customer => {
                  const isOpen = selectedCustomerId === customer.id;
                  const duplicate = (customerNameCounts.get(customer.name.trim().toLowerCase()) ?? 0) > 1;
                  const outstanding = formatInrAmount(customer.outstandingBalance);
                  return (
                    <div key={customer.id} className="space-y-2">
                      <div className="rounded-[10px] border border-forest/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 break-words">
                            <p className="text-sm font-semibold leading-5 text-forest">{customer.name}</p>
                            <p className="mt-0.5 text-xs leading-5 text-muted [overflow-wrap:anywhere]">{customer.phone || 'No phone saved'}</p>
                            {duplicate && <p className="text-xs text-muted [overflow-wrap:anywhere]">Customer ID {customer.id}</p>}
                          </div>
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-purple/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            {customer.transactionCount} txns
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-baseline gap-x-1">
                          <span className={`min-w-0 max-w-full font-bold text-forest [overflow-wrap:anywhere] ${outstanding.length > 12 ? 'text-[clamp(0.75rem,3.5vw,1.125rem)]' : 'text-lg'}`}>{outstanding}</span>
                          <span className="text-xs text-muted">outstanding</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-forest/10 pt-2">
                          <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-0 sm:min-w-[105px]"
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
                          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                            <Button type="button" variant="link" size="sm" className="px-0 underline" aria-label={`Edit ${customer.name}${duplicate ? `, customer ID ${customer.id}` : ''}`} disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={event => openEditCustomer(customer, event.currentTarget)}>Edit</Button>
                            <Button type="button" variant="link" size="sm" className="px-0 underline" aria-label={`Delete ${customer.name}${customer.phone ? `, ${customer.phone}` : ''}, customer ID ${customer.id}`} disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={event => openDeleteConfirmation(customer, event.currentTarget)}>Delete</Button>
                          </div>
                        </div>
                      </div>
                      {isOpen && <CustomerLedgerDetails key={`${customer.id}-${ledgerRevision}`} customerId={customer.id} onClose={closeLedger} />}
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

        <ScrollReveal delay={0.2} className="min-w-0 rounded-[14px] border border-forest/10 bg-white p-4 shadow-card sm:p-5">
          <CardHeader className="px-0 pt-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-x-3 sm:gap-y-0">
              <div className="flex items-center gap-3 min-w-0">
                <CardTitle id="recent-transactions" tabIndex={-1} className="text-lg truncate">Recent transactions</CardTitle>
                <Link
                  href="/transactions"
                  className="inline-flex items-center gap-1 text-xs font-medium text-forest underline underline-offset-2 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest shrink-0"
                  aria-label="View all transactions"
                >
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  View all
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button ref={manualEntryTrigger} type="button" variant="link" size="sm" className="px-0 underline shrink-0" aria-expanded={manualEntryOpen} aria-controls={manualEntryOpen ? 'manual-entry' : undefined} onClick={() => manualEntryOpen ? cancelManualEntry() : startManualEntry()}>
                  {manualEntryOpen ? 'Close' : 'Manual entry'}
                </Button>
                <Button
                  ref={historyTrigger}
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0 underline shrink-0"
                  aria-expanded={showHistory}
                  aria-controls={showHistory ? 'transaction-history' : undefined}
                  onClick={event => showHistory ? closeHistory() : openHistory(event.currentTarget)}
                >
                  {showHistory ? 'Hide' : 'History'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-2.5">
              {manualEntryOpen && (
                <section id="manual-entry" aria-labelledby={manualReview ? 'manual-entry-review-title' : 'manual-entry-title'} className="min-w-0 space-y-2.5 rounded-[10px] border border-forest/15 bg-beige-light p-2.5 sm:p-3" onKeyDown={event => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  cancelManualEntry();
                }}>
                  {!manualReview ? (
                    <form onSubmit={openManualReview} className="space-y-2.5">
                      <div>
                        <h3 id="manual-entry-title" className="font-semibold text-forest">Prepare a manual entry</h3>
                        <p className="mt-0.5 text-xs leading-5 text-muted">This form prepares a review. It does not directly record or submit a financial transaction.</p>
                      </div>
                      <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="min-w-0 space-y-0.5">
                        <label htmlFor="manual-transaction-type" className="text-sm font-medium text-forest">Transaction type</label>
                        <select ref={manualTypeField} id="manual-transaction-type" value={manualType} onChange={event => { setManualType(event.target.value as typeof manualType); setManualError(''); }} className="min-h-10 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-sm text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
                          <option value="CREDIT">Credit</option>
                          <option value="PAYMENT">Payment</option>
                          <option value="SALE">Sale</option>
                          <option value="EXPENSE">Expense</option>
                        </select>
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <label htmlFor="manual-customer" className="text-sm font-medium text-forest">Customer {manualType === 'CREDIT' || manualType === 'PAYMENT' ? <span aria-hidden="true">*</span> : <span className="font-normal text-muted">(optional)</span>}</label>
                        <select id="manual-customer" value={manualCustomerId} onChange={event => { setManualCustomerId(event.target.value); setManualError(''); }} disabled={customerState.status !== 'success' || customers.length === 0} className="min-h-10 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-sm text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-60">
                          <option value="">{customerState.status === 'loading' ? 'Loading customers…' : customers.length ? 'Select a customer' : 'No customers available'}</option>
                          {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.id}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <label htmlFor="manual-amount" className="text-sm font-medium text-forest">Amount (₹)</label>
                        <input id="manual-amount" type="text" inputMode="decimal" autoComplete="off" value={manualAmount} onChange={event => { setManualAmount(event.target.value); setManualError(''); }} aria-describedby="manual-amount-guidance" className="min-h-10 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-sm text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                        <p id="manual-amount-guidance" className="text-xs text-muted">Positive amount; up to two decimal places. No rounding is applied in this review.</p>
                      </div>
                      <div className="min-w-0 space-y-0.5 sm:col-span-2">
                        <label htmlFor="manual-description" className="text-sm font-medium text-forest">Description <span className="font-normal text-muted">(optional)</span></label>
                        <textarea id="manual-description" rows={1} value={manualDescription} onChange={event => setManualDescription(event.target.value)} className="w-full min-w-0 resize-y rounded-sm border border-forest/60 bg-white px-3 py-1.5 text-sm text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                      </div>
                      </div>
                      {manualError && <p role="alert" className="text-sm text-forest-dark">{manualError}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" size="sm">Review details</Button>
                        <Button type="button" variant="outline" size="sm" onClick={cancelManualEntry}>Cancel draft</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <h3 ref={manualReviewHeading} id="manual-entry-review-title" tabIndex={-1} className="font-semibold text-forest focus-visible:outline-2 focus-visible:outline-forest">Review entry</h3>
                        <p className="mt-1 text-sm text-muted">{manualDirection}</p>
                      </div>
                      <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
                        <dt className="font-medium text-muted">Type</dt><dd className="text-forest">{manualType}</dd>
                        {manualCustomer && <><dt className="font-medium text-muted">Customer</dt><dd className="break-words text-forest">{manualCustomer.name} · {manualCustomer.id}</dd></>}
                        <dt className="font-medium text-muted">Amount</dt><dd className="text-[clamp(0.75rem,4vw,1.125rem)] font-semibold text-forest [overflow-wrap:anywhere]">{formatInrAmount(manualAmount)}</dd>
                        <dt className="font-medium text-muted">Description</dt><dd className="break-words text-forest">{manualDescription.trim() || 'No description'}</dd>
                      </dl>
                      <p role="status" className="rounded-md border border-forest/15 bg-white p-3 text-sm text-forest">Review only — nothing has been sent or recorded. The available preview API accepts a transcript, not these structured fields, so manual submission is unavailable.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => setManualReview(false)}>Back to entry</Button>
                        <Button type="button" variant="link" className="px-0 underline" onClick={cancelManualEntry}>Close draft</Button>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {showHistory ? (
                <LedgerSection id="transaction-history" title="Transaction history" onClose={closeHistory}>
                  {historyFilters}
                  {transactionContent}
                  <a href="#voice-input" className="inline-flex min-h-11 items-center text-sm font-medium text-forest underline underline-offset-4">Back to voice</a>
                </LedgerSection>
              ) : transactionContent}
            </div>
          </CardContent>
        </ScrollReveal>
      </div>

    </div>
  );
}
