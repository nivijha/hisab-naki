import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Prisma, type Customer, type PrismaClient } from '@prisma/client';
import {
  PrismaCustomerRepository,
  type CustomerWithTransactions,
} from '../../repositories/customerRepository.js';

const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';
const CREATOR_ID = 'user-1';
const CUSTOMER_ID = 'c-1';

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    name: 'Raju',
    phone: null,
    email: null,
    notes: null,
    createdByUserId: CREATOR_ID,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

type MockConfig = {
  createResult?: Customer;
  updateCount?: number;
  findFirstResult?: Customer | CustomerWithTransactions | null;
  findManyResult?: CustomerWithTransactions[];
};

function makeMockPrisma(config: MockConfig = {}) {
  const calls = {
    create: [] as Prisma.CustomerCreateArgs[],
    updateMany: [] as Prisma.CustomerUpdateManyArgs[],
    findFirst: [] as Prisma.CustomerFindFirstArgs[],
    findMany: [] as Prisma.CustomerFindManyArgs[],
  };

  // Test double: only the delegates used by PrismaCustomerRepository are implemented.
  const client = {
    customer: {
      create: async (args: Prisma.CustomerCreateArgs): Promise<Customer> => {
        calls.create.push(args);
        return config.createResult ?? makeCustomer();
      },
      updateMany: async (args: Prisma.CustomerUpdateManyArgs): Promise<Prisma.BatchPayload> => {
        calls.updateMany.push(args);
        return { count: config.updateCount ?? 1 };
      },
      findFirst: async (
        args: Prisma.CustomerFindFirstArgs
      ): Promise<Customer | CustomerWithTransactions | null> => {
        calls.findFirst.push(args);
        return config.findFirstResult ?? null;
      },
      findMany: async (args: Prisma.CustomerFindManyArgs): Promise<CustomerWithTransactions[]> => {
        calls.findMany.push(args);
        return config.findManyResult ?? [];
      },
    },
  } as unknown as PrismaClient;

  return { client, calls };
}

