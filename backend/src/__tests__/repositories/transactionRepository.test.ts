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
    create: [] as Prisma.TransactionCreateArgs[],
    transactionFindFirst: [] as Prisma.TransactionFindFirstArgs[],
    transactionFindMany: [] as Prisma.TransactionFindManyArgs[],
    transactionCount: [] as Prisma.TransactionCountArgs[],
    customerFindMany: [] as Prisma.CustomerFindManyArgs[],
  };

  // Test double: only the delegates used by PrismaTransactionRepository are implemented.
  const client = {
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
    });

    const data = calls.create[0].data as Record<string, unknown>;
    assert.strictEqual(data.businessId, BUSINESS_ID);
    assert.strictEqual(data.createdByUserId, CREATOR_ID);
    assert.strictEqual(data.customerId, CUSTOMER_ID);
    assert.strictEqual(data.type, 'PAYMENT');
    assert.strictEqual(data.amount, decimalAmount);
    assert.strictEqual(data.description, 'payment');
    assert.ok(!('userId' in data));
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
    assert.deepStrictEqual(calls.customerFindMany[0].where, { businessId: BUSINESS_ID });
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
