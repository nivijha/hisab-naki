import { Prisma } from '@prisma/client';
import type { Transaction } from '@prisma/client';

type OutstandingTransaction = {
  type: Transaction['type'];
  amount: Transaction['amount'] | number;
};

export function calculateOutstandingAmount(
  transactions: OutstandingTransaction[]
): Prisma.Decimal {
  return transactions.reduce<Prisma.Decimal>((total, transaction) => {
    const amount =
      typeof transaction.amount === 'number'
        ? new Prisma.Decimal(transaction.amount)
        : transaction.amount;

    if (transaction.type === 'CREDIT') {
      return total.plus(amount);
    }

    if (transaction.type === 'PAYMENT') {
      return total.minus(amount);
    }

    return total;
  }, new Prisma.Decimal(0));
}

export function normalizeAmount(value: Prisma.Decimal | number): Prisma.Decimal {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  if (!decimal.toDecimalPlaces(2).equals(decimal)) {
    throw new Error('Amount supports at most two decimal places.');
  }
  return decimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function toDisplayNumber(amount: Prisma.Decimal | number): number {
  return typeof amount === 'number' ? amount : amount.toNumber();
}

export function formatCurrency(amount: Prisma.Decimal | number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(toDisplayNumber(amount));
}

export function toCurrencyText(amount: Prisma.Decimal | number) {
  return `₹${toDisplayNumber(amount).toLocaleString('en-IN')}`;
}
