export type NormalizedTransaction = {
  id: string;
  customerId?: string | null;
  customer?: { name: string } | null;
  description: string;
  amount: string;
  type: string;
  createdAt: string;
};

export type TransactionHistoryResponse = {
  transactions: NormalizedTransaction[];
  total: number | null;
  page: number;
  limit: number;
  totalPages: number | null;
};

export type TransactionHistoryQuery = {
  page: number;
  limit: number;
  type?: string;
  customerId?: string;
  from?: string;
  to?: string;
};

export type TransactionHistoryFilterState = {
  page: number;
  type: string;
  customerId: string;
  from: string;
  to: string;
};

export function updateTransactionHistoryFilters(
  current: TransactionHistoryFilterState,
  update: Partial<Omit<TransactionHistoryFilterState, 'page'>>,
): TransactionHistoryFilterState {
  return { ...current, ...update, page: 1 };
}

export function changeTransactionHistoryPage(
  current: TransactionHistoryFilterState,
  page: number,
  totalPages: number,
): TransactionHistoryFilterState {
  return { ...current, page: Math.max(1, Math.min(totalPages || 1, page)) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAmount(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) return null;
  if (/^0+(?:\.0+)?$/.test(text)) return null;
  return text;
}

export function normalizeTransaction(value: unknown): NormalizedTransaction | null {
  const kinds = ['CREDIT', 'PAYMENT', 'SALE', 'EXPENSE', 'OPENING_BALANCE', 'SALE_RETURN', 'REFUND'];
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.type !== 'string' || !kinds.includes(value.type)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || (value.customerId !== undefined && value.customerId !== null && typeof value.customerId !== 'string')) return null;
  const amount = normalizeAmount(value.amount);
  if (amount === null) return null;
  const description = value.description === null || value.description === undefined
    ? ''
    : typeof value.description === 'string' ? value.description : null;
  if (description === null) return null;
  let customer: NormalizedTransaction['customer'];
  if (value.customer === null || value.customer === undefined) customer = value.customer;
  else if (isRecord(value.customer) && typeof value.customer.name === 'string') customer = { name: value.customer.name };
  else return null;
  return {
    id: value.id,
    type: value.type,
    amount,
    description,
    createdAt: value.createdAt,
    customer,
    customerId: value.customerId as string | null | undefined,
  };
}

export function normalizeTransactionList(value: unknown): NormalizedTransaction[] | null {
  if (!Array.isArray(value)) return null;
  const rows: NormalizedTransaction[] = [];
  for (const item of value) {
    const row = normalizeTransaction(item);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export function normalizeTransactionHistory(value: unknown): TransactionHistoryResponse | null {
  const legacyRows = normalizeTransactionList(value);
  if (legacyRows) {
    return { transactions: legacyRows, total: null, page: 1, limit: legacyRows.length, totalPages: null };
  }
  if (!isRecord(value)) return null;
  const transactions = normalizeTransactionList(value.transactions);
  if (!transactions || typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0
    || typeof value.page !== 'number' || !Number.isSafeInteger(value.page) || value.page < 1
    || typeof value.limit !== 'number' || !Number.isSafeInteger(value.limit) || value.limit < 1
    || typeof value.totalPages !== 'number' || !Number.isSafeInteger(value.totalPages) || value.totalPages < 0) return null;
  return {
    transactions,
    total: value.total,
    page: value.page,
    limit: value.limit,
    totalPages: value.totalPages,
  };
}

function dateBoundary(date: string, end: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`);
  if (!Number.isFinite(value.getTime())) return null;
  if (new Date(`${date}T12:00:00.000Z`).toISOString().slice(0, 10) !== date) return null;
  return value.toISOString();
}

export function buildTransactionHistoryPath(query: TransactionHistoryQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('limit', String(query.limit));
  if (query.type) params.set('type', query.type);
  if (query.customerId) params.set('customerId', query.customerId);
  if (query.from) {
    const from = dateBoundary(query.from, false);
    if (from) params.set('from', from);
  }
  if (query.to) {
    const to = dateBoundary(query.to, true);
    if (to) params.set('to', to);
  }
  return `/api/transactions?${params.toString()}`;
}

export function isValidManualAmount(value: string): boolean {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value)) return false;
  return !/^0+(?:\.0+)?$/.test(value);
}
