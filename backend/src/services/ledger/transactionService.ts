import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { calculateOutstandingAmount, formatCurrency, toCurrencyText } from '../../utils/ledger.js';
import { ensureCustomer, ensureDefaultUser, getCustomerByName } from './customerService.js';

export type CreateTransactionInput = {
  customerName: string;
  amount: number;
  type: 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE';
  description?: string;
};

export async function createTransaction(input: CreateTransactionInput) {
  const user = await ensureDefaultUser();
  const customer = await ensureCustomer(user.id, input.customerName);

  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      customerId: customer.id,
      type: input.type,
      amount: Math.round(input.amount),
      description: input.description ?? 'Ledger update',
    },
    include: {
      customer: true,
    },
  });

  return {
    transaction,
    customer,
    outstandingBalance: calculateOutstandingAmount((await prisma.transaction.findMany({
      where: { customerId: customer.id, userId: user.id },
    }))),
  };
}

export async function getTransactionsForUser(userId: string) {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });

  return transactions.map((transaction) => ({
    ...transaction,
    formattedAmount: formatCurrency(transaction.amount),
  }));
}

export async function getDashboardSummary(userId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
  });

  const todayTransactions = transactions.filter((transaction) => transaction.createdAt >= startOfToday);
  const sales = todayTransactions.filter((t) => t.type === 'SALE').reduce((sum, t) => sum + t.amount, 0);
  const expenses = todayTransactions.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
  const paymentsReceived = todayTransactions.filter((t) => t.type === 'PAYMENT').reduce((sum, t) => sum + t.amount, 0);
  const newCredit = todayTransactions.filter((t) => t.type === 'CREDIT').reduce((sum, t) => sum + t.amount, 0);

  const customerBalances = await prisma.customer.findMany({
    where: { userId },
    include: { transactions: true },
  });

  const totalOutstanding = customerBalances.reduce((sum, customer) => sum + calculateOutstandingAmount(customer.transactions), 0);

  return {
    businessName: 'Raju General Store',
    todaysSales: sales,
    todaysExpenses: expenses,
    paymentsReceived,
    newCredit,
    totalOutstanding,
    recentTransactions: transactions.slice(0, 5),
  };
}

export async function getCustomerBalanceForName(userId: string, customerName: string) {
  const customer = await getCustomerByName(userId, customerName);

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

export async function getTotalOutstandingForUser(userId: string) {
  const customers = await prisma.customer.findMany({
    where: { userId },
    include: { transactions: true },
  });

  const total = customers.reduce((sum, customer) => sum + calculateOutstandingAmount(customer.transactions), 0);

  return {
    totalOutstanding: total,
    totalOutstandingText: toCurrencyText(total),
  };
}
