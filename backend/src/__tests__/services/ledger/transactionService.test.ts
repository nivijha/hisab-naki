import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Prisma } from '@prisma/client';
import type { Customer, Transaction } from '@prisma/client';
import { createTransactionService, type TransactionCustomerGateway } from '../../../services/ledger/transactionService.js';
import type {
  CreateTransactionRecordInput,
  CustomerTransactionGroup,
  TransactionHistoryPage,
  TransactionHistoryQuery,
  TransactionRepository,
  TransactionWithCustomer,
} from '../../../repositories/transactionRepository.js';

const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';
const CREATOR_ID = 'user-1';
const OTHER_CREATOR_ID = 'user-2';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'c-1',
    businessId: BUSINESS_ID,
    name: 'Raju',
    phone: null,
    email: null,
    notes: null,
    createdByUserId: CREATOR_ID,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    businessId: BUSINESS_ID,
    customerId: 'c-1',
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

class InMemoryTransactionRepository implements TransactionRepository {
  readonly rows: Transaction[] = [];
  readonly customers = new Map<string, Customer>();
  readonly createCalls: CreateTransactionRecordInput[] = [];
  nextId = 1;

  constructor(customers: Customer[] = []) {
    for (const c of customers) this.customers.set(c.id, c);
  }

  async create(input: CreateTransactionRecordInput): Promise<TransactionWithCustomer> {
    this.createCalls.push(input);
    const transaction = makeTransaction({
      id: `tx-${this.nextId++}`,
      businessId: input.businessId,
      createdByUserId: input.createdByUserId,
      customerId: input.customerId,
      type: input.type,
      amount: new Prisma.Decimal(input.amount),
      description: input.description,
    });
    this.rows.push(transaction);
    return { ...transaction, customer: this.customers.get(input.customerId) ?? null };
  }

  async findById(transactionId: string, businessId: string): Promise<TransactionWithCustomer | null> {
    const transaction = this.rows.find((t) => t.id === transactionId && t.businessId === businessId);
    if (!transaction) return null;
    return { ...transaction, customer: this.customers.get(transaction.customerId ?? '') ?? null };
  }

  async listForBusiness(businessId: string): Promise<TransactionWithCustomer[]> {
    return this.rows
      .filter((t) => t.businessId === businessId && t.status === 'ACTIVE')
      .slice()
      .reverse()
      .map((t) => ({ ...t, customer: this.customers.get(t.customerId ?? '') ?? null }));
  }

  async listForCustomer(customerId: string, businessId: string): Promise<Transaction[]> {
    return this.rows.filter(
      (t) => t.customerId === customerId && t.businessId === businessId && t.status === 'ACTIVE'
    );
  }

  async listCustomerTransactionGroups(businessId: string): Promise<CustomerTransactionGroup[]> {
    return [...this.customers.values()]
      .filter((c) => c.businessId === businessId)
      .map((c) => ({
        transactions: this.rows.filter(
          (t) => t.customerId === c.id && t.businessId === businessId && t.status === 'ACTIVE'
        ),
      }));
  }

  async findHistory(query: TransactionHistoryQuery): Promise<TransactionHistoryPage> {
    let matches = this.rows.filter(
      (t) => t.businessId === query.businessId && t.status === 'ACTIVE'
    );
    if (query.type) matches = matches.filter((t) => t.type === query.type);
    if (query.customerId) matches = matches.filter((t) => t.customerId === query.customerId);
    const from = query.from;
    const to = query.to;
    if (from) matches = matches.filter((t) => t.createdAt >= from);
    if (to) matches = matches.filter((t) => t.createdAt <= to);

    const sorted = matches.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const pageRows = sorted.slice((query.page - 1) * query.limit, query.page * query.limit);

    return {
      transactions: pageRows.map((t) => ({
        ...t,
        customer: this.customers.get(t.customerId ?? '') ?? null,
      })),
      total: matches.length,
    };
  }
}

type GatewayCalls = {
  ensureCustomer: Array<{ businessId: string; createdByUserId: string; name: string }>;
  getCustomerByName: Array<{ businessId: string; name: string }>;
};

