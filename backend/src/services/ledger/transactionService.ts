import { Prisma } from '@prisma/client';
import type {
  Customer,
  OpeningBalanceDirection,
  PaymentMethod,
  SaleMode,
} from '@prisma/client';
import { HttpError } from '../../middleware/authenticate.js';
import { logger } from '../../utils/logger.js';
import {
  PrismaTransactionRepository,
  type TransactionRepository,
  type TransactionWithCustomer,
  type CustomerTransactionGroup,
} from '../../repositories/transactionRepository.js';
import {
  calculateOutstandingAmount,
  formatCurrency,
  normalizeAmount,
  toCurrencyText,
  toDisplayNumber,
} from '../../utils/ledger.js';
import {
  createDashboardService,
  getDashboardSummary as getDashboardSummaryFromService,
} from '../dashboard/dashboardService.js';
import {
  ensureCustomer,
  getCustomerById as getCustomerByIdFromService,
  getCustomerByName,
} from './customerService.js';

export type TransactionCreateType =
  | 'CREDIT'
  | 'PAYMENT'
  | 'SALE'
  | 'EXPENSE'
  | 'OPENING_BALANCE'
  | 'SALE_RETURN'
  | 'REFUND';

export type CreateTransactionInput = {
  businessId: string;
  createdByUserId: string;
  customerId?: string | null;
  customerName?: string;
  amount: number;
  type: TransactionCreateType;
  description?: string;
  saleMode?: SaleMode | null;
  paymentMethod?: PaymentMethod | null;
  openingDirection?: OpeningBalanceDirection | null;
  originalTransactionId?: string | null;
  idempotencyKey?: string;
};

export type TransactionHistoryFilters = {
  page?: number;
  limit?: number;
  type?: TransactionCreateType;
  customerId?: string;
  from?: Date;
  to?: Date;
};

