import { Prisma } from '@prisma/client';
import type { TransactionWithCustomer, TransactionRepository } from '../../repositories/transactionRepository.js';
import { PrismaTransactionRepository } from '../../repositories/transactionRepository.js';
import { calculateOutstandingAmount, toDisplayNumber } from '../../utils/ledger.js';
import { createPrismaBusinessNameResolver } from './businessService.js';

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
  getBusinessName?: (businessId: string) => Promise<string | null | undefined>;
  now?: () => Date;
  fallbackBusinessName?: string;
};

function resolveFallbackName(): string {
  const configured = process.env.DASHBOARD_BUSINESS_NAME;
  return configured && configured.trim() ? configured : DEFAULT_FALLBACK_BUSINESS_NAME;
}

export function createDashboardService(dependencies: DashboardServiceDependencies) {
  const {
    repository,
    getBusinessName = async () => undefined,
    now = () => new Date(),
    fallbackBusinessName = resolveFallbackName(),
  } = dependencies;

  async function getDashboardSummary(businessId: string): Promise<DashboardSummary> {
    const current = now();
    const startOfToday = new Date(current.getFullYear(), current.getMonth(), current.getDate());

    const transactions = await repository.listForBusiness(businessId);
    const customerGroups = await repository.listCustomerTransactionGroups(businessId);

    const todayTransactions = transactions.filter(
      (transaction) => transaction.createdAt >= startOfToday
    );

    const sumByType = (type: 'SALE' | 'EXPENSE' | 'PAYMENT' | 'CREDIT') =>
      todayTransactions
        .filter((transaction) => transaction.type === type)
        .reduce(
          (sum, transaction) => sum.plus(transaction.amount),
          new Prisma.Decimal(0)
        );

    const totalOutstanding = customerGroups.reduce(
      (sum, customer) => sum.plus(calculateOutstandingAmount(customer.transactions)),
      new Prisma.Decimal(0)
    );

    const rawBusinessName = await getBusinessName(businessId);
    const businessName =
      rawBusinessName && rawBusinessName.trim() ? rawBusinessName : fallbackBusinessName;

    return {
      businessName,
      todaysSales: toDisplayNumber(sumByType('SALE')),
      todaysExpenses: toDisplayNumber(sumByType('EXPENSE')),
      paymentsReceived: toDisplayNumber(sumByType('PAYMENT')),
      newCredit: toDisplayNumber(sumByType('CREDIT')),
      totalOutstanding: toDisplayNumber(totalOutstanding),
      recentTransactions: transactions.slice(0, 5),
    };
  }

  return { getDashboardSummary };
}

const defaultService = createDashboardService({
  repository: new PrismaTransactionRepository(),
  getBusinessName: createPrismaBusinessNameResolver(),
});

export async function getDashboardSummary(businessId: string): Promise<DashboardSummary> {
  return defaultService.getDashboardSummary(businessId);
}