function makeGateway(repo: InMemoryTransactionRepository) {
  const calls: GatewayCalls = { ensureCustomer: [], getCustomerByName: [] };
  const gateway: TransactionCustomerGateway = {
    ensureCustomer: async (businessId, createdByUserId, name) => {
      calls.ensureCustomer.push({ businessId, createdByUserId, name });
      for (const c of repo.customers.values()) {
        if (c.businessId === businessId && c.name.toLowerCase() === name.toLowerCase()) return c;
      }
      throw new Error('CUSTOMER_NOT_FOUND');
    },
    getCustomerByName: async (businessId, name) => {
      calls.getCustomerByName.push({ businessId, name });
      for (const c of repo.customers.values()) {
        if (c.businessId === businessId && c.name.toLowerCase() === name.toLowerCase()) {
          const transactions = await repo.listForCustomer(c.id, businessId);
          return {
            ...c,
            transactions,
            outstandingBalance: transactions.reduce(
              (sum, t) => sum.plus(t.amount),
              new Prisma.Decimal(0)
            ).toNumber(),
          };
        }
      }
      return null;
    },
  };
  return { gateway, calls };
}

describe('transaction service - creation', () => {
  it('passes distinct businessId and createdByUserId to the repository', async () => {
    const customer = makeCustomer();
    const repo = new InMemoryTransactionRepository([customer]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 450,
      type: 'CREDIT',
    });

    assert.strictEqual(repo.createCalls.length, 1);
    assert.strictEqual(repo.createCalls[0].businessId, BUSINESS_ID);
    assert.strictEqual(repo.createCalls[0].createdByUserId, CREATOR_ID);
    assert.notStrictEqual(repo.createCalls[0].businessId, repo.createCalls[0].createdByUserId);
    assert.ok(!('userId' in repo.createCalls[0]));
  });

  it('customer resolution uses the same businessId', async () => {
    const customer = makeCustomer();
    const repo = new InMemoryTransactionRepository([customer]);
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 100,
      type: 'CREDIT',
    });

    assert.strictEqual(calls.ensureCustomer.length, 1);
    assert.strictEqual(calls.ensureCustomer[0].businessId, BUSINESS_ID);
    assert.strictEqual(calls.ensureCustomer[0].createdByUserId, CREATOR_ID);
  });

  it('CREDIT increases outstanding', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 450,
      type: 'CREDIT',
    });

    assert.strictEqual(result.transaction.type, 'CREDIT');
    assert.strictEqual(result.outstandingBalance, 450);
  });

  it('PAYMENT decreases outstanding', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 200,
      type: 'PAYMENT',
    });

    assert.strictEqual(result.outstandingBalance, -200);
  });

  it('SALE and EXPENSE do not affect outstanding', async () => {
    const neutralTypes: Array<'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE'> = ['SALE', 'EXPENSE'];
    for (const type of neutralTypes) {
      const repo = new InMemoryTransactionRepository([makeCustomer()]);
      const { gateway } = makeGateway(repo);
      const service = createTransactionService(repo, gateway);
      const result = await service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 1000,
        type,
      });
      assert.strictEqual(result.outstandingBalance, 0, `${type} must not affect outstanding`);
    }
  });

  it('customer not found is rejected', async () => {
    const repo = new InMemoryTransactionRepository();
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Ghost',
        amount: 100,
        type: 'CREDIT',
      }),
      /CUSTOMER_NOT_FOUND/
    );
    assert.strictEqual(repo.rows.length, 0);
  });

  it('customer from another business cannot be resolved for this business', async () => {
    const foreignCustomer = makeCustomer({ businessId: OTHER_BUSINESS_ID });
    const repo = new InMemoryTransactionRepository([foreignCustomer]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 100,
        type: 'CREDIT',
      }),
      /CUSTOMER_NOT_FOUND/
    );
  });

  it('existing amount rounding and default description are preserved', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 100.6,
      type: 'CREDIT',
    });

    assert.strictEqual(result.transaction.amount.toNumber(), 101);
    assert.strictEqual(result.transaction.description, 'Ledger update');
  });
});

