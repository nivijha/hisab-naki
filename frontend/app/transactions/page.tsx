'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

function PanelError({ panel, retry, message, retained }: { panel: string; retry: () => void; message?: string; retained?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center text-sm text-muted py-8">
      <p role="status">Couldn't load {panel}.{message && ` ${message}`}{retained && ' Showing last loaded information.'}</p>
      <Button type="button" variant="link" size="sm" onClick={retry} className="underline">
        Retry
      </Button>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function TransactionRow({ transaction, onClick }: { transaction: Transaction; onClick?: () => void }) {
  return (
    <li
      key={transaction.id}
      className="flex min-w-0 flex-col items-stretch justify-between gap-3 rounded-[10px] border border-forest/10 p-3 sm:flex-row sm:items-center"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="min-w-0 flex-1 break-words">
        <p className="text-sm font-semibold leading-5 text-forest">{transaction.customer?.name || 'General'}</p>
        <p className="mt-1 text-xs leading-5 text-muted [overflow-wrap:anywhere]">
          {transaction.description || 'Transaction'} • {formatDate(transaction.createdAt)}
        </p>
      </div>
      <div className="min-w-0 max-w-full text-left sm:max-w-[45%] sm:shrink-0 sm:text-right">
        <p className={`text-xs font-bold [overflow-wrap:anywhere] sm:text-sm ${transaction.status === 'VOIDED' ? 'text-muted line-through decoration-muted' : 'text-forest'}`}>
          {formatInrAmount(transaction.amount)}
        </p>
        <p className={`mt-1 inline-block max-w-full rounded-full px-2 py-0.5 text-xs font-medium ${
          transaction.status === 'VOIDED' ? 'bg-beige-light text-muted' : transaction.type === 'PAYMENT' ? 'bg-purple/10 text-forest' : transaction.type === 'CREDIT' ? 'bg-beige text-forest' : 'text-muted'
        }`}>
          {transaction.status === 'VOIDED' ? `Voided ${transaction.type === 'PAYMENT' ? 'repayment' : transaction.type.toLowerCase()}` : transaction.type === 'PAYMENT' ? 'Repayment' : transaction.type === 'CREDIT' ? 'Credit' : transaction.type}
        </p>
      </div>
    </li>
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

  const hasActiveFilters = filters.type || filters.customerId || filters.from || filters.to;

  return (
    <DashboardAccessBoundary>
      <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-5 px-4 py-6 sm:space-y-7 sm:px-6 sm:py-8">
        <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 max-w-full shrink-0 items-center gap-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to dashboard
          </Link>
          <h1 className="min-w-0 break-words text-[clamp(1.5rem,4vw,2rem)] font-bold leading-tight tracking-tight text-forest">Transaction history</h1>
        </div>

        <ScrollReveal className="min-w-0 rounded-[14px] border border-forest/10 bg-white p-4 shadow-card sm:p-5">
          <div className="mb-4 flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-2">
              <Filter className="h-5 w-5 text-forest" aria-hidden="true" />
              <h2 className="text-base font-semibold text-forest">Filters</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={showFilters ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                aria-expanded={showFilters}
                aria-controls={showFilters ? 'transaction-filters' : undefined}
                className="gap-1"
              >
                <Filter className="h-4 w-4" aria-hidden="true" />
                {showFilters ? 'Hide' : 'Show'} filters
              </Button>
              {hasActiveFilters && (
                <Button type="button" variant="outline" size="sm" onClick={handleResetFilters} className="gap-1">
                  Reset filters
                </Button>
              )}
            </div>
          </div>

          {showFilters && (
            <div id="transaction-filters" className="mb-4 min-w-0 space-y-3 rounded-[10px] border border-forest/10 bg-beige-light p-3 sm:p-4" role="group" aria-label="Transaction filters">
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0 space-y-1">
                  <label htmlFor="history-type" className="text-xs font-medium text-forest">Transaction type</label>
                  <select
                    id="history-type"
                    value={filters.type}
                    onChange={e => handleFilterChange({ type: e.target.value })}
                    className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  >
                    <option value="">All types</option>
                    <option value="CREDIT">Credit</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="SALE">Sale</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
                <div className="min-w-0 space-y-1">
                  <label htmlFor="history-customer" className="text-xs font-medium text-forest">Customer</label>
                  <select
                    id="history-customer"
                    value={filters.customerId}
                    onChange={e => handleFilterChange({ customerId: e.target.value })}
                    className="min-h-11 w-full min-w-0 max-w-full rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  >
                    <option value="">All customers</option>
                    {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </div>
                <div className="min-w-0 space-y-1">
                  <label htmlFor="history-from" className="text-xs font-medium text-forest">From date</label>
                  <input
                    id="history-from"
                    type="date"
                    max={filters.to || undefined}
                    value={filters.from}
                    onChange={e => handleFilterChange({ from: e.target.value })}
                    className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <label htmlFor="history-to" className="text-xs font-medium text-forest">To date</label>
                  <input
                    id="history-to"
                    type="date"
                    min={filters.from || undefined}
                    value={filters.to}
                    onChange={e => handleFilterChange({ to: e.target.value })}
                    className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  />
                </div>
              </div>
              {customerLoadError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-muted">
                  <p>Couldn't load customer options. {customerLoadError}</p>
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

          {state.status === 'loading' && !history && (
            <p role="status" className="flex min-h-32 items-center justify-center text-sm text-muted">Loading transaction history…</p>
          )}

          {state.status === 'error' && !history && (
            <PanelError panel="transaction history" retry={load} message={state.message} />
          )}

          {history && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Showing {history.transactions.length} of {history.total ?? 'unknown'} transactions</span>
                  {history.totalPages && history.totalPages > 1 && (
                    <span>Page {filters.page} of {history.totalPages}</span>
                  )}
                </div>
              </div>

              {history.transactions.length > 0 ? (
                <ul className="space-y-2" role="list">
                  {history.transactions.map(transaction => (
                    <TransactionRow key={transaction.id} transaction={transaction} />
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted">
                  <p className="text-sm">No transactions found</p>
                  {hasActiveFilters && <p className="mt-1 text-xs">Try changing or resetting the filters.</p>}
                </div>
              )}

              {history.totalPages && history.totalPages > 1 && (
                <nav aria-label="Transaction history pages" className="flex flex-wrap items-center justify-center gap-2 border-t border-forest/10 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={state.status !== 'success' || filters.page <= 1}
                    onClick={() => handlePageChange(filters.page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                    Previous
                  </Button>
                  <span className="px-3 text-sm text-muted" role="status">
                    Page {filters.page} of {history.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={state.status !== 'success' || filters.page >= history.totalPages}
                    onClick={() => handlePageChange(filters.page + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </>
          )}
        </ScrollReveal>
      </div>
    </DashboardAccessBoundary>
  );
}

export default TransactionHistoryPage;