'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, X, Users, Edit, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { DashboardAccessBoundary } from '@/components/auth/dashboard-access-boundary';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatInrAmount, readInrAmount } from '@/lib/inr';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  outstandingBalance: string;
  transactionCount: number;
};

type CustomerMutation = Pick<Customer, 'id' | 'name' | 'phone'>;

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

function normalizeMutationCustomer(value: unknown, expectedId?: string): CustomerMutation | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.trim()
    || (value.phone !== undefined && value.phone !== null && typeof value.phone !== 'string')) return null;
  return { id: value.id, name: value.name, phone: value.phone as string | null | undefined };
}

function panelErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return undefined;
  if (error.kind === 'timeout' || error.kind === 'network') return error.message;
  if (error.status === 429) return 'Too many requests. Please wait before retrying.';
  if (error.status && error.status >= 500) return 'HisabNaki is temporarily unavailable. Please try again later.';
}

function useCustomersPanel() {
  const { refreshMemberships } = useAuth();
  const [state, setState] = useState<{ status: 'loading' | 'success' | 'error'; data?: Customer[]; message?: string }>({ status: 'loading' });
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);

  const load = useCallback(async (force = false): Promise<boolean> => {
    if (!active.current || (request.current && !force)) return false;

    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ status: 'loading', data: previous.data }));

    try {
      const result = await apiClient.requestJson('/api/customers', { signal: controller.signal });
      if (!isRecord(result) || result.ok !== true || !Object.prototype.hasOwnProperty.call(result, 'data')) {
        throw new Error('Customers response envelope is invalid.');
      }
      const data = normalizeCustomers(result.data);
      if (data === null) throw new Error('Customers response data is invalid.');
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
  }, []);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { state, load, refresh };
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

