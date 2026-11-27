'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Filter, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { DashboardAccessBoundary } from '@/components/auth/dashboard-access-boundary';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatInrAmount, readInrAmount } from '@/lib/inr';
import { normalizeTransactionList, type NormalizedTransaction } from '@/lib/transaction-contract';
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
      className="flex flex-col items-stretch justify-between gap-2 rounded-lg border border-forest/10 p-3 sm:flex-row sm:items-center"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="min-w-0 break-words">
        <p className="text-sm font-semibold text-forest">{transaction.customer?.name || 'General'}</p>
        <p className="text-xs text-muted">
          {transaction.description || 'Transaction'} • {formatDate(transaction.createdAt)}
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
      </div>
    </li>
  );
}

function TransactionHistoryPage() {
  const { selectedBusiness } = useAuth();
  const router = useRouter();
  const [filters, setFilters] = useState<TransactionHistoryFilterState>({ page: 1, type: '', customerId: '', from: '', to: '' });
  const [showFilters, setShowFilters] = useState(false);

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
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold text-forest tracking-tight">Transaction History</h1>
        </div>

        <ScrollReveal className="rounded-xl border border-forest/10 bg-white p-4 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-forest" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-forest">Filters</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={showFilters ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1"
              >
                <Filter className="h-4 w-4" aria-hidden="true" />
                {showFilters ? 'Hide' : 'Show'} filters
              </Button>
              {hasActiveFilters && (
                <Button type="button" variant="outline" size="sm" onClick={handleResetFilters} className="gap-1">
                  Reset
                </Button>
              )}
            </div>
          </div>

          {showFilters && (
            <div className="space-y-3 rounded-lg border border-forest/10 bg-beige-light p-4 mb-4" role="group" aria-label="Transaction filters">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label htmlFor="history-type" className="text-xs font-medium text-forest">Transaction type</label>
                  <select
                    id="history-type"
                    value={filters.type}
                    onChange={e => handleFilterChange({ type: e.target.value })}
                    className="min-h-11 w-full rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  >
                    <option value="">All types</option>
                    <option value="CREDIT">Credit</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="SALE">Sale</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="history-customer" className="text-xs font-medium text-forest">Customer</label>
                  <select
                    id="history-customer"
                    value={filters.customerId}
                    onChange={e => handleFilterChange({ customerId: e.target.value })}
                    className="min-h-11 w-full min-w-0 rounded-sm border border-forest/60 bg-white px-3 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                  >
                    <option value="">All customers</option>
                  </select>
                </div>
                <div className="space-y-1">
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
                <div className="space-y-1">
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
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 text-sm text-muted">
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