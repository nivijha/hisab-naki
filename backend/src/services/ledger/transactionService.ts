import { Prisma } from '@prisma/client';
import {
  PrismaTransactionRepository,
  type TransactionRepository,
  type CustomerTransactionGroup,
} from '../../repositories/transactionRepository.js';
import {
  calculateOutstandingAmount,
  formatCurrency,
  toCurrencyText,
  toDisplayNumber,
} from '../../utils/ledger.js';
import {
  createDashboardService,
  getDashboardSummary as getDashboardSummaryFromService,
} from '../dashboard/dashboardService.js';
import { ensureCustomer, getCustomerByName } from './customerService.js';

export type CreateTransactionInput = {
  businessId: string;
  createdByUserId: string;
  customerName: string;
  amount: number;
  type: 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE';
  description?: string;
};

export type TransactionHistoryFilters = {
  page?: number;
  limit?: number;
  type?: 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE';
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

export type TransactionCustomerGateway = {
  ensureCustomer: typeof ensureCustomer;
  getCustomerByName: typeof getCustomerByName;
};

const defaultGateway: TransactionCustomerGateway = {
  ensureCustomer,
  getCustomerByName,
};

export function createTransactionService(
  repository: TransactionRepository,
  gateway: TransactionCustomerGateway = defaultGateway
) {
  async function createTransaction(input: CreateTransactionInput) {
    const customer = await gateway.ensureCustomer(
      input.businessId,
      input.createdByUserId,
      input.customerName
    );

    const transaction = await repository.create({
      businessId: input.businessId,
      createdByUserId: input.createdByUserId,
      customerId: customer.id,
      type: input.type,
      amount: Math.round(input.amount),
      description: input.description ?? 'Ledger update',
    });

    return {
      transaction,
      customer,
      outstandingBalance: toDisplayNumber(
        calculateOutstandingAmount(
          await repository.listForCustomer(customer.id, input.businessId)
        )
      ),
    };
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
