'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Filter, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { DashboardAccessBoundary } from '@/components/auth/dashboard-access-boundary';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatInrAmount, readInrAmount } from '@/lib/inr';
import { type NormalizedTransaction } from '@/lib/transaction-contract';
import {
  buildTransactionHistoryPath,
  normalizeTransactionHistory,
  updateTransactionHistoryFilters,
  changeTransactionHistoryPage,
  type TransactionHistoryResponse,
  type TransactionHistoryFilterState,
} from '@/lib/transaction-contract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type Transaction = NormalizedTransaction;
type CustomerOption = { id: string; name: string };

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

function normalizeCustomerOptions(value: unknown): CustomerOption[] | null {
  if (!Array.isArray(value)) return null;
  const customers: CustomerOption[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.name !== 'string' || !item.name.trim()) return null;
    customers.push({ id: item.id, name: item.name });
  }
  return customers;
}

function useTransactionHistoryPanel(path: string) {
  const [state, setState] = useState<PanelState<TransactionHistoryResponse>>({ status: 'loading' });
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);

  const load = useCallback(async (force = false): Promise<boolean> => {
    if (!active.current || (request.current && !force)) return false;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ status: 'loading', data: previous.data }));

    try {
      const result = await apiClient.requestJson(path, { signal: controller.signal });
      if (!isRecord(result) || result.ok !== true || !Object.prototype.hasOwnProperty.call(result, 'data')) {
        throw new Error('Transaction history response envelope is invalid.');
      }
      const data = normalizeTransactionHistory(result.data);
      if (data === null) throw new Error('Transaction history response data is invalid.');
      if (request.current === controller) {
        setState({ status: 'success', data });
        return true;
      }
      return false;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (request.current === controller) {
        setState(previous => ({ status: 'error', data: previous.data, message: panelErrorMessage(error) }));
      }
      return false;
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [path]);

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

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function TransactionTypeBadge({ type, status }: { type: Transaction['type']; status: Transaction['status'] }) {
  if (status === 'VOIDED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-beige-light px-2.5 py-0.5 text-xs font-medium text-muted">
        Voided {type === 'PAYMENT' ? 'repayment' : type.toLowerCase()}
      </span>
    );
  }
  const variant = type === 'PAYMENT' ? 'bg-purple/10 text-purple' : type === 'CREDIT' ? 'bg-beige text-forest' : type === 'SALE' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700';
  const label = type === 'PAYMENT' ? 'Repayment' : type === 'CREDIT' ? 'Credit' : type === 'SALE' ? 'Sale' : 'Expense';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variant}`}>
      {label}
    </span>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const isVoided = transaction.status === 'VOIDED';
  const amountColor = isVoided ? 'text-muted line-through decoration-muted' : 'text-forest';

  return (
    <li
      key={transaction.id}
      className="group flex min-w-0 flex-col items-stretch gap-3 rounded-[12px] border border-forest/5 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center"
      style={{ cursor: 'default' }}
    >
      <div className="min-w-0 flex-1 break-words">
        <p className="text-sm font-semibold leading-5 text-forest">{transaction.customer?.name || 'General'}</p>
        <p className="mt-1 text-xs leading-5 text-muted [overflow-wrap:anywhere]">
          {transaction.description || 'Transaction'} • {formatDate(transaction.createdAt)}
        </p>
      </div>
      <div className="flex min-w-0 max-w-full flex-col items-stretch justify-between gap-2 sm:max-w-[45%] sm:shrink-0 sm:flex-row sm:items-end sm:text-right">
        <div className="flex items-center justify-between gap-3">
          <p className={`text-base font-bold [overflow-wrap:anywhere] sm:text-lg ${amountColor}`}>
            {formatInrAmount(transaction.amount)}
          </p>
          <TransactionTypeBadge type={transaction.type} status={transaction.status} />
        </div>
        <div className="flex items-center justify-end gap-2 text-xs text-muted">
          <span>ID: {transaction.id.slice(0, 8)}…</span>
        </div>
      </div>
    </li>
  );
}

function PanelError({ panel, retry, message, retained }: { panel: string; retry: () => void; message?: string; retained?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center text-sm py-10">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 text-forest">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p role="status" className="text-forest">
        Couldn&apos;t load {panel}.{message && ` ${message}`}{retained && ' Showing last loaded information.'}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={retry} className="min-h-10">
        Retry
      </Button>
    </div>
  );
}

function EmptyState({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-forest/10 text-forest">
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </div>
      <div>
        <p className="text-base font-medium text-forest">No transactions found</p>
        {hasActiveFilters ? (
          <p className="mt-1 text-sm text-muted">Try changing or resetting the filters.</p>
        ) : (
          <p className="mt-1 text-sm text-muted">Transactions will appear here once recorded.</p>
        )}
      </div>
      {hasActiveFilters && (
        <Button type="button" variant="outline" size="sm" onClick={onClearFilters} className="min-h-10">
          <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Clear filters
        </Button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <ul className="space-y-3" role="list" aria-label="Loading transactions">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex min-w-0 flex-col items-stretch gap-3 rounded-[12px] border border-forest/5 bg-white p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-forest/5" />
            <div className="h-3 w-64 animate-pulse rounded bg-forest/5" />
          </div>
<div className="flex min-w-0 max-w-full flex-col items-stretch justify-between gap-2 sm:w-[45%] sm:max-w-[45%] sm:shrink-0 sm:flex-row sm:items-end sm:text-right">
            <div className="flex items-center justify-between gap-3">
              <div className="h-6 w-32 animate-pulse rounded bg-forest/5" />
              <div className="h-5 w-20 animate-pulse rounded bg-forest/5" />
            </div>
            <div className="h-3 w-20 animate-pulse rounded bg-forest/5 self-end" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function FilterSection({
  showFilters,
  setShowFilters,
  hasActiveFilters,
  filters,
  customers,
  customerLoadError,
  customerRetryCount,
  setCustomerRetryCount,
  handleFilterChange,
  handleResetFilters,
}: {
  showFilters: boolean;
  setShowFilters: (value: boolean) => void;
  hasActiveFilters: boolean;
  filters: TransactionHistoryFilterState;
  customers: CustomerOption[];
  customerLoadError: string | undefined;
  customerRetryCount: number;
  setCustomerRetryCount: (value: React.SetStateAction<number>) => void;
  handleFilterChange: (update: Partial<Omit<TransactionHistoryFilterState, 'page'>>) => void;
  handleResetFilters: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-purple/10">
            <Filter className="h-5 w-5 text-purple" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-forest">Filters</h2>
            <p className="text-xs text-muted">Narrow down your transaction history</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls={showFilters ? 'transaction-filters' : undefined}
            className="gap-1.5 min-h-10"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            {showFilters ? 'Hide' : 'Show'} filters
          </Button>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" onClick={handleResetFilters} className="gap-1.5 min-h-10">
              <X className="h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <div id="transaction-filters" className="min-w-0 rounded-[12px] border border-forest/10 bg-beige-light p-4 sm:p-5" role="group" aria-label="Transaction filters">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="history-type" className="text-xs font-medium text-forest">Transaction type</label>
              <select
                id="history-type"
                value={filters.type}
                onChange={e => handleFilterChange({ type: e.target.value })}
                className="min-h-11 w-full min-w-0 rounded-[8px] border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              >
                <option value="">All types</option>
                <option value="CREDIT">Credit</option>
                <option value="PAYMENT">Payment</option>
                <option value="SALE">Sale</option>
                <option value="EXPENSE">Expense</option>
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="history-customer" className="text-xs font-medium text-forest">Customer</label>
              <select
                id="history-customer"
                value={filters.customerId}
                onChange={e => handleFilterChange({ customerId: e.target.value })}
                className="min-h-11 w-full min-w-0 max-w-full rounded-[8px] border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              >
                <option value="">All customers</option>
                {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="history-from" className="text-xs font-medium text-forest">From date</label>
              <input
                id="history-from"
                type="date"
                max={filters.to || undefined}
                value={filters.from}
                onChange={e => handleFilterChange({ from: e.target.value })}
                className="min-h-11 w-full min-w-0 rounded-[8px] border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="history-to" className="text-xs font-medium text-forest">To date</label>
              <input
                id="history-to"
                type="date"
                min={filters.from || undefined}
                value={filters.to}
                onChange={e => handleFilterChange({ to: e.target.value })}
                className="min-h-11 w-full min-w-0 rounded-[8px] border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              />
            </div>
          </div>
          {customerLoadError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              <p>Couldn&apos;t load customer options. {customerLoadError}</p>
              <Button type="button" variant="link" size="sm" className="px-0 underline" onClick={() => setCustomerRetryCount(current => current + 1)}>
                Retry
              </Button>
            </div>
          )}
          {hasActiveFilters && (
            <p className="text-xs text-muted">Filters applied. Results update automatically.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Pagination({
  history,
  filters,
  handlePageChange,
  state,
}: {
  history: TransactionHistoryResponse | null;
  filters: TransactionHistoryFilterState;
  handlePageChange: (page: number) => void;
  state: PanelState<TransactionHistoryResponse>;
}) {
  if (!history || !history.totalPages || history.totalPages <= 1) return null;

  return (
    <nav aria-label="Transaction history pages" className="flex flex-wrap items-center justify-center gap-2 border-t border-forest/10 pt-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={state.status !== 'success' || filters.page <= 1}
        onClick={() => handlePageChange(filters.page - 1)}
        className="min-h-10 gap-1.5"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Previous
      </Button>
      <span className="flex min-h-10 items-center px-3 text-sm text-muted" role="status">
        Page {filters.page} of {history.totalPages}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={state.status !== 'success' || filters.page >= history.totalPages}
        onClick={() => handlePageChange(filters.page + 1)}
        className="min-h-10 gap-1.5"
      >
        Next
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}

function TransactionHistoryPage() {
  const { selectedBusiness } = useAuth();
  const [filters, setFilters] = useState<TransactionHistoryFilterState>({ page: 1, type: '', customerId: '', from: '', to: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerLoadError, setCustomerLoadError] = useState<string | undefined>();
  const [customerRetryCount, setCustomerRetryCount] = useState(0);

  const path = useMemo(() => buildTransactionHistoryPath({
    page: filters.page,
    limit: 20,
    type: filters.type || undefined,
    customerId: filters.customerId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }), [filters]);

  const { state, load } = useTransactionHistoryPanel(path);
  const history = state.data;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const loadCustomers = async () => {
      try {
        const result = await apiClient.requestJson('/api/customers', { signal: controller.signal });
        if (!isRecord(result) || result.ok !== true || !Object.prototype.hasOwnProperty.call(result, 'data')) {
          throw new Error('Customer response envelope is invalid.');
        }
        const data = normalizeCustomerOptions(result.data);
        if (data === null) throw new Error('Customer response data is invalid.');
        if (active) {
          setCustomers(data);
          setCustomerLoadError(undefined);
        }
      } catch (error) {
        if (controller.signal.aborted || !active) return;
        setCustomerLoadError(panelErrorMessage(error) ?? (error instanceof Error ? error.message : 'The customer options response was invalid.'));
      }
    };

    void loadCustomers();
    return () => {
      active = false;
      controller.abort();
    };
  }, [customerRetryCount, selectedBusiness?.businessId]);

  const handleFilterChange = useCallback((update: Partial<Omit<TransactionHistoryFilterState, 'page'>>) => {
    setFilters(current => updateTransactionHistoryFilters(current, update));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    if (!history) return;
    setFilters(current => changeTransactionHistoryPage(current, page, history.totalPages!));
  }, [history]);

  const handleResetFilters = useCallback(() => {
    setFilters({ page: 1, type: '', customerId: '', from: '', to: '' });
  }, []);

  const hasActiveFilters = Boolean(filters.type || filters.customerId || filters.from || filters.to);

  return (
    <DashboardAccessBoundary>
      <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
        <header className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 max-w-full shrink-0 items-center gap-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to dashboard
            </Link>
            <div className="flex min-w-0 flex-col items-start gap-1">
              <h1 className="min-w-0 break-words text-[clamp(1.5rem,4vw,2rem)] font-bold leading-tight tracking-tight text-forest">Transaction history</h1>
              <p className="text-sm leading-6 text-muted">Review and manage all your business transactions.</p>
            </div>
          </div>
          {history && history.total !== undefined && (
            <div className="flex min-h-10 items-center gap-2 rounded-full bg-forest/5 px-3 text-sm font-medium text-forest sm:ml-auto">
              <span className="text-base font-bold">{history.total}</span>
              <span className="text-muted">transactions</span>
            </div>
          )}
        </header>

        <ScrollReveal className="min-w-0 rounded-[14px] border border-forest/10 bg-white shadow-card">
          <div className="px-4 py-4 sm:px-5 sm:py-4 border-b border-forest/10">
            <FilterSection
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              hasActiveFilters={hasActiveFilters}
              filters={filters}
              customers={customers}
              customerLoadError={customerLoadError}
              customerRetryCount={customerRetryCount}
              setCustomerRetryCount={setCustomerRetryCount}
              handleFilterChange={handleFilterChange}
              handleResetFilters={handleResetFilters}
            />
          </div>
          <div className="px-4 py-4 sm:px-5 sm:py-5">
            {state.status === 'loading' && !history && (
              <LoadingState />
            )}

            {state.status === 'error' && !history && (
              <PanelError panel="transaction history" retry={load} message={state.message} />
            )}

            {history && (
              <>
                <div className="mb-4 flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span>Showing <span className="font-medium text-forest">{history.transactions.length}</span> of <span className="font-medium text-forest">{history.total ?? 'unknown'}</span> transactions</span>
                    {history.totalPages && history.totalPages > 1 && (
                      <span className="px-2 rounded-full bg-forest/10 text-forest">Page {filters.page} of {history.totalPages}</span>
                    )}
                  </div>
                </div>

                {history.transactions.length > 0 ? (
                  <ul className="space-y-3" role="list">
                    {history.transactions.map(transaction => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState hasActiveFilters={hasActiveFilters} onClearFilters={handleResetFilters} />
                )}

                <Pagination history={history} filters={filters} handlePageChange={handlePageChange} state={state} />
              </>
            )}
          </div>
        </ScrollReveal>
      </div>
    </DashboardAccessBoundary>
  );
}

export default TransactionHistoryPage;