describe('transaction service - business-scoped reads', () => {
  it('listing returns only the supplied business ACTIVE transactions with formatted amounts', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    repo.rows.push(makeTransaction({ id: 'own', businessId: BUSINESS_ID }));
    repo.rows.push(makeTransaction({
      id: 'foreign',
      businessId: OTHER_BUSINESS_ID,
      customerId: 'c-foreign',
    }));
    repo.rows.push(makeTransaction({ id: 'voided', businessId: BUSINESS_ID, status: 'VOIDED' }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const list = await service.getTransactionsForUser(BUSINESS_ID);

    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, 'own');
    assert.strictEqual(typeof list[0].formattedAmount, 'string');
    assert.strictEqual(list[0].formattedAmount, '₹101');
  });

  it('detail lookup is business-scoped and can retrieve a VOIDED transaction', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    repo.rows.push(makeTransaction({ id: 'own', businessId: BUSINESS_ID, amount: new Prisma.Decimal('450.25') }));
    repo.rows.push(makeTransaction({ id: 'foreign', businessId: OTHER_BUSINESS_ID }));
    repo.rows.push(makeTransaction({ id: 'voided', businessId: BUSINESS_ID, status: 'VOIDED' }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const detail = await service.getTransactionById(BUSINESS_ID, 'own');
    assert.ok(detail);
    assert.strictEqual(detail.formattedAmount, '₹450');

    const voided = await service.getTransactionById(BUSINESS_ID, 'voided');
    assert.ok(voided, 'VOIDED detail remains available for audit');
    assert.strictEqual(await service.getTransactionById(BUSINESS_ID, 'foreign'), null);
    assert.strictEqual(await service.getTransactionById(OTHER_BUSINESS_ID, 'own'), null);
  });

  it('history is business-scoped with default page/limit', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    for (let i = 0; i < 12; i++) {
      repo.rows.push(makeTransaction({ id: `own-${i}`, businessId: BUSINESS_ID }));
    }
    repo.rows.push(makeTransaction({ id: 'foreign', businessId: OTHER_BUSINESS_ID }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.getTransactionHistory(BUSINESS_ID);

    assert.strictEqual(result.total, 12, 'foreign business excluded');
    assert.strictEqual(result.transactions.length, 10);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 10);
    assert.strictEqual(result.totalPages, 2);
  });

  it('history pagination, type and limit enforcement remain intact', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    for (let i = 0; i < 5; i++) {
      repo.rows.push(makeTransaction({ id: `c-${i}`, businessId: BUSINESS_ID, type: 'CREDIT' }));
      repo.rows.push(makeTransaction({ id: `p-${i}`, businessId: BUSINESS_ID, type: 'PAYMENT' }));
    }
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const credit = await service.getTransactionHistory(BUSINESS_ID, { type: 'CREDIT' });
    assert.strictEqual(credit.total, 5);
    assert.ok(credit.transactions.every((t) => t.type === 'CREDIT'));

    const clamped = await service.getTransactionHistory(BUSINESS_ID, { limit: 1000 });
    assert.strictEqual(clamped.limit, 100);
  });

  it('customer balance by name uses the supplied business', async () => {
    const customer = makeCustomer();
    const repo = new InMemoryTransactionRepository([customer]);
    repo.rows.push(makeTransaction({ businessId: BUSINESS_ID, amount: new Prisma.Decimal('100.50') }));
    repo.rows.push(makeTransaction({ id: 'p', businessId: BUSINESS_ID, type: 'PAYMENT', amount: new Prisma.Decimal('25.25') }));
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const balance = await service.getCustomerBalanceForName(BUSINESS_ID, 'Raju');

    assert.ok(balance);
    assert.strictEqual(balance.outstandingBalance, 75.25);
    assert.strictEqual(typeof balance.outstandingBalance, 'number');
    assert.strictEqual(balance.balanceText, '₹75.25');
    assert.strictEqual(calls.getCustomerByName[0].businessId, BUSINESS_ID);
    assert.strictEqual(await service.getCustomerBalanceForName(OTHER_BUSINESS_ID, 'Raju'), null);
  });
});

