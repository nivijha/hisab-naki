import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Prisma, type Customer, type PrismaClient, type Transaction } from '@prisma/client';
import {
  PrismaTransactionRepository,
  type TransactionWithCustomer,
} from '../../repositories/transactionRepository.js';

const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';
const CREATOR_ID = 'user-1';
const TRANSACTION_ID = 'tx-1';
const CUSTOMER_ID = 'c-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: TRANSACTION_ID,
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_ID,
    type: 'CREDIT',
    status: 'ACTIVE',
    amount: new Prisma.Decimal('100.50'),
    saleMode: null,
    paymentMethod: null,
    openingDirection: null,
    description: 'test',
    occurredAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    createdByUserId: CREATOR_ID,
    voidedAt: null,
    voidedByUserId: null,
    voidReason: null,
    originalTransactionId: null,
    idempotencyKey: null,
    ...overrides,
  };
}

function makeCustomer(): Customer {
  return {
    id: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    name: 'Raju',
    phone: null,
    email: null,
    notes: null,
    createdByUserId: CREATOR_ID,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
  };
}

type MockConfig = {
  createResult?: Transaction;
  findFirstResult?: TransactionWithCustomer | null;
  transactionFindManyResult?: TransactionWithCustomer[];
  customerFindManyResult?: Array<Customer & { transactions: Transaction[] }>;
  countResult?: number;
};

function makeMockPrisma(config: MockConfig = {}) {
  const calls = {
    locks: [] as unknown[],
    create: [] as Prisma.TransactionCreateArgs[],
    transactionFindFirst: [] as Prisma.TransactionFindFirstArgs[],
    transactionFindMany: [] as Prisma.TransactionFindManyArgs[],
    transactionCount: [] as Prisma.TransactionCountArgs[],
    customerFindMany: [] as Prisma.CustomerFindManyArgs[],
  };

  // Test double: only the delegates used by PrismaTransactionRepository are implemented.
  const client = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    $executeRaw: async (...args: unknown[]) => {
      calls.locks.push(args);
      return 1;
    },
    transaction: {
      create: async (args: Prisma.TransactionCreateArgs): Promise<Transaction> => {
        calls.create.push(args);
        return config.createResult ?? makeTransaction();
      },
      findFirst: async (
        args: Prisma.TransactionFindFirstArgs
      ): Promise<TransactionWithCustomer | null> => {
        calls.transactionFindFirst.push(args);
        return config.findFirstResult ?? null;
      },
      findMany: async (
        args: Prisma.TransactionFindManyArgs
      ): Promise<TransactionWithCustomer[]> => {
        calls.transactionFindMany.push(args);
        return config.transactionFindManyResult ?? [];
      },
      count: async (args: Prisma.TransactionCountArgs): Promise<number> => {
        calls.transactionCount.push(args);
        return config.countResult ?? 0;
      },
    },
    customer: {
      findMany: async (
        args: Prisma.CustomerFindManyArgs
      ): Promise<Array<Customer & { transactions: Transaction[] }>> => {
        calls.customerFindMany.push(args);
        return config.customerFindManyResult ?? [];
      },
    },
  } as unknown as PrismaClient;

  return { client, calls };
}