export type TransactionHistoryResult = {
  transactions: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const SUPPORTED_TYPES: readonly TransactionCreateType[] = [
  'CREDIT',
  'PAYMENT',
  'SALE',
  'EXPENSE',
  'OPENING_BALANCE',
  'SALE_RETURN',
  'REFUND',
];
const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'];
const SALE_MODES: readonly SaleMode[] = ['CASH', 'CREDIT'];

export type TransactionCustomerGateway = {
  ensureCustomer: typeof ensureCustomer;
  getCustomerByName: typeof getCustomerByName;
  getCustomerById: (businessId: string, customerId: string) => Promise<Customer | null>;
};

const defaultGateway: TransactionCustomerGateway = {
  ensureCustomer,
  getCustomerByName,
  getCustomerById: getCustomerByIdFromService,
};

function canonicalCustomerName(name: string): string {
  return name.trim();
}

function normalizeCustomerId(customerId: string | null | undefined): string | null {
  const trimmed = customerId?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateCreateInput(input: CreateTransactionInput): void {
  if (!SUPPORTED_TYPES.includes(input.type)) {
    throw new HttpError(400, 'Unsupported transaction type.');
  }

  if (input.openingDirection != null && input.type !== 'OPENING_BALANCE') {
    throw new HttpError(400, 'Opening balance transactions are not supported by this endpoint.');
  }

  if (input.originalTransactionId != null) {
    throw new HttpError(400, 'Linked transactions are not supported by this endpoint.');
  }

  if (input.saleMode != null) {
    if (input.type !== 'SALE') {
      throw new HttpError(400, 'saleMode is only valid for SALE transactions.');
    }
    if (!SALE_MODES.includes(input.saleMode)) {
      throw new HttpError(400, 'Invalid sale mode.');
    }
  }

  if (input.paymentMethod != null && !PAYMENT_METHODS.includes(input.paymentMethod)) {
    throw new HttpError(400, 'Invalid payment method.');
  }

  const hasCustomer = Boolean(
    normalizeCustomerId(input.customerId) || normalizeOptionalText(input.customerName)
  );

  if (input.type === 'OPENING_BALANCE') {
    if (!hasCustomer) {
      throw new HttpError(400, 'Customer name or customer ID is required for OPENING_BALANCE.');
    }
    if (input.openingDirection == null) {
      throw new HttpError(400, 'Required for OPENING_BALANCE transactions.');
    }
    if (!['INCREASE', 'DECREASE'].includes(input.openingDirection)) {
      throw new HttpError(400, 'Invalid opening direction.');
    }
    if (input.paymentMethod != null) {
      throw new HttpError(400, 'paymentMethod is not valid for OPENING_BALANCE transactions.');
    }
    return;
  }

  if (input.type === 'SALE_RETURN') {
    if (!hasCustomer) {
      throw new HttpError(400, 'Customer name or customer ID is required for SALE_RETURN.');
    }
    if (input.paymentMethod != null) {
      throw new HttpError(400, 'paymentMethod is not valid for SALE_RETURN transactions.');
    }
    return;
  }

  if (input.type === 'REFUND') {
    if (input.paymentMethod != null) {
      throw new HttpError(400, 'paymentMethod is not valid for REFUND transactions.');
    }
    return;
  }

  if (input.type === 'CREDIT') {
    if (!hasCustomer) {
      throw new HttpError(400, 'Customer name or customer ID is required for CREDIT.');
    }
    if (input.paymentMethod != null) {
      throw new HttpError(400, 'paymentMethod is not valid for CREDIT transactions.');
    }
    return;
  }

  if (input.type === 'PAYMENT') {
    if (!hasCustomer) {
      throw new HttpError(400, 'Customer name or customer ID is required for PAYMENT.');
    }
    if (input.paymentMethod == null) {
      throw new HttpError(400, 'paymentMethod is required for PAYMENT.');
    }
    return;
  }

  if (input.type === 'SALE') {
    if (input.saleMode == null) {
      throw new HttpError(400, 'saleMode is required for SALE.');
    }

    if (input.saleMode === 'CASH' && input.paymentMethod == null) {
      throw new HttpError(400, 'paymentMethod is required for a cash sale.');
    }

    if (input.saleMode === 'CREDIT') {
      if (!hasCustomer) {
        throw new HttpError(400, 'Customer name or customer ID is required for a credit sale.');
      }
      if (input.paymentMethod != null) {
        throw new HttpError(400, 'paymentMethod must not be set for a credit sale.');
      }
    }
    return;
  }

  if (hasCustomer) {
    throw new HttpError(400, 'EXPENSE does not accept a customer.');
  }
  if (input.paymentMethod == null) {
    throw new HttpError(400, 'paymentMethod is required for EXPENSE.');
  }
}

function normalizeCreateAmount(amount: number): Prisma.Decimal {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Amount must be greater than zero.');
  }

  try {
    return normalizeAmount(amount);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : 'Amount supports at most two decimal places.'
    );
  }
}

function matchesIdempotentRequest(
  transaction: TransactionWithCustomer,
  input: CreateTransactionInput,
  normalizedAmount: Prisma.Decimal,
  expectedCustomerId?: string | null
): boolean {
  const inputCustomerId = normalizeCustomerId(input.customerId);
  const inputCustomerName = normalizeOptionalText(input.customerName);

  let customerMatches: boolean;
  if (inputCustomerId) {
    customerMatches = transaction.customerId === inputCustomerId;
  } else if (inputCustomerName) {
    customerMatches =
      transaction.customer != null &&
      canonicalCustomerName(transaction.customer.name).toLowerCase() ===
        inputCustomerName.toLowerCase();
  } else if (expectedCustomerId !== undefined) {
    customerMatches = transaction.customerId === expectedCustomerId;
  } else {
    customerMatches = transaction.customerId === null;
  }

  const sameNullable = <T>(left: T | null, right: T | null | undefined): boolean =>
    (left ?? null) === (right ?? null);

  return (
    customerMatches &&
    new Prisma.Decimal(transaction.amount).equals(normalizedAmount) &&
    transaction.type === input.type &&
    (transaction.description ?? 'Ledger update') === (input.description ?? 'Ledger update') &&
    sameNullable(transaction.saleMode, input.saleMode) &&
    sameNullable(transaction.paymentMethod, input.paymentMethod) &&
    sameNullable(transaction.openingDirection, input.openingDirection) &&
    sameNullable(transaction.originalTransactionId, input.originalTransactionId)
  );
}