describe('transaction service - outstanding and errors', () => {
  it('multiple customers with fractional balances produce the exact total', async () => {
    const a = makeCustomer({ id: 'c-1' });
    const b = makeCustomer({ id: 'c-2', name: 'Amit' });
    const repo = new InMemoryTransactionRepository([a, b]);
    repo.rows.push(makeTransaction({ id: 'a1', customerId: 'c-1', amount: new Prisma.Decimal('100.50') }));
    repo.rows.push(makeTransaction({ id: 'a2', customerId: 'c-1', type: 'PAYMENT', amount: new Prisma.Decimal('25.25') }));
    repo.rows.push(makeTransaction({ id: 'b1', customerId: 'c-2', amount: new Prisma.Decimal('200.75') }));
    repo.rows.push(makeTransaction({ id: 'b2', customerId: 'c-2', type: 'PAYMENT', amount: new Prisma.Decimal('10.10') }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const total = await service.getTotalOutstandingForUser(BUSINESS_ID);

    assert.strictEqual(total.totalOutstanding, 265.9);
    assert.strictEqual(total.totalOutstandingText, '₹265.9');
  });

  it('VOIDED transactions do not contribute to outstanding', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    repo.rows.push(makeTransaction({ id: 'active', amount: new Prisma.Decimal('500') }));
    repo.rows.push(makeTransaction({ id: 'void', amount: new Prisma.Decimal('900'), status: 'VOIDED' }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const total = await service.getTotalOutstandingForUser(BUSINESS_ID);
    assert.strictEqual(total.totalOutstanding, 500);
  });

  it('integer totals remain exact', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    repo.rows.push(makeTransaction({ amount: new Prisma.Decimal(500) }));
    repo.rows.push(makeTransaction({ id: 'p', type: 'PAYMENT', amount: new Prisma.Decimal(200) }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    assert.strictEqual((await service.getTotalOutstandingForUser(BUSINESS_ID)).totalOutstanding, 300);
  });

  it('repository errors propagate through the service', async () => {
    const failingRepo: TransactionRepository = {
      create: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      listForBusiness: async () => { throw new Error('DB down'); },
      listForCustomer: async () => { throw new Error('DB down'); },
      listCustomerTransactionGroups: async () => { throw new Error('DB down'); },
      findHistory: async () => { throw new Error('DB down'); },
    };
    const customer = makeCustomer();
    const { gateway } = makeGateway(new InMemoryTransactionRepository([customer]));
    const service = createTransactionService(failingRepo, gateway);

    await assert.rejects(() => service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 100,
      type: 'CREDIT',
    }), /DB down/);
    await assert.rejects(() => service.getTransactionsForUser(BUSINESS_ID), /DB down/);
    await assert.rejects(() => service.getTransactionById(BUSINESS_ID, 'tx-1'), /DB down/);
    await assert.rejects(() => service.getTransactionHistory(BUSINESS_ID), /DB down/);
    await assert.rejects(() => service.getTotalOutstandingForUser(BUSINESS_ID), /DB down/);
  });

  it('API-facing response types remain compatible', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    repo.rows.push(makeTransaction({ amount: new Prisma.Decimal('10.10') }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const list = await service.getTransactionsForUser(BUSINESS_ID);
    assert.strictEqual(typeof list[0].formattedAmount, 'string');
    assert.ok(!(list[0].formattedAmount as string).includes('[object'));

    const balance = await service.getCustomerBalanceForName(BUSINESS_ID, 'Raju');
    assert.ok(balance);
    assert.strictEqual(typeof balance.outstandingBalance, 'number');
    assert.strictEqual(typeof balance.balanceText, 'string');

    const total = await service.getTotalOutstandingForUser(BUSINESS_ID);
    assert.strictEqual(typeof total.totalOutstanding, 'number');
    assert.strictEqual(typeof total.totalOutstandingText, 'string');
  });
});