describe('PrismaCustomerRepository - multi-tenant schema', () => {
  it('creates a customer with businessId and createdByUserId', async () => {
    const { client, calls } = makeMockPrisma({ createResult: makeCustomer() });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.create({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      name: 'Raju',
      phone: '9876543210',
    });

    assert.strictEqual(result.id, CUSTOMER_ID);
    assert.strictEqual(calls.create.length, 1);
    const data = calls.create[0].data as Record<string, unknown>;
    assert.strictEqual(data.businessId, BUSINESS_ID);
    assert.strictEqual(data.createdByUserId, CREATOR_ID);
    assert.strictEqual(data.name, 'Raju');
    assert.strictEqual(data.phone, '9876543210');
    assert.ok(!('userId' in data));
  });

  it('normalizes an omitted phone to null on create', async () => {
    const { client, calls } = makeMockPrisma({ createResult: makeCustomer() });
    const repo = new PrismaCustomerRepository(client);

    await repo.create({ businessId: BUSINESS_ID, createdByUserId: CREATOR_ID, name: 'Raju' });

    const data = calls.create[0].data as Record<string, unknown>;
    assert.strictEqual(data.phone, null);
  });

  it('lists customers scoped by businessId, newest first, with transactions', async () => {
    const { client, calls } = makeMockPrisma({
      findManyResult: [{ ...makeCustomer(), transactions: [] }],
    });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.listForBusiness(BUSINESS_ID);

    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(calls.findMany[0].where, {
      businessId: BUSINESS_ID,
      deletedAt: null,
    });
    assert.deepStrictEqual(calls.findMany[0].orderBy, { createdAt: 'desc' });
    assert.deepStrictEqual(calls.findMany[0].include, { transactions: true });
  });

  it('finds a customer by both customer ID and business ID', async () => {
    const { client, calls } = makeMockPrisma({
      findFirstResult: { ...makeCustomer(), transactions: [] },
    });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.findById(BUSINESS_ID, CUSTOMER_ID);

    assert.ok(result);
    assert.deepStrictEqual(calls.findFirst[0].where, {
      id: CUSTOMER_ID,
      businessId: BUSINESS_ID,
      deletedAt: null,
    });
    assert.deepStrictEqual(calls.findFirst[0].include, {
      transactions: { orderBy: { createdAt: 'desc' } },
    });
  });

  it('finds a customer by name within a business (case-insensitive)', async () => {
    const { client, calls } = makeMockPrisma({
      findFirstResult: { ...makeCustomer(), transactions: [] },
    });
    const repo = new PrismaCustomerRepository(client);

    await repo.findByName(BUSINESS_ID, 'raju');

    assert.deepStrictEqual(calls.findFirst[0].where, {
      businessId: BUSINESS_ID,
      deletedAt: null,
      name: { equals: 'raju', mode: 'insensitive' },
    });
  });

  it('duplicate-name check is business-scoped and returns the existing customer', async () => {
    const existing = makeCustomer({ id: 'existing-customer' });
    const { client, calls } = makeMockPrisma({ findFirstResult: existing });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.findByNameForDuplicateCheck(BUSINESS_ID, 'RAJU');

    assert.strictEqual(result?.id, 'existing-customer');
    assert.deepStrictEqual(calls.findFirst[0].where, {
      businessId: BUSINESS_ID,
      deletedAt: null,
      name: { equals: 'RAJU', mode: 'insensitive' },
    });
  });

  it('not-found behavior: findById returns null when no match', async () => {
    const { client } = makeMockPrisma({ findFirstResult: null });
    const repo = new PrismaCustomerRepository(client);

    assert.strictEqual(await repo.findById(BUSINESS_ID, 'missing'), null);
    assert.strictEqual(await repo.findByName(BUSINESS_ID, 'Nobody'), null);
    assert.strictEqual(await repo.findByNameForDuplicateCheck(BUSINESS_ID, 'Nobody'), null);
  });

  it('updates a customer scoped by businessId and returns the updated row', async () => {
    const updated = makeCustomer({ name: 'Raju Sharma' });
    const { client, calls } = makeMockPrisma({ updateCount: 1, findFirstResult: updated });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.update(BUSINESS_ID, CUSTOMER_ID, { name: 'Raju Sharma' });

    assert.strictEqual(result?.name, 'Raju Sharma');
    assert.deepStrictEqual(calls.updateMany[0].where, {
      id: CUSTOMER_ID,
      businessId: BUSINESS_ID,
      deletedAt: null,
    });
    assert.deepStrictEqual(calls.updateMany[0].data, { name: 'Raju Sharma' });
    assert.deepStrictEqual(calls.findFirst[0].where, {
      id: CUSTOMER_ID,
      businessId: BUSINESS_ID,
      deletedAt: null,
    });
  });

  it('does not allow cross-business modification via update', async () => {
    const { client, calls } = makeMockPrisma({ updateCount: 0 });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.update(OTHER_BUSINESS_ID, CUSTOMER_ID, { name: 'Hacked' });

    assert.strictEqual(result, null);
    assert.deepStrictEqual(calls.updateMany[0].where, {
      id: CUSTOMER_ID,
      businessId: OTHER_BUSINESS_ID,
      deletedAt: null,
    });
    assert.strictEqual(calls.findFirst.length, 0, 'no re-read after zero-row update');
  });

  it('soft-deletes a customer by setting deletedAt within the business', async () => {
    const { client, calls } = makeMockPrisma({ updateCount: 1 });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.delete(BUSINESS_ID, CUSTOMER_ID);

    assert.deepStrictEqual(result, { status: 'DELETED' });
    assert.deepStrictEqual(calls.updateMany[0].where, {
      id: CUSTOMER_ID,
      businessId: BUSINESS_ID,
      deletedAt: null,
    });
    const data = calls.updateMany[0].data as Record<string, unknown>;
    assert.ok(data.deletedAt instanceof Date, 'deletedAt must be a timestamp');
    assert.strictEqual(Object.keys(data).length, 1, 'only deletedAt is modified');
  });

  it('soft deletion does not delete transaction rows', async () => {
    const { client, calls } = makeMockPrisma({ updateCount: 1 });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.delete(BUSINESS_ID, CUSTOMER_ID);

    assert.deepStrictEqual(result, { status: 'DELETED' });
    assert.strictEqual(calls.updateMany.length, 1);
    assert.strictEqual(calls.findFirst.length, 0);
  });

  it('returns NOT_FOUND when soft-deleting a customer in another business', async () => {
    const { client, calls } = makeMockPrisma({ updateCount: 0 });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.delete(OTHER_BUSINESS_ID, CUSTOMER_ID);

    assert.deepStrictEqual(result, { status: 'NOT_FOUND' });
    assert.deepStrictEqual(calls.updateMany[0].where, {
      id: CUSTOMER_ID,
      businessId: OTHER_BUSINESS_ID,
      deletedAt: null,
    });
  });

  it('returns NOT_FOUND when the customer is already soft-deleted', async () => {
    const { client, calls } = makeMockPrisma({ updateCount: 0 });
    const repo = new PrismaCustomerRepository(client);

    const result = await repo.delete(BUSINESS_ID, CUSTOMER_ID);

    assert.deepStrictEqual(result, { status: 'NOT_FOUND' });
    assert.deepStrictEqual(calls.updateMany[0].where, {
      id: CUSTOMER_ID,
      businessId: BUSINESS_ID,
      deletedAt: null,
    });
  });
});
