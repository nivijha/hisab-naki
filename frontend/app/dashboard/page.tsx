'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Mic, Clock, TrendingUp, CreditCard, Users, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { isSupportedPreviewWrite, normalizeTransactionPreview, type TransactionPreview } from '@/lib/preview-contract';
import { VoiceWaveform } from '@/components/ui/voice-waveform';
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

const formatCurrency = (value: Money) => {
  const negative = value.startsWith('-');
  const [whole, fraction] = (negative ? value.slice(1) : value).split('.');
  let grouped = whole;
  if (whole.length > 3) {
    const lastThree = whole.slice(-3);
    let prefix = whole.slice(0, -3);
    const groups: string[] = [];
    while (prefix.length > 2) {
      groups.unshift(prefix.slice(-2));
      prefix = prefix.slice(0, -2);
    }
    if (prefix) groups.unshift(prefix);
    grouped = `${groups.join(',')},${lastThree}`;
  }
  return `${negative ? '-' : ''}₹${grouped}${fraction ? `.${fraction}` : ''}`;
};

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

type PanelState<T> =
  | { status: 'loading' | 'error'; data?: T }
  | { status: 'not-found'; data?: never }
  | { status: 'success'; data: T };

function useDashboardPanel<T>(path: string, normalize: (data: unknown) => T | null, handleNotFound = false, enabled = true) {
  const [state, setState] = useState<PanelState<T>>({ status: 'loading' });
  const [dataPath, setDataPath] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);

  const load = useCallback(async (): Promise<boolean> => {
    if (!active.current) return false;

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
      if (request.current === controller) setState(previous => ({ status: 'error', data: previous.data }));
      return false;
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

function normalizeMoney(value: unknown, allowNegative = false, requirePositive = false): Money | null {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith('-');
  if (negative && !allowNegative) return null;
  const unsigned = negative ? text.slice(1) : text;
  const isZero = /^0+(?:\.0+)?$/.test(unsigned);
  if (requirePositive && isZero) return null;
  return isZero ? '0' : text;
}

function normalizeSummary(value: unknown): Summary | null {
  if (!isRecord(value) || typeof value.businessName !== 'string' || !value.businessName.trim()) return null;
  const todaysSales = normalizeMoney(value.todaysSales);
  const todaysExpenses = normalizeMoney(value.todaysExpenses);
  const paymentsReceived = normalizeMoney(value.paymentsReceived);
  const newCredit = normalizeMoney(value.newCredit);
  const totalOutstanding = normalizeMoney(value.totalOutstanding, true);
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
    const outstandingBalance = normalizeMoney(item.outstandingBalance, true);
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
  const outstandingBalance = normalizeMoney(value.outstandingBalance, true);
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
    <ul className="space-y-3" role="list">
      {transactions.map(transaction => (
        <li key={transaction.id} className="flex flex-col items-stretch justify-between gap-2 rounded-lg border border-forest/10 p-3 sm:flex-row sm:items-center">
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
          <div className="max-w-full shrink-0 text-left sm:max-w-[50%] sm:text-right">
            <p className="whitespace-nowrap text-xs font-bold text-forest sm:text-sm">{formatCurrency(transaction.amount)}</p>
            <p className={`mt-0.5 inline-block max-w-full rounded-full px-2 text-xs font-medium ${
              transaction.type === 'PAYMENT' ? 'bg-purple/10 text-forest' : transaction.type === 'CREDIT' ? 'bg-beige text-forest' : 'text-muted'
            }`}>
              {transaction.type === 'PAYMENT' ? 'Repayment' : transaction.type === 'CREDIT' ? 'Credit' : transaction.type}
            </p>
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
          <dt className="font-medium text-muted">Amount</dt><dd className="whitespace-nowrap text-[clamp(0.75rem,4vw,1.125rem)] font-semibold text-forest">{formatCurrency(detail.amount)}</dd>
          <dt className="font-medium text-muted">Customer</dt><dd className="text-forest [overflow-wrap:anywhere]">{detail.customer?.name || 'No customer linked'}</dd>
          <dt className="font-medium text-muted">Date</dt><dd className="text-forest">{formatDate(detail.createdAt)}</dd>
          <dt className="font-medium text-muted">Description</dt><dd className="text-forest [overflow-wrap:anywhere]">{detail.description || 'No description provided'}</dd>
          <dt className="font-medium text-muted">Transaction ID</dt><dd className="break-all font-mono text-xs text-forest">{detail.id}</dd>
        </dl>
      ) : <PanelError panel="transaction details" retry={load} focusTarget={`${sectionId}-title`} />}
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
            <strong className="block whitespace-nowrap text-[clamp(0.75rem,4vw,1.125rem)] text-forest">{formatCurrency(ledger.outstandingBalance)}</strong>
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
  const [voicePhase, setVoicePhase] = useState<'idle' | 'listening' | 'processing' | 'preview' | 'error'>('idle');
  const [voiceFeedback, setVoiceFeedback] = useState('Tap the microphone and speak naturally in Hindi or Hinglish.');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voicePreview, setVoicePreview] = useState<TransactionPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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
      setVoicePreview(preview);
      setVoicePhase('preview');
      setVoiceFeedback(isSupportedPreviewWrite(preview)
        ? 'The server prepared a suggestion. Review the details below; confirmation is currently unavailable for safety.'
        : 'The server could not prepare a complete transaction suggestion. Review the missing details below.');
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

  const startVoiceCapture = () => {
    if (voicePhase === 'listening') {
      recognitionRef.current?.stop();
      return;
    }
    if (previewBusy || voicePreview) return;
    const speechWindow = window as SpeechRecognitionWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) {
      setVoicePhase('error');
      setVoiceFeedback('Speech recognition is not available in this browser. Use a supported browser with microphone access.');
      return;
    }
    setVoiceTranscript('');
    setVoicePhase('listening');
    setVoiceFeedback('Listening. Speak one transaction or question.');
    try {
      const recognition = new Constructor();
      recognitionRef.current = recognition;
      recognition.lang = 'hi-IN';
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onstart = () => {
        setVoicePhase('listening');
        setVoiceFeedback('Listening. Speak one transaction or question.');
      };
      recognition.onresult = event => {
        const transcript = Array.from(event.results).filter(result => result.isFinal).map(result => result[0]?.transcript ?? '').join(' ').trim();
        if (!transcript) {
          setVoicePhase('error');
          setVoiceFeedback('No clear speech was captured. Try speaking again.');
          return;
        }
        setVoiceTranscript(transcript);
        void requestVoicePreview(transcript);
      };
      recognition.onerror = event => {
        const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone permission was denied. Allow microphone access in your browser settings and try again.'
          : event.error === 'audio-capture'
            ? 'No microphone was available. Check your device and try again.'
            : event.error === 'no-speech'
              ? 'No speech was heard. Try again when you are ready.'
              : 'Speech recognition stopped before a transcript was ready. Please try again.';
        setVoicePhase('error');
        setVoiceFeedback(message);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setVoicePhase(current => current === 'listening' ? 'idle' : current);
      };
      recognition.start();
    } catch {
      recognitionRef.current = null;
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

  useEffect(() => {
    setVoicePreview(null);
    setVoiceTranscript('');
    setPreviewBusy(false);
    setVoicePhase('idle');
    setVoiceFeedback('Tap the microphone and speak naturally in Hindi or Hinglish.');
    previewRequestSequence.current += 1;
    previewRequestRef.current?.abort();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, [selectedBusinessId, businessContextGeneration]);

  useEffect(() => () => {
    previewRequestSequence.current += 1;
    previewRequestRef.current?.abort();
    recognitionRef.current?.abort();
  }, []);

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
      void loadCustomers();
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
      restoreCustomerActionFocus();
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
      {!invalidActiveHistoryDates && (transactionState.status === 'loading' || (showHistory && !historyDataCurrent)) && (
        <p role="status" className={transactions.length ? 'text-sm text-muted' : 'flex min-h-28 items-center justify-center text-sm text-muted'}>
          {transactions.length ? 'Updating transactions. Showing last loaded information.' : `Loading ${transactionPanel}…`}
        </p>
      )}
      {!invalidActiveHistoryDates && transactionState.status === 'error' && (
        <div className={transactions.length ? undefined : 'flex min-h-28 items-center justify-center'}>
          <PanelError panel={transactionPanel} retry={loadTransactions} retained={(historyDataCurrent && Boolean(history)) || summaryTransactions.length > 0} focusTarget={showHistory ? 'transaction-history-title' : 'recent-transactions'} />
        </div>
      )}
      {showHistory && historyDataCurrent && !invalidActiveHistoryDates && transactionState.status === 'success' && history?.total !== null && history?.total !== undefined && (
        <p className="text-xs text-muted">Showing {history.transactions.length} entries on this page; {history.total} matching transactions across {history.totalPages ?? 'unknown'} pages.</p>
      )}
      {!invalidActiveHistoryDates && (showHistory ? historyDataCurrent ? history?.transactions ?? [] : [] : transactions).length > 0 ? (
        <>
          {showHistory && history?.total !== null && history?.total !== undefined
            ? null
            : showHistory && <p className="text-xs text-muted">Entries returned by the API: {history?.transactions.length ?? 0}. The response does not include history-completeness metadata.</p>}
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
        <nav aria-label="Transaction history pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-forest/10 pt-3">
          <Button type="button" variant="outline" disabled={transactionState.status !== 'success' || historyPage <= 1} onClick={() => setHistoryFiltersState(current => changeTransactionHistoryPage(current, current.page - 1, history.totalPages!))}>Previous</Button>
          <p role="status" className="text-sm text-muted">Page {historyPage} of {history.totalPages}</p>
          <Button type="button" variant="outline" disabled={transactionState.status !== 'success' || historyPage >= history.totalPages} onClick={() => setHistoryFiltersState(current => changeTransactionHistoryPage(current, current.page + 1, history.totalPages!))}>Next</Button>
        </nav>
      )}
    </>
  );

  const historyFilters = showHistory ? (
    <div className="space-y-3 rounded-md border border-forest/10 bg-beige-light p-3" role="group" aria-label="Transaction filters">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="history-type" className="text-xs font-medium text-forest">Transaction type</label>
          <select id="history-type" value={historyType} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { type: event.target.value }))} className="min-h-11 w-full rounded-sm border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
            <option value="">All transactions</option>
            <option value="CREDIT">Credit</option>
            <option value="PAYMENT">Payment</option>
            <option value="SALE">Sale</option>
            <option value="EXPENSE">Expense</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="history-customer" className="text-xs font-medium text-forest">Customer</label>
          <select id="history-customer" value={historyCustomerId} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { customerId: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-sm border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
            <option value="">All customers</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.id}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="history-from" className="text-xs font-medium text-forest">From date</label>
          <input id="history-from" type="date" max={historyTo || undefined} value={historyFrom} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { from: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-sm border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
        </div>
        <div className="space-y-1">
          <label htmlFor="history-to" className="text-xs font-medium text-forest">To date</label>
          <input id="history-to" type="date" min={historyFrom || undefined} value={historyTo} onChange={event => setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { to: event.target.value }))} className="min-h-11 w-full min-w-0 rounded-sm border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{historyType || historyCustomerId || historyFrom || historyTo ? 'Filters are applied to the returned transaction history.' : 'No filters applied.'}</p>
        <Button type="button" variant="link" size="sm" className="px-0 underline" disabled={!historyType && !historyCustomerId && !historyFrom && !historyTo} onClick={() => {
            setHistoryFiltersState(current => updateTransactionHistoryFilters(current, { type: '', customerId: '', from: '', to: '' }));
        }}>Reset filters</Button>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="min-w-0 break-words">
        <h1 className="text-3xl font-bold text-forest tracking-tight">{selectedBusiness?.businessName || summary?.businessName || 'Dashboard'}</h1>
        <p className="mt-1 text-sm text-muted">Voice-first digital ledger</p>
      </div>

      <ScrollReveal className="break-words rounded-md border border-forest/10 bg-white p-4 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`recording-indicator ${voicePhase === 'listening' ? 'is-live' : ''}`} aria-hidden="true" />
            <h2 id="voice-input" tabIndex={-1} className="text-xl font-semibold text-forest">Voice input</h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="button" onClick={startVoiceCapture} disabled={previewBusy || Boolean(voicePreview)} aria-pressed={voicePhase === 'listening'} aria-describedby="voice-feedback" className="w-48 shrink-0">
              <span className="mic-motion mr-2 flex h-7 w-7 items-center justify-center">
                <Mic aria-hidden="true" className="h-5 w-5" />
              </span>
              {voicePhase === 'listening' ? 'Stop listening' : 'Start speaking'}
            </Button>
            <a href="#customers" className="inline-flex min-h-11 items-center rounded-sm px-2 text-sm font-medium text-forest underline underline-offset-4 hover:bg-beige-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
              Find customer
            </a>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-purple/20 bg-purple/5 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3" aria-hidden={voicePhase !== 'listening'}>
            <VoiceWaveform animate={voicePhase === 'listening'} className="h-8 w-32 shrink-0" />
            <p className="text-xs text-muted">{voicePhase === 'listening' ? 'Listening now' : 'Voice status'}</p>
          </div>
          <p id="voice-feedback" role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-forest">
            {voiceFeedback}
          </p>
          {voiceTranscript && <div className="mt-3 rounded-md border border-forest/10 bg-white p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Recognized speech</p>
            <p className="mt-1 [overflow-wrap:anywhere] text-sm text-forest">{voiceTranscript}</p>
          </div>}
          {voicePreview && <section aria-labelledby="voice-preview-title" className="mt-3 space-y-3 rounded-md border border-forest/15 bg-white p-3 sm:p-4">
            <div>
              <h3 id="voice-preview-title" className="font-semibold text-forest">Server interpretation · suggestion only</h3>
              <p className="mt-1 text-xs text-muted">This is not a verified ledger entry and no transaction has been recorded.</p>
            </div>
            <dl className="grid min-w-0 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="font-medium text-muted">Intent</dt><dd className="break-words text-forest">{voicePreview.intent}</dd>
              <dt className="font-medium text-muted">Parser status</dt><dd className="text-forest">{voicePreview.readyForConfirmation ? 'Backend marked complete (not independently verified)' : 'Backend marked incomplete'}</dd>
              {voicePreview.type && <><dt className="font-medium text-muted">Transaction type</dt><dd className="text-forest">{voicePreview.type}</dd></>}
              {voicePreview.customerName && <><dt className="font-medium text-muted">Customer name from parser</dt><dd className="break-words text-forest">{voicePreview.customerName}</dd></>}
              {typeof voicePreview.amount === 'number' && <><dt className="font-medium text-muted">Amount from parser</dt><dd className="whitespace-nowrap text-[clamp(0.75rem,4vw,1.125rem)] font-semibold text-forest">₹{String(voicePreview.amount)}</dd></>}
              {voicePreview.description && <><dt className="font-medium text-muted">Description</dt><dd className="break-words text-forest">{voicePreview.description}</dd></>}
              <dt className="font-medium text-muted">Preview ID</dt><dd className="break-all font-mono text-xs text-forest">{voicePreview.id}</dd>
              <dt className="font-medium text-muted">Prepared</dt><dd className="text-forest">{formatDate(voicePreview.createdAt)}</dd>
            </dl>
            {previewDirection && <p className="rounded-md bg-beige-light p-3 text-sm text-forest">{previewDirection}</p>}
            {voicePreview.missingFields.length > 0 && <div role="alert" className="rounded-md border border-forest/15 bg-beige-light p-3 text-sm text-forest">
              <p className="font-medium">The parser reports missing information:</p>
              <ul className="mt-1 list-inside list-disc">{voicePreview.missingFields.map((field, index) => <li key={`${field}-${index}`} className="break-words">{field}</li>)}</ul>
            </div>}
            {voicePreview.customerName && <p className="text-xs text-muted">The preview identifies a customer by name only. It does not include a verified customer ID; duplicate names cannot be resolved safely here.</p>}
            <p className="rounded-md border border-forest/15 bg-beige-light p-3 text-sm text-forest">Financial confirmation is unavailable while parser accuracy, customer identity, amount precision, and durable outcome recovery remain unresolved. The preview API does not provide an expiry timestamp.</p>
    <Button type="button" variant="outline" onClick={clearVoicePreview}>Clear preview</Button>
          </section>}
        </div>
      </ScrollReveal>

      <section id="financial-summary" tabIndex={-1} aria-label="Dashboard summary">
        {summaryState.status === 'error' && (
          <div className="mb-2">
            <PanelError panel="dashboard summary" retry={loadDashboard} focusTarget="financial-summary" retained={Boolean(summary)} />
          </div>
        )}
        <ScrollReveal className="grid gap-4 min-[375px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {statCards.map((card) => {
            const amount = summary ? formatCurrency(summary[card.key]) : '—';
            const compactAmount = amount.length > 12;
            return (
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
                  <p className={`whitespace-nowrap font-bold leading-8 text-forest ${compactAmount ? 'text-[clamp(0.75rem,1.5vw,1.125rem)]' : 'text-2xl min-[375px]:max-sm:text-[clamp(1rem,4vw,1.25rem)]'}`}>
                    {amount}
                  </p>
                )}
              </CardContent>
            </Card>
            );
          })}
        </ScrollReveal>
        {summaryState.status === 'loading' && (
          <p role="status" className={summary ? 'mt-2 text-center text-sm text-muted' : 'sr-only'}>
            {summary ? 'Updating dashboard summary. Showing last loaded amounts.' : 'Loading dashboard summary…'}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ScrollReveal delay={0.1} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft">
          <CardHeader className="flex-row items-center justify-between gap-3 px-0 pt-0">
            <CardTitle id="customers" tabIndex={-1} className="text-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest">Customers</CardTitle>
            <Button ref={addCustomerTrigger} type="button" size="sm" className="shrink-0" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={openCreateCustomer}>
              Add customer
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-3">
              {customerNotice && <p role={customerNoticeError ? 'alert' : 'status'} className="rounded-md border border-forest/10 bg-beige-light p-3 text-sm text-forest">{customerNotice}</p>}
              {mutationUncertain && (
                <div ref={uncertainPanel} tabIndex={-1} className="space-y-3 rounded-md border border-forest/20 bg-beige-light p-3 text-sm text-forest focus-visible:outline-2 focus-visible:outline-forest" role="alert">
                  <p>The request result is uncertain. Do not send it again. Refresh the customer list and inspect the customer before deciding what to do next.</p>
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
                  className="space-y-3 rounded-lg border border-forest/15 bg-beige-light p-4"
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
                    <input ref={customerNameField} id="customer-name-input" name="name" required autoComplete="off" value={customerNameInput} onChange={event => setCustomerNameInput(event.target.value)} aria-describedby={customerFormError ? 'customer-form-error' : undefined} className="min-h-11 w-full rounded-sm border border-forest/20 bg-white px-3 py-2 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="customer-phone-input" className="text-sm font-medium text-forest">Phone number <span className="font-normal text-muted">(optional)</span></label>
                    <input id="customer-phone-input" name="phone" type="tel" autoComplete="off" value={customerPhoneInput} onChange={event => setCustomerPhoneInput(event.target.value)} aria-describedby={customerFormError ? 'customer-form-error' : undefined} className="min-h-11 w-full rounded-sm border border-forest/20 bg-white px-3 py-2 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                  </div>
                  {customerFormError && <p id="customer-form-error" role="alert" className="text-sm text-forest-dark">{customerFormError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'}>{mutationPending ? 'Saving…' : customerEditor.mode === 'create' ? 'Save customer' : 'Save changes'}</Button>
                    <Button type="button" variant="outline" disabled={mutationPending} onClick={() => closeCustomerForm()}>Cancel</Button>
                  </div>
                </form>
              )}
              {deleteTarget && (
                <section aria-labelledby="delete-customer-title" className="space-y-3 rounded-lg border border-forest/20 bg-beige-light p-4 text-forest" onKeyDown={event => {
                  if (event.key !== 'Escape' || mutationPending) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDeleteTarget(null);
                  restoreCustomerActionFocus();
                }}>
                  <div>
                    <h3 id="delete-customer-title" className="font-semibold">Delete this customer?</h3>
                    <p className="mt-1 break-words text-sm">{deleteTarget.name}{deleteTarget.phone ? ` · ${deleteTarget.phone}` : ''}</p>
                    <p className="text-xs">Customer ID {deleteTarget.id}</p>
                  </div>
                  <p id="delete-customer-warning" className="text-sm">This action cannot be undone. Customers with transaction history cannot be deleted.</p>
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
                          <span className={`min-w-0 whitespace-nowrap font-bold text-forest ${formatCurrency(customer.outstandingBalance).length > 12 ? 'text-[clamp(0.75rem,3.5vw,1.125rem)]' : 'text-lg'}`}>{formatCurrency(customer.outstandingBalance)}</span>
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
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                            <Button type="button" variant="link" size="sm" className="px-0 underline" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={event => openEditCustomer(customer, event.currentTarget)}>Edit</Button>
                            <Button type="button" variant="link" size="sm" className="px-0 underline" aria-label={`Delete ${customer.name}${customer.phone ? `, ${customer.phone}` : ''}, customer ID ${customer.id}`} disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={event => openDeleteConfirmation(customer, event.currentTarget)}>Delete</Button>
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

        <ScrollReveal delay={0.2} className="rounded-lg border border-forest/10 bg-white p-6 shadow-soft">
          <CardHeader className="px-0 pt-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <CardTitle id="recent-transactions" tabIndex={-1} className="text-lg">Recent transactions</CardTitle>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Button ref={manualEntryTrigger} type="button" variant="link" size="sm" className="px-0 underline" aria-expanded={manualEntryOpen} aria-controls={manualEntryOpen ? 'manual-entry' : undefined} onClick={() => manualEntryOpen ? cancelManualEntry() : startManualEntry()}>
                  {manualEntryOpen ? 'Close manual entry' : 'Prepare manual entry'}
                </Button>
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
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-3">
              {manualEntryOpen && (
                <section id="manual-entry" aria-labelledby={manualReview ? 'manual-entry-review-title' : 'manual-entry-title'} className="space-y-3 rounded-lg border border-forest/15 bg-beige-light p-4" onKeyDown={event => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  cancelManualEntry();
                }}>
                  {!manualReview ? (
                    <form onSubmit={openManualReview} className="space-y-3">
                      <div>
                        <h3 id="manual-entry-title" className="font-semibold text-forest">Prepare a manual entry</h3>
                        <p className="mt-1 text-sm text-muted">Review the details only. This form does not record or submit a financial transaction.</p>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="manual-transaction-type" className="text-sm font-medium text-forest">Transaction type</label>
                        <select ref={manualTypeField} id="manual-transaction-type" value={manualType} onChange={event => { setManualType(event.target.value as typeof manualType); setManualError(''); }} className="min-h-11 w-full rounded-sm border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
                          <option value="CREDIT">Credit</option>
                          <option value="PAYMENT">Payment</option>
                          <option value="SALE">Sale</option>
                          <option value="EXPENSE">Expense</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="manual-customer" className="text-sm font-medium text-forest">Customer {manualType === 'CREDIT' || manualType === 'PAYMENT' ? <span aria-hidden="true">*</span> : <span className="font-normal text-muted">(optional)</span>}</label>
                        <select id="manual-customer" value={manualCustomerId} onChange={event => { setManualCustomerId(event.target.value); setManualError(''); }} disabled={customerState.status !== 'success' || customers.length === 0} className="min-h-11 w-full rounded-sm border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-60">
                          <option value="">{customerState.status === 'loading' ? 'Loading customers…' : customers.length ? 'Select a customer' : 'No customers available'}</option>
                          {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.id}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="manual-amount" className="text-sm font-medium text-forest">Amount (₹)</label>
                        <input id="manual-amount" type="text" inputMode="decimal" autoComplete="off" value={manualAmount} onChange={event => { setManualAmount(event.target.value); setManualError(''); }} aria-describedby="manual-amount-guidance" className="min-h-11 w-full rounded-sm border border-forest/20 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                        <p id="manual-amount-guidance" className="text-xs text-muted">Positive amount; up to two decimal places. No rounding is applied in this review.</p>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="manual-description" className="text-sm font-medium text-forest">Description <span className="font-normal text-muted">(optional)</span></label>
                        <textarea id="manual-description" rows={2} value={manualDescription} onChange={event => setManualDescription(event.target.value)} className="w-full rounded-sm border border-forest/20 bg-white px-3 py-2 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" />
                      </div>
                      {manualError && <p role="alert" className="text-sm text-forest-dark">{manualError}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit">Review details</Button>
                        <Button type="button" variant="outline" onClick={cancelManualEntry}>Cancel draft</Button>
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
                        <dt className="font-medium text-muted">Amount</dt><dd className="whitespace-nowrap text-[clamp(0.75rem,4vw,1.125rem)] font-semibold text-forest">{formatCurrency(manualAmount)}</dd>
                        <dt className="font-medium text-muted">Description</dt><dd className="break-words text-forest">{manualDescription.trim() || 'No description'}</dd>
                      </dl>
                      <p role="status" className="rounded-md border border-forest/15 bg-white p-3 text-sm text-forest">Review only — nothing has been sent or recorded. The available preview API accepts a transcript, not these structured fields, so manual submission is unavailable.</p>
                      <p className="text-xs text-muted">The current transaction service rounds amounts to whole rupees even though the database stores two decimal places. The backend team must align this before manual financial writes are enabled.</p>
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
