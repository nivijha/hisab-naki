import {
  PrismaTransactionRepository,
  type TransactionRepository,
  type CustomerTransactionGroup,
} from '../../repositories/transactionRepository.js';
import { calculateOutstandingAmount, formatCurrency, toCurrencyText } from '../../utils/ledger.js';
import {
  createDashboardService,
  getDashboardSummary as getDashboardSummaryFromService,
} from '../dashboard/dashboardService.js';
import { ensureCustomer, ensureDefaultUser, getCustomerByName } from './customerService.js';

export type CreateTransactionInput = {
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
  ensureDefaultUser: typeof ensureDefaultUser;
  ensureCustomer: typeof ensureCustomer;
  getCustomerByName: typeof getCustomerByName;
};

const defaultGateway: TransactionCustomerGateway = {
  ensureDefaultUser,
  ensureCustomer,
  getCustomerByName,
};

export function createTransactionService(
  repository: TransactionRepository,
  gateway: TransactionCustomerGateway = defaultGateway
) {
  async function createTransaction(input: CreateTransactionInput) {
    const user = await gateway.ensureDefaultUser();
    const customer = await gateway.ensureCustomer(user.id, input.customerName);

    const transaction = await repository.create({
      userId: user.id,
      customerId: customer.id,
      type: input.type,
      amount: Math.round(input.amount),
      description: input.description ?? 'Ledger update',
    });

    return {
      transaction,
      customer,
      outstandingBalance: calculateOutstandingAmount(
        await repository.listForCustomer(customer.id, user.id)
      ),
    };
  }

  async function getTransactionsForUser(userId: string) {
    const transactions = await repository.listForUser(userId);

    return transactions.map((transaction) => ({
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount),
    }));
  }

  async function getTransactionById(userId: string, transactionId: string) {
    const transaction = await repository.findById(transactionId, userId);

    if (!transaction) {
      return null;
    }

    return {
      ...transaction,
      formattedAmount: formatCurrency(transaction.amount),
    };
  }

  async function getTransactionHistory(
    userId: string,
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
      userId,
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

  const dashboardService = createDashboardService({
    repository,
    getBusinessName: async (id) => {
      const user = await gateway.ensureDefaultUser();
      return user?.id === id ? user.businessName : undefined;
    },
  });

  async function getDashboardSummary(userId: string) {
    return dashboardService.getDashboardSummary(userId);
  }

  async function getCustomerBalanceForName(userId: string, customerName: string) {
    const customer = await gateway.getCustomerByName(userId, customerName);

    if (!customer) {
      return null;
    }

    const outstanding = calculateOutstandingAmount(customer.transactions);

    return {
      customerName: customer.name,
      outstandingBalance: outstanding,
      balanceText: toCurrencyText(outstanding),
    };
  }

  async function getTotalOutstandingForUser(userId: string) {
    const customers: CustomerTransactionGroup[] =
      await repository.listCustomerTransactionGroups(userId);

    const total = customers.reduce(
      (sum, customer) => sum + calculateOutstandingAmount(customer.transactions),
      0
    );

    return {
      totalOutstanding: total,
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

export async function getTransactionsForUser(userId: string) {
  return defaultService.getTransactionsForUser(userId);
}

export async function getTransactionById(userId: string, transactionId: string) {
  return defaultService.getTransactionById(userId, transactionId);
}

export async function getTransactionHistory(
  userId: string,
  filters: TransactionHistoryFilters = {}
) {
  return defaultService.getTransactionHistory(userId, filters);
}

export async function getDashboardSummary(userId: string) {
  return getDashboardSummaryFromService(userId);
}

export async function getCustomerBalanceForName(userId: string, customerName: string) {
  return defaultService.getCustomerBalanceForName(userId, customerName);
}

export async function getTotalOutstandingForUser(userId: string) {
  return defaultService.getTotalOutstandingForUser(userId);
}
