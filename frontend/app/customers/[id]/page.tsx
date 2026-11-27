'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Users, CreditCard, TrendingUp, List, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { DashboardAccessBoundary } from '@/components/auth/dashboard-access-boundary';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatInrAmount, readInrAmount } from '@/lib/inr';
import { normalizeTransactionList, type NormalizedTransaction } from '@/lib/transaction-contract';
import { buildTransactionHistoryPath } from '@/lib/transaction-contract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type Transaction = NormalizedTransaction;

type CustomerLedger = {
  id: string;
  name: string;
  phone?: string | null;
  outstandingBalance: string;
  transactions: Transaction[];
};

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

function useDashboardPanel<T>(path: string, normalize: (data: unknown) => T | null, handleNotFound = false) {
  const [state, setState] = useState<PanelState<T>>({ status: 'loading' });
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

function PanelError({ panel, retry, message }: { panel: string; retry: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center text-sm text-muted py-8">
      <p role="status">Couldn't load {panel}.{message && ` ${message}`}</p>
      <Button type="button" variant="link" size="sm" onClick={retry} className="underline">
        Retry
      </Button>
    </div>
  );
}

function TransactionRows({ transactions, customerLedger = false }: {
  transactions: Transaction[];
  customerLedger?: boolean;
}) {
  const formatDate = (value: string) =>
    new Date(value).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

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
      ))}
    </ul>
  );
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
        <Button type="button" variant="link" size="sm" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>Close</Button>
      </div>
      {children}
    </section>
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

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { selectedBusiness } = useAuth();
  const customerId = params.id as string;
  const { state, load } = useDashboardPanel<CustomerLedger>(`/api/customers/${encodeURIComponent(customerId)}`, normalizeCustomerLedger, true);
  const ledger = state.status === 'success' && state.data.id === customerId ? state.data : null;

  const backHref = '/customers';
  const transactionsHref = useMemo(() => buildTransactionHistoryPath({
    page: 1,
    limit: 20,
    customerId: customerId,
  }), [customerId]);

  return (
    <DashboardAccessBoundary>
      <div className="space-y-6 sm:space-y-8">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-forest underline underline-offset-4 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
            aria-label="Back to customers"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to customers
          </Link>
          <h1 className="text-2xl font-bold text-forest tracking-tight">{ledger?.name || 'Customer'}</h1>
        </div>

        <ScrollReveal className="grid gap-4 min-[375px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <Card>
            <CardHeader className="items-center justify-between space-y-0 px-2 pb-2 text-center sm:px-4">
              <h3 className="flex min-h-10 items-center text-sm font-medium tracking-tight text-muted">Outstanding balance</h3>
              <div className="h-9 w-9 rounded-md flex items-center justify-center text-forest bg-beige"><CreditCard className="h-5 w-5" /></div>
            </CardHeader>
            <CardContent className="px-1 text-center">
              {state.status === 'loading' ? (
                <div aria-hidden="true" className="flex h-8 items-center justify-center">
                  <span className="h-4 w-16 max-w-[80%] rounded-full bg-forest/10" />
                </div>
              ) : ledger ? (
                <p className="font-bold leading-8 text-forest [overflow-wrap:anywhere] text-2xl min-[375px]:max-sm:text-[clamp(1rem,4vw,1.25rem)]">
                  {formatInrAmount(ledger.outstandingBalance)}
                </p>
              ) : (
                <p className="font-bold leading-8 text-forest">—</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="items-center justify-between space-y-0 px-2 pb-2 text-center sm:px-4">
              <h3 className="flex min-h-10 items-center text-sm font-medium tracking-tight text-muted">Total transactions</h3>
              <div className="h-9 w-9 rounded-md flex items-center justify-center text-purple bg-purple/5"><TrendingUp className="h-5 w-5" /></div>
            </CardHeader>
            <CardContent className="px-1 text-center">
              {state.status === 'loading' ? (
                <div aria-hidden="true" className="flex h-8 items-center justify-center">
                  <span className="h-4 w-16 max-w-[80%] rounded-full bg-forest/10" />
                </div>
              ) : ledger ? (
                <p className="font-bold leading-8 text-forest [overflow-wrap:anywhere] text-2xl min-[375px]:max-sm:text-[clamp(1rem,4vw,1.25rem)]">
                  {ledger.transactions.length}
                </p>
              ) : (
                <p className="font-bold leading-8 text-forest">—</p>
              )}
            </CardContent>
          </Card>
        </ScrollReveal>

        <ScrollReveal delay={0.05} className="rounded-xl border border-forest/10 bg-white p-4 sm:p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple/10 flex items-center justify-center">
                <List className="h-5 w-5 text-purple" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-forest">Quick actions</h3>
                <p className="text-xs text-muted">Navigate to detailed views</p>
              </div>
            </div>
            <Link
              href={transactionsHref}
              className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg border border-forest/20 bg-white text-sm font-medium text-forest hover:bg-beige-light hover:border-forest/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest transition-colors"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              View all transactions
            </Link>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1} className="rounded-lg border border-forest/10 bg-white p-5 shadow-soft">
          <CardHeader className="px-0 pt-0">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <CardTitle tabIndex={-1} className="text-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest">Transaction history</CardTitle>
              <Link
                href={transactionsHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-forest underline underline-offset-2 hover:text-forest-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                aria-label="View all transactions for this customer"
              >
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {state.status === 'loading' ? (
              <p role="status" className="flex min-h-28 items-center justify-center text-sm text-muted">Loading transaction history…</p>
            ) : state.status === 'not-found' ? (
              <p role="status" className="flex min-h-28 items-center justify-center text-sm text-muted">This customer could not be found.</p>
            ) : state.status === 'error' ? (
              <PanelError panel="customer ledger" retry={load} message={state.message} />
            ) : ledger ? (
              <>
                <div className="space-y-1 [overflow-wrap:anywhere] mb-4">
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
                ) : (
                  <p role="status" className="text-sm text-muted">No transactions for this customer.</p>
                )}
              </>
            ) : null}
          </CardContent>
        </ScrollReveal>
      </div>
    </DashboardAccessBoundary>
  );
}