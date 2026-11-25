import type { TransactionStatus } from '@/lib/transaction-contract';

export function TransactionRowStatus({ status }: { status: TransactionStatus }) {
  if (status === 'ACTIVE') return null;

  return (
    <span
      aria-label="Voided transaction; excluded from the outstanding balance"
      className="mt-1 inline-flex rounded-full border border-forest/10 bg-beige-light px-2 py-1 text-xs font-medium text-muted"
    >
      Voided · excluded from balance
    </span>
  );
}

export function TransactionDetailStatus({ status }: { status: TransactionStatus }) {
  return status === 'VOIDED' ? (
    <span
      aria-label="Voided transaction; excluded from the outstanding balance"
      className="inline-flex rounded-full border border-forest/10 bg-beige-light px-2 py-1 text-xs font-medium text-muted"
    >
      Voided · excluded from balance
    </span>
  ) : (
    <span className="text-forest">Active</span>
  );
}
