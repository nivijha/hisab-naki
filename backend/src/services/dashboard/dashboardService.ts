import type { TransactionWithCustomer, TransactionRepository } from '../../repositories/transactionRepository.js';
import { PrismaTransactionRepository } from '../../repositories/transactionRepository.js';
import { calculateOutstandingAmount } from '../../utils/ledger.js';
import { ensureDefaultUser } from '../ledger/customerService.js';

const DEFAULT_FALLBACK_BUSINESS_NAME = 'My Business';

export type DashboardSummary = {
  businessName: string;
  todaysSales: number;
  todaysExpenses: number;
  paymentsReceived: number;
  newCredit: number;
  totalOutstanding: number;
  recentTransactions: TransactionWithCustomer[];
};

export type DashboardServiceDependencies = {
  repository: TransactionRepository;
  getBusinessName?: (userId: string) => Promise<string | null | undefined>;
  now?: () => Date;
  fallbackBusinessName?: string;
};

function resolveFallbackName(): string {
  const configured = process.env.DASHBOARD_BUSINESS_NAME;
  return configured && configured.trim() ? configured : DEFAULT_FALLBACK_BUSINESS_NAME;
}

async function defaultGetBusinessName(userId: string): Promise<string | null | undefined> {
  const user = await ensureDefaultUser();
  return user?.id === userId ? user.businessName : undefined;
}

export function createDashboardService(dependencies: DashboardServiceDependencies) {
  const {
    repository,
    getBusinessName = defaultGetBusinessName,
    now = () => new Date(),
    fallbackBusinessName = resolveFallbackName(),
  } = dependencies;

  async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
    const current = now();
    const startOfToday = new Date(current.getFullYear(), current.getMonth(), current.getDate());

    const transactions = await repository.listForUser(userId);
    const customerGroups = await repository.listCustomerTransactionGroups(userId);

    const todayTransactions = transactions.filter(
      (transaction) => transaction.createdAt >= startOfToday
    );

    const sumByType = (type: 'SALE' | 'EXPENSE' | 'PAYMENT' | 'CREDIT') =>
      todayTransactions
        .filter((transaction) => transaction.type === type)
        .reduce((sum, transaction) => sum + transaction.amount, 0);

    const totalOutstanding = customerGroups.reduce(
      (sum, customer) => sum + calculateOutstandingAmount(customer.transactions),
      0
    );

    const rawBusinessName = await getBusinessName(userId);
    const businessName =
      rawBusinessName && rawBusinessName.trim() ? rawBusinessName : fallbackBusinessName;

    return {
      businessName,
      todaysSales: sumByType('SALE'),
      todaysExpenses: sumByType('EXPENSE'),
      paymentsReceived: sumByType('PAYMENT'),
      newCredit: sumByType('CREDIT'),
      totalOutstanding,
      recentTransactions: transactions.slice(0, 5),
    };
  }

  return { getDashboardSummary };
}

const defaultService = createDashboardService({ repository: new PrismaTransactionRepository() });

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  return defaultService.getDashboardSummary(userId);
}
