import type { TransactionStatus } from '@/lib/transaction-contract';

export function TransactionRowStatus({ status }: { status: TransactionStatus }) {
  if (status === 'ACTIVE') return null;

  return (
    <span
      className="mt-1 inline-flex rounded-full border border-forest/10 bg-beige-light px-2 py-1 text-xs font-medium text-muted"
    >
      <span aria-hidden="true">Voided · excluded from balance</span>
      <span className="sr-only">Voided transaction; excluded from the outstanding balance</span>
    </span>
  );
}

export function TransactionDetailStatus({ status }: { status: TransactionStatus }) {
  return status === 'VOIDED' ? (
    <span
      className="inline-flex rounded-full border border-forest/10 bg-beige-light px-2 py-1 text-xs font-medium text-muted"
    >
      <span aria-hidden="true">Voided · excluded from balance</span>
      <span className="sr-only">Voided transaction; excluded from the outstanding balance</span>
    </span>
  ) : (
    <span className="text-forest">Active</span>
  );
}