export function createTransactionService(
  repository: TransactionRepository,
  gateway: TransactionCustomerGateway = defaultGateway
) {
  const idempotencyLocks = new Map<string, Promise<void>>();

  async function withIdempotencyLock<T>(
    businessId: string,
    idempotencyKey: string | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!idempotencyKey) {
      return operation();
    }

    const lockKey = `${businessId}:${idempotencyKey}`;
    const previous = idempotencyLocks.get(lockKey) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    idempotencyLocks.set(lockKey, tail);

    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (idempotencyLocks.get(lockKey) === tail) {
        idempotencyLocks.delete(lockKey);
      }
    }
  }

  async function resolveCustomer(
    input: CreateTransactionInput
  ): Promise<{ customerId: string | null; customer: Customer | null }> {
    if (input.type === 'EXPENSE') {
      return { customerId: null, customer: null };
    }

    const customerId = normalizeCustomerId(input.customerId);
    const customerName = normalizeOptionalText(input.customerName);

    if (customerId) {
      const customer = await gateway.getCustomerById(input.businessId, customerId);

      if (!customer || customer.deletedAt || customer.businessId !== input.businessId) {
        throw new HttpError(404, 'Customer not found for this business.');
      }

      if (
        customerName &&
        canonicalCustomerName(customer.name).toLowerCase() !== customerName.toLowerCase()
      ) {
        throw new HttpError(400, 'Customer ID and customer name do not match.');
      }

      return { customerId: customer.id, customer };
    }

    if (customerName) {
      const customer = await gateway.ensureCustomer(
        input.businessId,
        input.createdByUserId,
        customerName
      );

      if (!customer || customer.deletedAt || customer.businessId !== input.businessId) {
        throw new HttpError(404, 'Customer not found for this business.');
      }

      return { customerId: customer.id, customer };
    }

    return { customerId: null, customer: null };
  }

  async function buildCreateResult(
    transaction: TransactionWithCustomer,
    fallbackCustomer: Customer | null = null
  ) {
    const customer = transaction.customer ?? fallbackCustomer;
    const customerId = transaction.customerId ?? fallbackCustomer?.id ?? null;

    const outstandingBalance = customerId
      ? toDisplayNumber(
          calculateOutstandingAmount(
            await repository.listForCustomer(customerId, transaction.businessId)
          )
        )
      : 0;

    return {
      transaction,
      customer,
      outstandingBalance,
    };
  }

  async function createTransaction(input: CreateTransactionInput) {
    return withIdempotencyLock(input.businessId, input.idempotencyKey, () =>
      createTransactionUnlocked(input)
    );
  }

  async function createTransactionUnlocked(input: CreateTransactionInput) {
    validateCreateInput(input);
    const normalizedAmount = normalizeCreateAmount(input.amount);

    if (input.idempotencyKey) {
      const existing = await repository.findByIdempotencyKey(
        input.businessId,
        input.idempotencyKey
      );

      if (existing) {
        if (!matchesIdempotentRequest(existing, input, normalizedAmount)) {
          throw new HttpError(409, 'Idempotency key was reused with a different request payload.');
        }

        logger.info('transaction.idempotency_replayed', {
          transactionId: existing.id,
          businessId: input.businessId,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
        });

        return buildCreateResult(existing);
      }
    }

    const { customerId, customer } = await resolveCustomer(input);

    const { transaction, created } = await repository.createIdempotent({
      businessId: input.businessId,
      createdByUserId: input.createdByUserId,
      customerId,
      type: input.type,
      amount: normalizedAmount,
      description: input.description ?? 'Ledger update',
      saleMode: input.saleMode ?? null,
      paymentMethod: input.paymentMethod ?? null,
      openingDirection: input.openingDirection ?? null,
      originalTransactionId: null,
      idempotencyKey: input.idempotencyKey,
    });

    if (
      input.idempotencyKey &&
      !matchesIdempotentRequest(transaction, input, normalizedAmount, customerId)
    ) {
      throw new HttpError(409, 'Idempotency key was reused with a different request payload.');
    }

    logger.info(created ? 'transaction.created' : 'transaction.idempotency_replayed', {
      transactionId: transaction.id,
      businessId: input.businessId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
    });

    return buildCreateResult(transaction, customer);
  }

  async function getTransactionsForUser(businessId: string) {
    const transactions = await repository.listForBusiness(businessId);

    return transactions.map((transaction) => ({
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount),
    }));
  }

  async function getTransactionById(businessId: string, transactionId: string) {
    const transaction = await repository.findById(transactionId, businessId);

    if (!transaction) {
      return null;
    }

    return {
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount),
    };
  }

  async function getTransactionHistory(
    businessId: string,
    filters: TransactionHistoryFilters = {}
  ): Promise<TransactionHistoryResult> {
    const requestedPage = filters.page ?? DEFAULT_PAGE;
    const requestedLimit = filters.limit ?? DEFAULT_LIMIT;

    const page = Number.isFinite(requestedPage) && requestedPage > 0
      ? Math.floor(requestedPage)
      : DEFAULT_PAGE;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { transactions, total } = await repository.findHistory({
      businessId,
      page,
      limit,
      type: filters.type,
      customerId: filters.customerId,
      from: filters.from,
      to: filters.to,
    });

    return {
      transactions: transactions.map((transaction) => ({
        ...transaction,
        formattedAmount: formatCurrency(transaction.amount),
      })),
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  const dashboardService = createDashboardService({ repository });

  async function getDashboardSummary(businessId: string) {
    return dashboardService.getDashboardSummary(businessId);
  }

  async function getCustomerBalanceForName(businessId: string, customerName: string) {
    const customer = await gateway.getCustomerByName(businessId, customerName);

    if (!customer) {
      return null;
    }

    const outstanding = calculateOutstandingAmount(customer.transactions);

    return {
      customerName: customer.name,
      outstandingBalance: toDisplayNumber(outstanding),
      balanceText: toCurrencyText(outstanding),
    };
  }

  async function getTotalOutstandingForUser(businessId: string) {
    const customers: CustomerTransactionGroup[] =
      await repository.listCustomerTransactionGroups(businessId);

    const total = customers.reduce(
      (sum, customer) => sum.plus(calculateOutstandingAmount(customer.transactions)),
      new Prisma.Decimal(0)
    );

    return {
      totalOutstanding: toDisplayNumber(total),
      totalOutstandingText: toCurrencyText(total),
    };
  }

  return {
    createTransaction,
    getTransactionsForUser,
    getTransactionById,
    getTransactionHistory,
    getDashboardSummary,
    getCustomerBalanceForName,
    getTotalOutstandingForUser,
  };
}

const defaultService = createTransactionService(new PrismaTransactionRepository());

export async function createTransaction(input: CreateTransactionInput) {
  return defaultService.createTransaction(input);
}

export async function getTransactionsForUser(businessId: string) {
  return defaultService.getTransactionsForUser(businessId);
}

export async function getTransactionById(businessId: string, transactionId: string) {
  return defaultService.getTransactionById(businessId, transactionId);
}

export async function getTransactionHistory(
  businessId: string,
  filters: TransactionHistoryFilters = {}
) {
  return defaultService.getTransactionHistory(businessId, filters);
}

export async function getDashboardSummary(businessId: string) {
  return getDashboardSummaryFromService(businessId);
}

export async function getCustomerBalanceForName(businessId: string, customerName: string) {
  return defaultService.getCustomerBalanceForName(businessId, customerName);
}

export async function getTotalOutstandingForUser(businessId: string) {
  return defaultService.getTotalOutstandingForUser(businessId);
}