function SearchInput({ value, onChange, onClear, placeholder, autoFocus = false }: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-11 w-full rounded-sm border border-forest/60 bg-white pl-10 pr-14 py-2 text-base text-forest placeholder:text-muted focus:border-forest focus:outline-2 focus:outline-offset-2 focus:outline-forest"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-9 px-2"
          onClick={onClear}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function CustomerCard({
  customer,
  duplicate,
  onEdit,
  onDelete,
  onViewLedger,
  disabled,
}: {
  customer: Customer;
  duplicate: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewLedger: () => void;
  disabled: boolean;
}) {
  const outstanding = formatInrAmount(customer.outstandingBalance);
  const isPositive = !customer.outstandingBalance.startsWith('-');

  return (
    <Link
      href={`/customers/${customer.id}`}
      className="block rounded-lg border border-forest/10 bg-white transition-colors hover:bg-beige-light/50 focus-visible:outline-2 focus-visible:outline-forest focus-visible:outline-offset-2"
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
        if (e.currentTarget === e.target) return;
        e.preventDefault();
      }}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-forest text-base leading-snug break-words">{customer.name}</p>
                {duplicate && <p className="mt-0.5 text-xs text-muted">Customer ID {customer.id}</p>}
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-purple/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                {customer.transactionCount} txn{customer.transactionCount !== 1 ? 's' : ''}
              </span>
            </div>

            <p className="text-sm text-muted break-words">{customer.phone || 'No phone saved'}</p>

            <div className="flex items-baseline gap-1.5">
              <span className={`font-bold text-forest [overflow-wrap:anywhere] ${outstanding.length > 14 ? 'text-[clamp(0.875rem,2.5vw,1.125rem)]' : 'text-lg'}`}>
                {outstanding}
              </span>
              <span className="text-xs text-muted">outstanding</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto min-w-[100px] justify-center gap-1.5"
              disabled={disabled}
              onClick={e => { e.preventDefault(); e.stopPropagation(); onViewLedger(); }}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              View ledger
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto min-w-[80px] justify-center gap-1.5"
              disabled={disabled}
              onClick={e => { e.preventDefault(); e.stopPropagation(); onEdit(); }}
            >
              <Edit className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto min-w-[80px] justify-center gap-1.5"
              disabled={disabled}
              onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CustomerForm({
  mode,
  customer,
  customers,
  nameInput,
  phoneInput,
  nameError,
  onNameChange,
  onPhoneChange,
  onSubmit,
  onCancel,
  disabled,
  saving,
  nameFieldRef,
}: {
  mode: 'create' | 'edit';
  customer: Customer | undefined;
  customers: Customer[];
  nameInput: string;
  phoneInput: string;
  nameError: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  disabled: boolean;
  saving: boolean;
  nameFieldRef: React.RefObject<HTMLInputElement | null>;
}) {
  useEffect(() => {
    nameFieldRef.current?.focus();
  }, [nameFieldRef]);

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-forest/15 bg-beige-light p-4 sm:p-5"
      onKeyDown={e => {
        if (e.key !== 'Escape' || disabled) return;
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }}
    >
      <div>
        <h3 className="font-semibold text-forest">{mode === 'create' ? 'Add customer' : 'Edit customer'}</h3>
        {mode === 'edit' && customer && (
          <p className="mt-1 text-xs text-muted">Editing {customer.name} · Customer ID {customer.id}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="customer-name-input" className="text-sm font-medium text-forest">
          Customer name <span aria-hidden="true">*</span>
        </label>
        <input
          ref={nameFieldRef}
          id="customer-name-input"
          name="name"
          required
          autoComplete="off"
          value={nameInput}
          onChange={e => onNameChange(e.target.value)}
          className="min-h-11 w-full rounded-sm border border-forest/60 bg-white px-3 py-2 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          disabled={disabled}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="customer-phone-input" className="text-sm font-medium text-forest">
          Phone number <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="customer-phone-input"
          name="phone"
          type="tel"
          autoComplete="off"
          value={phoneInput}
          onChange={e => onPhoneChange(e.target.value)}
          className="min-h-11 w-full rounded-sm border border-forest/60 bg-white px-3 py-2 text-base text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
          disabled={disabled}
        />
      </div>

      {nameError && <p role="alert" className="text-sm text-forest-dark">{nameError}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={disabled || saving} className="min-w-[140px]">
          {saving ? 'Saving…' : mode === 'create' ? 'Save customer' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={onCancel} className="min-w-[100px]">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeleteConfirmation({
  customer,
  onConfirm,
  onCancel,
  disabled,
  deleting,
}: {
  customer: Customer;
  onConfirm: () => void;
  onCancel: () => void;
  disabled: boolean;
  deleting: boolean;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  return (
    <section
      role="dialog"
      aria-labelledby="delete-customer-title"
      aria-describedby="delete-customer-identity delete-customer-warning"
      className="space-y-4 rounded-lg border border-forest/20 bg-beige-light p-4 sm:p-5 text-forest"
      onKeyDown={e => {
        if (e.key !== 'Escape' || disabled) return;
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }}
    >
      <div>
        <h3 id="delete-customer-title" className="font-semibold text-forest">Delete this customer?</h3>
        <p id="delete-customer-identity" className="mt-1 break-words text-sm">
          {customer.name}{customer.phone ? ` · ${customer.phone}` : ''}
          <span className="block text-xs text-muted">Customer ID {customer.id}</span>
        </p>
      </div>
      <p id="delete-customer-warning" className="text-sm text-muted">
        This removes the customer from the active list. Existing transaction history is retained,
        but the customer ledger may no longer be available. Check the balance before continuing.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant="destructive"
          disabled={disabled || deleting}
          onClick={onConfirm}
          className="min-w-[140px]"
        >
          {deleting ? 'Deleting…' : 'Delete customer'}
        </Button>
        <Button
          ref={cancelButtonRef}
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={onCancel}
          className="min-w-[100px]"
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted">
      <Users className="h-10 w-10 opacity-50 mb-3" />
      <p className="text-base font-medium text-forest">No customers yet</p>
      <p className="mt-1 text-sm text-muted">Add your first customer to get started</p>
    </div>
  );
}

function LoadingState() {
  return (
    <p role="status" className="flex min-h-28 items-center justify-center text-sm text-muted">
      Loading customers…
    </p>
  );
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="flex min-h-28 items-center justify-center">
      <PanelError panel="customers" retry={retry} />
    </div>
  );
}

function NoResultsState() {
  return (
    <p role="status" className="min-h-28 py-4 text-center text-sm text-muted">
      No customers match that name or phone number. Try a different name or number.
    </p>
  );
}

function MutationWarning({
  message,
  onRefresh,
  onAcknowledge,
  disabled,
}: {
  message: string;
  onRefresh: () => void;
  onAcknowledge: () => void;
  disabled: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="space-y-3 rounded-lg border border-forest/20 bg-beige-light p-4 text-sm text-forest focus-visible:outline-2 focus-visible:outline-forest"
      role="group"
      aria-labelledby="customer-mutation-warning"
    >
      <p id="customer-mutation-warning">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onRefresh}>
          Refresh customer list
        </Button>
        <Button type="button" variant="outline" onClick={onAcknowledge}>
          I understand; allow changes
        </Button>
      </div>
      <p className="text-xs text-muted">
        Acknowledging does not confirm whether the change completed. It only unlocks actions;
        do not repeat the original request until you have checked the customer details.
      </p>
    </div>
  );
}

function NoticeBanner({ message, error, onDismiss }: {
  message: string;
  error: boolean;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="rounded-lg border p-3 text-sm text-forest" role={error ? 'alert' : 'status'}>
      <div className={`flex items-start gap-2 ${error ? 'border-forest/15 bg-beige-light' : 'border-forest/10 bg-white'}`}>
        <span className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium">
          {error ? '!' : '✓'}
        </span>
        <p className="flex-1">{message}</p>
        {onDismiss && (
          <Button type="button" variant="ghost" size="sm" className="shrink-0 p-1" onClick={onDismiss} aria-label="Dismiss">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { selectedBusiness, financialOperationStatus, setFinancialOperationStatus } = useAuth();
  const router = useRouter();
  const { state: customerState, load: loadCustomers, refresh: refreshCustomers } = useCustomersPanel();
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerEditor, setCustomerEditor] = useState<{ mode: 'create' } | { mode: 'edit'; customerId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [customerFormError, setCustomerFormError] = useState('');
  const [customerNotice, setCustomerNotice] = useState('');
  const [customerNoticeError, setCustomerNoticeError] = useState(false);
  const [mutationUncertain, setMutationUncertain] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const mutationLock = useRef(false);
  const addCustomerTrigger = useRef<HTMLButtonElement>(null);
  const customerActionTrigger = useRef<HTMLButtonElement | null>(null);
  const customerNameField = useRef<HTMLInputElement | null>(null);
  const customers = customerState.data ?? [];

  const { filteredCustomers, customerNameCounts } = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    const phoneQuery = /^[+\d\s().-]+$/.test(query) ? query.replace(/\D/g, '') : '';
    const customerNameCounts = new Map<string, number>();
    const filteredCustomers = customers.filter(customer => {
      const name = customer.name.trim().toLowerCase();
      customerNameCounts.set(name, (customerNameCounts.get(name) ?? 0) + 1);
      return name.includes(query) || customer.phone?.toLowerCase().includes(query)
        || (phoneQuery && customer.phone?.replace(/\D/g, '').includes(phoneQuery));
    });
    return { filteredCustomers, customerNameCounts };
  }, [customerSearch, customers]);

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
    if (mutationUncertain) {
      // Focus is handled by MutationWarning component
    }
  }, [mutationUncertain]);

  const acknowledgeUncertainMutation = () => {
    setMutationUncertain(false);
    setMutationPending(false);
    mutationLock.current = false;
    setFinancialOperationStatus('idle');
    setCustomerFormError('');
    setCustomerNotice('The previous request was not repeated. Check the current customer details before making the same change again.');
    setCustomerNoticeError(false);
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
      void refreshCustomers();
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
        setCustomerEditor(null);
        setCustomerFormError('');
        restoreCustomerActionFocus();
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
      setCustomerEditor(null);
      setCustomerFormError('');
      restoreCustomerActionFocus();
      setCustomerNotice('Customer request completed. The customer list has been refreshed.');
    }
  };

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

  const deleteCustomer = async () => {
    if (!deleteTarget || mutationUncertain || mutationLock.current) return;
    const target = deleteTarget;
    const outcome = await runCustomerMutation(`/api/customers/${encodeURIComponent(target.id)}`, { method: 'DELETE' }, target.id);
    if (outcome === 'success') {
      setDeleteTarget(null);
      setCustomerNotice(`${target.name} was deleted.`);
      window.requestAnimationFrame(() => addCustomerTrigger.current?.focus());
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

  const updateSearch = (value: string) => {
    setCustomerSearch(value);
  };

  const clearSearch = () => {
    updateSearch('');
  };

  const isMutating = mutationPending || mutationUncertain || financialOperationStatus !== 'idle';

  return (
    <DashboardAccessBoundary>
      <div className="mx-auto w-full max-w-[1200px] min-w-0 space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
        {/* Page Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between min-w-0 break-words">
          <div>
            <h1 className="text-3xl font-bold text-forest tracking-tight">Customers</h1>
            <p className="mt-1 text-sm text-muted">Manage customers for {selectedBusiness?.businessName}</p>
          </div>
          <Button
            ref={addCustomerTrigger}
            type="button"
            size="sm"
            className="shrink-0 w-full sm:w-auto min-h-11"
            disabled={isMutating}
            onClick={openCreateCustomer}
          >
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Add customer
          </Button>
        </header>

        {/* Customer Overview Section */}
        <ScrollReveal className="min-w-0 rounded-[14px] border border-forest/10 bg-white shadow-card">
          <div className="p-4 sm:p-5">
            {/* Section Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-lg font-semibold text-forest">All customers</h2>
              <Button
                ref={addCustomerTrigger}
                type="button"
                size="sm"
                className="shrink-0 w-full sm:w-auto min-h-11"
                disabled={isMutating}
                onClick={openCreateCustomer}
              >
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Add customer
              </Button>
            </div>

            {/* Search */}
            <SearchInput
              value={customerSearch}
              onChange={updateSearch}
              onClear={clearSearch}
              placeholder="Search by customer name or phone"
              autoFocus={!customers.length && !customerEditor && !deleteTarget}
            />

            {/* Content */}
            <div className="mt-4 space-y-3">
              <NoticeBanner message={customerNotice} error={customerNoticeError} onDismiss={() => setCustomerNotice('')} />

              {mutationUncertain && (
                <MutationWarning
                  message={customerNotice}
                  onRefresh={() => void loadCustomers()}
                  onAcknowledge={acknowledgeUncertainMutation}
                  disabled={mutationPending}
                />
              )}

              {customerEditor && (
                <CustomerForm
                  mode={customerEditor.mode}
                  customer={customerEditor.mode === 'edit' ? customers.find(c => c.id === customerEditor.customerId) : undefined}
                  customers={customers}
                  nameInput={customerNameInput}
                  phoneInput={customerPhoneInput}
                  nameError={customerFormError}
                  onNameChange={setCustomerNameInput}
                  onPhoneChange={setCustomerPhoneInput}
                  onSubmit={saveCustomer}
                  onCancel={() => closeCustomerForm()}
                  disabled={isMutating}
                  saving={mutationPending}
                  nameFieldRef={customerNameField}
                />
              )}

              {deleteTarget && (
                <DeleteConfirmation
                  customer={deleteTarget}
                  onConfirm={deleteCustomer}
                  onCancel={() => { setDeleteTarget(null); restoreCustomerActionFocus(); }}
                  disabled={isMutating}
                  deleting={mutationPending}
                />
              )}

              {customerState.status === 'loading' && !customers.length && <LoadingState />}
              {customerState.status === 'error' && !customers.length && <ErrorState retry={loadCustomers} />}

              {customers.length > 0 && filteredCustomers.length > 0 && (
                filteredCustomers.map(customer => {
                  const duplicate = (customerNameCounts.get(customer.name.trim().toLowerCase()) ?? 0) > 1;
                  return (
                    <CustomerCard
                      key={customer.id}
                      customer={customer}
                      duplicate={duplicate}
                      onEdit={() => openEditCustomer(customer, customerActionTrigger.current!)}
                      onDelete={() => openDeleteConfirmation(customer, customerActionTrigger.current!)}
                      onViewLedger={() => {}}
                      disabled={isMutating}
                    />
                  );
                })
              )}

              {customers.length > 0 && filteredCustomers.length === 0 && <NoResultsState />}
              {customers.length === 0 && customerState.status === 'success' && <EmptyState />}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </DashboardAccessBoundary>
  );
}