describe('PrismaTransactionRepository - multi-tenant schema', () => {
  it('creates a transaction with businessId and createdByUserId, preserving Decimal', async () => {
    const decimalAmount = new Prisma.Decimal('250.75');
    const { client, calls } = makeMockPrisma({ createResult: makeTransaction() });
    const repo = new PrismaTransactionRepository(client);

    await repo.create({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerId: CUSTOMER_ID,
      type: 'PAYMENT',
      amount: decimalAmount,
      description: 'payment',
      paymentMethod: 'CASH',
    });

    const data = calls.create[0].data as Record<string, unknown>;
    assert.strictEqual(data.businessId, BUSINESS_ID);
    assert.strictEqual(data.createdByUserId, CREATOR_ID);
    assert.strictEqual(data.customerId, CUSTOMER_ID);
    assert.strictEqual(data.type, 'PAYMENT');
    assert.strictEqual(data.amount, decimalAmount);
    assert.strictEqual(data.description, 'payment');
    assert.strictEqual(data.paymentMethod, 'CASH');
    assert.strictEqual(data.saleMode, null);
    assert.strictEqual(data.openingDirection, null);
    assert.strictEqual(data.originalTransactionId, null);
    assert.ok(!('userId' in data));
  });

  it('persists conditional sale fields without inventing a customer', async () => {
    const { client, calls } = makeMockPrisma({ createResult: makeTransaction() });
    const repo = new PrismaTransactionRepository(client);

    await repo.create({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerId: null,
      type: 'SALE',
      amount: 500,
      description: 'cash sale',
      saleMode: 'CASH',
      paymentMethod: 'UPI',
    });

    const data = calls.create[0].data as Record<string, unknown>;
    assert.strictEqual(data.customerId, null);
    assert.strictEqual(data.saleMode, 'CASH');
    assert.strictEqual(data.paymentMethod, 'UPI');
    assert.strictEqual(data.openingDirection, null);
    assert.strictEqual(data.originalTransactionId, null);
  });

  it('findById filters by both transaction ID and businessId', async () => {
    const { client, calls } = makeMockPrisma({ findFirstResult: { ...makeTransaction(), customer: makeCustomer() } });
    const repo = new PrismaTransactionRepository(client);

    const result = await repo.findById(TRANSACTION_ID, BUSINESS_ID);

    assert.ok(result);
    assert.deepStrictEqual(calls.transactionFindFirst[0].where, {
      id: TRANSACTION_ID,
      businessId: BUSINESS_ID,
    });
    assert.deepStrictEqual(calls.transactionFindFirst[0].include, { customer: true });
  });

  it('findById does not find a transaction from another business', async () => {
    const { client, calls } = makeMockPrisma({ findFirstResult: null });
    const repo = new PrismaTransactionRepository(client);

    assert.strictEqual(await repo.findById(TRANSACTION_ID, OTHER_BUSINESS_ID), null);
    assert.deepStrictEqual(calls.transactionFindFirst[0].where, {
      id: TRANSACTION_ID,
      businessId: OTHER_BUSINESS_ID,
    });
  });

  it('listForBusiness filters by businessId and ACTIVE status, newest first', async () => {
    const { client, calls } = makeMockPrisma();
    const repo = new PrismaTransactionRepository(client);

    await repo.listForBusiness(BUSINESS_ID);

    assert.deepStrictEqual(calls.transactionFindMany[0].where, {
      businessId: BUSINESS_ID,
      status: 'ACTIVE',
    });
    assert.deepStrictEqual(calls.transactionFindMany[0].orderBy, { createdAt: 'desc' });
    assert.deepStrictEqual(calls.transactionFindMany[0].include, { customer: true });
  });

  it('listForCustomer is scoped to customer and business and excludes VOIDED', async () => {
    const { client, calls } = makeMockPrisma();
    const repo = new PrismaTransactionRepository(client);

    await repo.listForCustomer(CUSTOMER_ID, BUSINESS_ID);

    assert.deepStrictEqual(calls.transactionFindMany[0].where, {
      customerId: CUSTOMER_ID,
      businessId: BUSINESS_ID,
      status: 'ACTIVE',
    });
  });

  it('listCustomerTransactionGroups aggregates only the given business and ACTIVE transactions', async () => {
    const { client, calls } = makeMockPrisma({
      customerFindManyResult: [{ ...makeCustomer(), transactions: [makeTransaction()] }],
    });
    const repo = new PrismaTransactionRepository(client);

    const result = await repo.listCustomerTransactionGroups(BUSINESS_ID);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].transactions[0].amount instanceof Prisma.Decimal, true);
    assert.deepStrictEqual(calls.customerFindMany[0].where, {
      businessId: BUSINESS_ID,
      deletedAt: null,
    });
    assert.deepStrictEqual(calls.customerFindMany[0].include, {
      transactions: { where: { status: 'ACTIVE' } },
    });
  });

  it('findHistory scopes where by businessId and ACTIVE, and preserves pagination/order', async () => {
    const { client, calls } = makeMockPrisma();
    const repo = new PrismaTransactionRepository(client);

    await repo.findHistory({ businessId: BUSINESS_ID, page: 3, limit: 7 });

    assert.deepStrictEqual(calls.transactionFindMany[0].where, {
      businessId: BUSINESS_ID,
      status: 'ACTIVE',
    });
    assert.strictEqual(calls.transactionFindMany[0].skip, 14);
    assert.strictEqual(calls.transactionFindMany[0].take, 7);
    assert.deepStrictEqual(calls.transactionFindMany[0].orderBy, { createdAt: 'desc' });
    assert.deepStrictEqual(calls.transactionCount[0].where, calls.transactionFindMany[0].where);
  });

  it('findHistory applies type, customer and date filters within business scope', async () => {
    const { client, calls } = makeMockPrisma();
    const repo = new PrismaTransactionRepository(client);
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-31T00:00:00.000Z');

    await repo.findHistory({
      businessId: BUSINESS_ID,
      page: 1,
      limit: 10,
      type: 'CREDIT',
      customerId: CUSTOMER_ID,
      from,
      to,
    });

    assert.deepStrictEqual(calls.transactionFindMany[0].where, {
      businessId: BUSINESS_ID,
      status: 'ACTIVE',
      type: 'CREDIT',
      customerId: CUSTOMER_ID,
      createdAt: { gte: from, lte: to },
    });
  });

  it('history cannot cross business boundaries', async () => {
    const { client, calls } = makeMockPrisma();
    const repo = new PrismaTransactionRepository(client);

    await repo.findHistory({ businessId: OTHER_BUSINESS_ID, page: 1, limit: 10 });

    assert.deepStrictEqual(calls.transactionFindMany[0].where, {
      businessId: OTHER_BUSINESS_ID,
      status: 'ACTIVE',
    });
    assert.deepStrictEqual(calls.transactionCount[0].where, {
      businessId: OTHER_BUSINESS_ID,
      status: 'ACTIVE',
    });
  });

  it('returns total count with the paginated page', async () => {
    const { client } = makeMockPrisma({
      transactionFindManyResult: [{ ...makeTransaction(), customer: makeCustomer() }],
      countResult: 42,
    });
    const repo = new PrismaTransactionRepository(client);

    const result = await repo.findHistory({ businessId: BUSINESS_ID, page: 1, limit: 10 });

    assert.strictEqual(result.transactions.length, 1);
    assert.strictEqual(result.total, 42);
  });
});

