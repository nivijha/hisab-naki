'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollReveal } from '@/components/ui/scroll-reveal';
import { DashboardAccessBoundary } from '@/components/auth/dashboard-access-boundary';
import { useAuth } from '@/components/auth/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatInrAmount, readInrAmount } from '@/lib/inr';
import { normalizeTransactionList, type NormalizedTransaction } from '@/lib/transaction-contract';

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
  const customerNameField = useRef<HTMLInputElement>(null);
  const deleteCancelButton = useRef<HTMLButtonElement>(null);
  const uncertainPanel = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
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
    if (deleteTarget) deleteCancelButton.current?.focus();
  }, [deleteTarget]);

  useEffect(() => {
    if (mutationUncertain) uncertainPanel.current?.focus();
  }, [mutationUncertain]);

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
        closeCustomerForm(false);
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
      closeCustomerForm(false);
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

  const updateSearch = (value: string) => {
    setCustomerSearch(value);
  };

  const clearSearch = () => {
    updateSearch('');
    searchInput.current?.focus();
  };

  return (
    <DashboardAccessBoundary>
      <div className="space-y-6 sm:space-y-8">
        <div className="min-w-0 break-words">
          <h1 className="text-3xl font-bold text-forest tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted">Manage customers for {selectedBusiness?.businessName}</p>
        </div>

        <ScrollReveal className="rounded-xl border border-forest/10 bg-white p-5 shadow-soft sm:p-8">
          <CardHeader className="flex-row items-center justify-between gap-3 px-0 pt-0">
            <CardTitle tabIndex={-1} className="text-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest">All customers</CardTitle>
            <Button ref={addCustomerTrigger} type="button" size="sm" className="shrink-0" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={openCreateCustomer}>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
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
                    <Button type="button" variant="outline" onClick={acknowledgeUncertainMutation}>I understand; allow changes</Button>
                  </div>
                  <p className="text-xs">Acknowledging does not confirm whether the change completed. It only unlocks actions; do not repeat the original request until you have checked the customer details.</p>
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
                        <X className="h-4 w-4 mr-2" aria-hidden="true" />
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {customerState.status === 'loading' && customers.length > 0 && <p role="status" className="text-sm text-muted">Updating customers. Showing last loaded information.</p>}
              {customerState.status === 'error' && customers.length > 0 && <PanelError panel="customers" retry={loadCustomers} message={customerState.message} />}
              {customerState.status === 'loading' && !customers.length ? (
                <p role="status" className="flex min-h-28 items-center justify-center text-sm text-muted">Loading customers…</p>
              ) : customerState.status === 'error' && !customers.length ? (
                <div className="flex min-h-28 items-center justify-center">
                  <PanelError panel="customers" retry={loadCustomers} message={customerState.message} />
                </div>
              ) : filteredCustomers.length > 0 ? (
                filteredCustomers.map(customer => {
                  const duplicate = (customerNameCounts.get(customer.name.trim().toLowerCase()) ?? 0) > 1;
                  const outstanding = formatInrAmount(customer.outstandingBalance);
                  return (
                    <Link key={customer.id} href={`/customers/${customer.id}`} className="block">
                      <div className="rounded-lg border border-forest/10 p-3 hover:bg-beige-light transition-colors">
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
                          <span className={`min-w-0 max-w-full font-bold text-forest [overflow-wrap:anywhere] ${outstanding.length > 12 ? 'text-[clamp(0.75rem,3.5vw,1.125rem)]' : 'text-lg'}`}>{outstanding}</span>
                          <span className="text-xs text-muted">outstanding</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          <Button type="button" variant="link" size="sm" className="px-0 underline" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={event => { event.preventDefault(); openEditCustomer(customer, event.currentTarget); }}>Edit</Button>
                          <Button type="button" variant="link" size="sm" className="px-0 underline" disabled={mutationPending || mutationUncertain || financialOperationStatus !== 'idle'} onClick={event => { event.preventDefault(); openDeleteConfirmation(customer, event.currentTarget); }}>Delete</Button>
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : customers.length > 0 ? (
                <p role="status" className="min-h-28 py-4 text-sm text-muted">No customers match that name or phone number. Try a different name or number.</p>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted">
                  <Users className="h-8 w-8 opacity-50 mb-2" />
                  <p className="text-sm">No customers yet</p>
                  <p className="text-xs text-muted">Add your first customer to get started</p>
                </div>
              )}
            </div>
          </CardContent>
        </ScrollReveal>
      </div>
    </DashboardAccessBoundary>
  );
}

function focusInView(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  const { top, bottom } = element.getBoundingClientRect();
  const topInset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  if (top < topInset || bottom > window.innerHeight) {
    element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}