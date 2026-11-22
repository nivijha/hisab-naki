import type { Transaction } from '@prisma/client';

export function calculateOutstandingAmount(transactions: Pick<Transaction, 'type' | 'amount'>[]) {
  return transactions.reduce((total, transaction) => {
    if (transaction.type === 'CREDIT') {
      return total + transaction.amount;
    }

    if (transaction.type === 'PAYMENT') {
      return total - transaction.amount;
    }

    return total;
  }, 0);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function toCurrencyText(amount: number) {
  return `₹${amount.toLocaleString('en-IN')}`;
}