describe('PrismaTransactionRepository - idempotency', () => {
  const input = {
    businessId: BUSINESS_ID,
    createdByUserId: CREATOR_ID,
    customerId: CUSTOMER_ID,
    type: 'CREDIT' as const,
    amount: 450,
    description: 'udhaar',
    idempotencyKey: 'key-1',
  };

  it('takes an advisory lock and persists the idempotency key', async () => {
    const { client, calls } = makeMockPrisma();
    const repo = new PrismaTransactionRepository(client);

    await repo.createIdempotent(input);

    assert.strictEqual(calls.locks.length, 1);
    const data = calls.create[0].data as Record<string, unknown>;
    assert.strictEqual(data.idempotencyKey, 'key-1');
    assert.strictEqual(data.businessId, BUSINESS_ID);
    assert.strictEqual(data.saleMode, null);
    assert.strictEqual(data.paymentMethod, null);
    assert.strictEqual(data.openingDirection, null);
    assert.strictEqual(data.originalTransactionId, null);
  });

  it('returns the existing transaction without creating when the key already exists', async () => {
    const existing = { ...makeTransaction(), customer: makeCustomer() };
    const { client, calls } = makeMockPrisma({ findFirstResult: existing });
    const repo = new PrismaTransactionRepository(client);

    const result = await repo.createIdempotent(input);

    assert.strictEqual(result.transaction.id, existing.id);
    assert.strictEqual(result.created, false);
    assert.strictEqual(calls.create.length, 0);
  });

  it('handles a unique-constraint race by returning the winning transaction', async () => {
    const winner = { ...makeTransaction(), customer: makeCustomer() };
    const { client } = makeMockPrisma();
    const mutable = client as unknown as {
      transaction: {
        create: (args: Prisma.TransactionCreateArgs) => Promise<Transaction>;
        findFirst: (args: Prisma.TransactionFindFirstArgs) => Promise<TransactionWithCustomer | null>;
      };
    };
    let findCount = 0;
    mutable.transaction.findFirst = async () => {
      findCount += 1;
      return findCount === 1 ? null : winner;
    };
    mutable.transaction.create = async () => {
      throw new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
    };
    const repo = new PrismaTransactionRepository(client);

    const result = await repo.createIdempotent(input);
    assert.strictEqual(result.transaction.id, winner.id);
    assert.strictEqual(result.created, false);
    assert.strictEqual(findCount, 2);
  });

  it('finds by idempotency key scoped to business', async () => {
    const { client, calls } = makeMockPrisma();
    const repo = new PrismaTransactionRepository(client);
    await repo.findByIdempotencyKey(BUSINESS_ID, 'key-1');
    assert.deepStrictEqual(calls.transactionFindFirst[0].where, {
      businessId: BUSINESS_ID,
      idempotencyKey: 'key-1',
    });
  });
});
