import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Prisma } from '@prisma/client';
import { HttpError } from '../../../middleware/authenticate.js';
import type { Customer, Transaction } from '@prisma/client';
import { createTransactionService, type TransactionCustomerGateway } from '../../../services/ledger/transactionService.js';
import type {
  CreateTransactionRecordInput,
  CustomerTransactionGroup,
  IdempotentCreateResult,
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
      saleMode: input.saleMode ?? null,
      paymentMethod: input.paymentMethod ?? null,
      openingDirection: input.openingDirection ?? null,
      originalTransactionId: input.originalTransactionId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    this.rows.push(transaction);
    return {
      ...transaction,
      customer: this.customers.get(input.customerId ?? '') ?? null,
    };
  }

  async createIdempotent(input: CreateTransactionRecordInput): Promise<IdempotentCreateResult> {
    if (input.idempotencyKey) {
      const existing = this.rows.find(
        (t) => t.businessId === input.businessId && t.idempotencyKey === input.idempotencyKey
      );
      if (existing) {
        return {
          transaction: { ...existing, customer: this.customers.get(existing.customerId ?? '') ?? null },
          created: false,
        };
      }
    }
    const created = await this.create(input);
    return { transaction: created, created: true };
  }

  async findByIdempotencyKey(
    businessId: string,
    idempotencyKey: string
  ): Promise<TransactionWithCustomer | null> {
    const transaction = this.rows.find(
      (t) => t.businessId === businessId && t.idempotencyKey === idempotencyKey
    );
    if (!transaction) return null;
    return { ...transaction, customer: this.customers.get(transaction.customerId ?? '') ?? null };
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
      .filter((c) => c.businessId === businessId && c.deletedAt === null)
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
  getCustomerById: Array<{ businessId: string; customerId: string }>;
};

function makeGateway(repo: InMemoryTransactionRepository) {
  const calls: GatewayCalls = {
    ensureCustomer: [],
    getCustomerByName: [],
    getCustomerById: [],
  };
  const gateway: TransactionCustomerGateway = {
    ensureCustomer: async (businessId, createdByUserId, name) => {
      calls.ensureCustomer.push({ businessId, createdByUserId, name });
      for (const c of repo.customers.values()) {
        if (
          c.businessId === businessId &&
          c.deletedAt === null &&
          c.name.toLowerCase() === name.toLowerCase()
        ) {
          return c;
        }
      }
      throw new Error('CUSTOMER_NOT_FOUND');
    },
    getCustomerById: async (businessId, customerId) => {
      calls.getCustomerById.push({ businessId, customerId });
      const customer = repo.customers.get(customerId);
      return customer && customer.businessId === businessId && customer.deletedAt === null
        ? customer
        : null;
    },
    getCustomerByName: async (businessId, name) => {
      calls.getCustomerByName.push({ businessId, name });
      for (const c of repo.customers.values()) {
        if (
          c.businessId === businessId &&
          c.deletedAt === null &&
          c.name.toLowerCase() === name.toLowerCase()
        ) {
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
      paymentMethod: 'CASH',
    });

    assert.strictEqual(result.outstandingBalance, -200);
  });

  it('cash SALE and EXPENSE do not affect outstanding', async () => {
    const cases: Array<{
      type: 'SALE' | 'EXPENSE';
      customerName?: string;
      saleMode?: 'CASH' | 'CREDIT';
    }> = [
      { type: 'SALE', customerName: 'Raju', saleMode: 'CASH' },
      { type: 'EXPENSE' },
    ];

    for (const testCase of cases) {
      const repo = new InMemoryTransactionRepository([makeCustomer()]);
      const { gateway } = makeGateway(repo);
      const service = createTransactionService(repo, gateway);
      const result = await service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: testCase.customerName,
        amount: 1000,
        type: testCase.type,
        saleMode: testCase.saleMode,
        paymentMethod: 'CASH',
      });
      assert.strictEqual(
        result.outstandingBalance,
        0,
        `${testCase.type} must not affect outstanding`
      );
    }
  });

  it('credit SALE increases outstanding while cash SALE does not', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const creditSale = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 1000,
      type: 'SALE',
      saleMode: 'CREDIT',
    });
    assert.strictEqual(creditSale.outstandingBalance, 1000);

    const cashSale = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 2500,
      type: 'SALE',
      saleMode: 'CASH',
      paymentMethod: 'CASH',
    });
    assert.strictEqual(cashSale.outstandingBalance, 1000);
  });

  it('CREDIT 450.75 followed by PAYMENT 100.50 leaves 350.25 outstanding', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const credit = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 450.75,
      type: 'CREDIT',
    });
    assert.strictEqual(credit.outstandingBalance, 450.75);

    const payment = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 100.50,
      type: 'PAYMENT',
      paymentMethod: 'CASH',
    });
    assert.strictEqual(payment.outstandingBalance, 350.25);
  });

  it('OPENING_BALANCE INCREASE raises the customer outstanding balance', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 500,
      type: 'OPENING_BALANCE',
      openingDirection: 'INCREASE',
    });
    assert.strictEqual(result.transaction.type, 'OPENING_BALANCE');
    assert.strictEqual(result.outstandingBalance, 500);
  });

  it('OPENING_BALANCE DECREASE lowers the customer outstanding balance', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 500,
      type: 'OPENING_BALANCE',
      openingDirection: 'DECREASE',
    });
    assert.strictEqual(result.outstandingBalance, -500);
  });

  it('rejects OPENING_BALANCE without a customer', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        amount: 500,
        type: 'OPENING_BALANCE',
        openingDirection: 'INCREASE',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 400);
        assert.match(error.message, /Customer name or customer ID is required for OPENING_BALANCE/);
        return true;
      }
    );
    assert.strictEqual(repo.rows.length, 0);
  });

  it('SALE_RETURN reduces the customer outstanding balance', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const credit = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 200,
      type: 'CREDIT',
    });
    assert.strictEqual(credit.outstandingBalance, 200);

    const saleReturn = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 50,
      type: 'SALE_RETURN',
    });
    assert.strictEqual(saleReturn.outstandingBalance, 150);
  });

  it('REFUND increases the customer outstanding balance', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const credit = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 200,
      type: 'CREDIT',
    });
    assert.strictEqual(credit.outstandingBalance, 200);

    const refund = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 50,
      type: 'REFUND',
    });
    assert.strictEqual(refund.outstandingBalance, 250);
  });

  it('rejects SALE_RETURN without a customer', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        amount: 100,
        type: 'SALE_RETURN',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 400);
        assert.match(error.message, /Customer name or customer ID is required for SALE_RETURN/);
        return true;
      }
    );
    assert.strictEqual(repo.rows.length, 0);
  });

  it('rejects OPENING_BALANCE without a direction', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 100,
        type: 'OPENING_BALANCE',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 400);
        assert.match(error.message, /Required for OPENING_BALANCE/);
        return true;
      }
    );
    assert.strictEqual(repo.rows.length, 0);
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

  it('fractional amounts are preserved exactly and the default description is set', async () => {
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

    assert.ok(result.transaction.amount.equals(new Prisma.Decimal('100.60')));
    assert.strictEqual(result.transaction.description, 'Ledger update');
  });

  it('fractional amounts with up to two decimals are stored without changing value', async () => {
    for (const amount of [450.75, 25.25, 100.50]) {
      const repo = new InMemoryTransactionRepository([makeCustomer()]);
      const { gateway } = makeGateway(repo);
      const service = createTransactionService(repo, gateway);

      const result = await service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount,
        type: 'CREDIT',
      });

      assert.ok(result.transaction.amount.equals(new Prisma.Decimal(amount)), `${amount} preserved`);
      assert.ok(
        new Prisma.Decimal(repo.createCalls[0].amount).equals(new Prisma.Decimal(amount)),
        `${amount} stored without changing value`
      );
    }
  });

  it('fractional CREDIT amounts produce fractional outstanding balance', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 450.75,
      type: 'CREDIT',
    });

    assert.strictEqual(result.outstandingBalance, 450.75);
  });

  it('unsupported amount precision is rejected', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 100.555,
        type: 'CREDIT',
      }),
      /Amount supports at most two decimal places/
    );
    assert.strictEqual(repo.rows.length, 0);
  });

  it('PAYMENT requires a payment method', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 200,
        type: 'PAYMENT',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 400);
        assert.match(error.message, /paymentMethod is required for PAYMENT/);
        return true;
      }
    );
    assert.strictEqual(calls.ensureCustomer.length, 0);
    assert.strictEqual(repo.rows.length, 0);
  });

  it('PAYMENT persists its payment method', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 200,
      type: 'PAYMENT',
      paymentMethod: 'UPI',
    });

    assert.strictEqual(repo.createCalls[0].paymentMethod, 'UPI');
    assert.strictEqual(repo.createCalls[0].saleMode, null);
    assert.strictEqual(repo.rows[0].paymentMethod, 'UPI');
  });

  it('cash SALE persists sale mode and payment method without requiring a customer', async () => {
    const repo = new InMemoryTransactionRepository();
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      amount: 1000,
      type: 'SALE',
      saleMode: 'CASH',
      paymentMethod: 'CASH',
    });

    assert.strictEqual(calls.ensureCustomer.length, 0);
    assert.strictEqual(repo.createCalls[0].customerId, null);
    assert.strictEqual(repo.createCalls[0].saleMode, 'CASH');
    assert.strictEqual(repo.createCalls[0].paymentMethod, 'CASH');
    assert.strictEqual(result.customer, null);
    assert.strictEqual(result.outstandingBalance, 0);
  });

  it('cash SALE requires a payment method', async () => {
    const repo = new InMemoryTransactionRepository();
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        amount: 1000,
        type: 'SALE',
        saleMode: 'CASH',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 400);
        assert.match(error.message, /paymentMethod is required for a cash sale/);
        return true;
      }
    );
  });

  it('credit SALE requires a customer and leaves payment method empty', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 1000,
      type: 'SALE',
      saleMode: 'CREDIT',
    });

    assert.strictEqual(repo.createCalls[0].customerId, 'c-1');
    assert.strictEqual(repo.createCalls[0].saleMode, 'CREDIT');
    assert.strictEqual(repo.createCalls[0].paymentMethod, null);
  });

  it('credit SALE rejects a payment method and a missing customer', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 1000,
        type: 'SALE',
        saleMode: 'CREDIT',
        paymentMethod: 'CASH',
      }),
      /paymentMethod must not be set for a credit sale/
    );

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        amount: 1000,
        type: 'SALE',
        saleMode: 'CREDIT',
      }),
      /Customer name or customer ID is required for a credit sale/
    );

    assert.strictEqual(repo.rows.length, 0);
  });

  it('EXPENSE records without a customer and persists its payment method', async () => {
    const repo = new InMemoryTransactionRepository();
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const result = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      amount: 250,
      type: 'EXPENSE',
      paymentMethod: 'BANK_TRANSFER',
    });

    assert.strictEqual(calls.ensureCustomer.length, 0);
    assert.strictEqual(calls.getCustomerById.length, 0);
    assert.strictEqual(repo.createCalls[0].customerId, null);
    assert.strictEqual(repo.createCalls[0].saleMode, null);
    assert.strictEqual(repo.createCalls[0].paymentMethod, 'BANK_TRANSFER');
    assert.strictEqual(result.transaction.customerId, null);
    assert.strictEqual(result.customer, null);
  });

  it('EXPENSE rejects customer fields', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 250,
        type: 'EXPENSE',
        paymentMethod: 'CASH',
      }),
      /EXPENSE does not accept a customer/
    );
    assert.strictEqual(calls.ensureCustomer.length, 0);
    assert.strictEqual(repo.rows.length, 0);
  });

  it('validates customer IDs against the authenticated business without creating a customer', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerId: 'c-1',
      amount: 100,
      type: 'CREDIT',
    });

    assert.strictEqual(calls.ensureCustomer.length, 0);
    assert.strictEqual(calls.getCustomerById[0].businessId, BUSINESS_ID);
    assert.strictEqual(repo.createCalls[0].customerId, 'c-1');
  });

  it('rejects missing, foreign and mismatched customers', async () => {
    const repo = new InMemoryTransactionRepository([
      makeCustomer(),
      makeCustomer({ id: 'c-foreign', businessId: OTHER_BUSINESS_ID, name: 'Amit' }),
    ]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerId: 'missing',
        amount: 100,
        type: 'CREDIT',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 404);
        return true;
      }
    );

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerId: 'c-foreign',
        amount: 100,
        type: 'CREDIT',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 404);
        return true;
      }
    );

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerId: 'c-1',
        customerName: 'Amit',
        amount: 100,
        type: 'CREDIT',
      }),
      /Customer ID and customer name do not match/
    );

    assert.strictEqual(repo.rows.length, 0);
  });

  it('rejects a soft-deleted customer ID', async () => {
    const repo = new InMemoryTransactionRepository([
      makeCustomer({ deletedAt: CREATED_AT }),
    ]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerId: 'c-1',
        amount: 100,
        type: 'CREDIT',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 404);
        assert.match(error.message, /Customer not found/);
        return true;
      }
    );

    assert.strictEqual(repo.rows.length, 0);
  });

  it('rejects opening-balance and linked transaction fields for supported types', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 100,
        type: 'CREDIT',
        openingDirection: 'INCREASE',
      }),
      /Opening balance transactions are not supported/
    );

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Raju',
        amount: 100,
        type: 'CREDIT',
        originalTransactionId: 'tx-original',
      }),
      /Linked transactions are not supported/
    );

    assert.strictEqual(repo.rows.length, 0);
  });

  it('idempotent replay checks the key before resolving a customer', async () => {
    const repo = new InMemoryTransactionRepository();
    let customerCreates = 0;
    const gateway: TransactionCustomerGateway = {
      ensureCustomer: async (businessId, createdByUserId, name) => {
        customerCreates += 1;
        const customer = makeCustomer({
          id: `created-${customerCreates}`,
          businessId,
          createdByUserId,
          name,
        });
        repo.customers.set(customer.id, customer);
        return customer;
      },
      getCustomerById: async () => null,
      getCustomerByName: async () => null,
    };
    const service = createTransactionService(repo, gateway);

    const first = await service.createTransaction({
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'Raju',
      amount: 100,
      type: 'CREDIT',
      idempotencyKey: 'same-key',
    });

    await assert.rejects(
      () => service.createTransaction({
        businessId: BUSINESS_ID,
        createdByUserId: CREATOR_ID,
        customerName: 'Ghost',
        amount: 100,
        type: 'CREDIT',
        idempotencyKey: 'same-key',
      }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 409);
        return true;
      }
    );

    assert.strictEqual(first.transaction.id, repo.rows[0].id);
    assert.strictEqual(customerCreates, 1);
    assert.strictEqual(repo.customers.size, 1);
    assert.strictEqual(repo.rows.length, 1);
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

  it('historical transaction detail and history remain accessible after customer soft deletion', async () => {
    const repo = new InMemoryTransactionRepository([
      makeCustomer({ deletedAt: CREATED_AT }),
    ]);
    repo.rows.push(makeTransaction({ id: 'historical', businessId: BUSINESS_ID }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const detail = await service.getTransactionById(BUSINESS_ID, 'historical');
    const history = await service.getTransactionHistory(BUSINESS_ID);

    assert.ok(detail, 'transaction detail must remain readable');
    assert.strictEqual(detail.customerId, 'c-1');
    assert.strictEqual(history.total, 1);
    assert.strictEqual(history.transactions[0].id, 'historical');
    assert.strictEqual(await service.getCustomerBalanceForName(BUSINESS_ID, 'Raju'), null);
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
    repo.rows.push(makeTransaction({
      id: 'sale-credit',
      businessId: BUSINESS_ID,
      type: 'SALE',
      saleMode: 'CREDIT',
      amount: new Prisma.Decimal('10.10'),
    }));
    repo.rows.push(makeTransaction({
      id: 'sale-cash',
      businessId: BUSINESS_ID,
      type: 'SALE',
      saleMode: 'CASH',
      amount: new Prisma.Decimal('50'),
    }));
    const { gateway, calls } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const balance = await service.getCustomerBalanceForName(BUSINESS_ID, 'Raju');

    assert.ok(balance);
    assert.strictEqual(balance.outstandingBalance, 85.35);
    assert.strictEqual(typeof balance.outstandingBalance, 'number');
    assert.strictEqual(balance.balanceText, '₹85.35');
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

  it('soft-deleted customers do not contribute to total outstanding', async () => {
    const repo = new InMemoryTransactionRepository([
      makeCustomer({ id: 'active', name: 'Raju' }),
      makeCustomer({ id: 'deleted', name: 'Amit', deletedAt: CREATED_AT }),
    ]);
    repo.rows.push(makeTransaction({
      id: 'active-credit',
      customerId: 'active',
      amount: new Prisma.Decimal('500'),
    }));
    repo.rows.push(makeTransaction({
      id: 'deleted-credit',
      customerId: 'deleted',
      amount: new Prisma.Decimal('900'),
    }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const total = await service.getTotalOutstandingForUser(BUSINESS_ID);

    assert.strictEqual(total.totalOutstanding, 500);
    assert.strictEqual(repo.rows.length, 2, 'historical rows are preserved');
  });

  it('total outstanding mirrors PostgreSQL customer_balance for every type', async () => {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    repo.rows.push(makeTransaction({ id: 'credit', type: 'CREDIT', amount: new Prisma.Decimal('1000') }));
    repo.rows.push(makeTransaction({ id: 'payment', type: 'PAYMENT', amount: new Prisma.Decimal('200') }));
    repo.rows.push(makeTransaction({
      id: 'sale-credit',
      type: 'SALE',
      saleMode: 'CREDIT',
      amount: new Prisma.Decimal('500'),
    }));
    repo.rows.push(makeTransaction({
      id: 'sale-cash',
      type: 'SALE',
      saleMode: 'CASH',
      amount: new Prisma.Decimal('300'),
    }));
    repo.rows.push(makeTransaction({
      id: 'expense',
      type: 'EXPENSE',
      customerId: null,
      amount: new Prisma.Decimal('100'),
    }));
    repo.rows.push(makeTransaction({
      id: 'opening-increase',
      type: 'OPENING_BALANCE',
      openingDirection: 'INCREASE',
      amount: new Prisma.Decimal('50'),
    }));
    repo.rows.push(makeTransaction({
      id: 'opening-decrease',
      type: 'OPENING_BALANCE',
      openingDirection: 'DECREASE',
      amount: new Prisma.Decimal('25'),
    }));
    repo.rows.push(makeTransaction({
      id: 'sale-return',
      type: 'SALE_RETURN',
      amount: new Prisma.Decimal('75'),
    }));
    repo.rows.push(makeTransaction({ id: 'refund', type: 'REFUND', amount: new Prisma.Decimal('10') }));
    repo.rows.push(makeTransaction({
      id: 'voided-credit',
      type: 'CREDIT',
      amount: new Prisma.Decimal('900'),
      status: 'VOIDED',
    }));
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    const total = await service.getTotalOutstandingForUser(BUSINESS_ID);

    assert.strictEqual(total.totalOutstanding, 1260);
    assert.strictEqual(total.totalOutstandingText, '₹1,260');
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
      createIdempotent: async () => { throw new Error('DB down'); },
      findByIdempotencyKey: async () => { throw new Error('DB down'); },
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

describe('transaction service - idempotency', () => {
  const baseInput = {
    businessId: BUSINESS_ID,
    createdByUserId: CREATOR_ID,
    customerName: 'Raju',
    amount: 450,
    type: 'CREDIT' as const,
    idempotencyKey: 'key-1',
  };

  function setup() {
    const repo = new InMemoryTransactionRepository([makeCustomer()]);
    const { gateway } = makeGateway(repo);
    return { repo, service: createTransactionService(repo, gateway) };
  }

  it('first request creates a transaction and stores the key', async () => {
    const { repo, service } = setup();
    const result = await service.createTransaction(baseInput);
    assert.strictEqual(repo.rows.length, 1);
    assert.strictEqual(repo.rows[0].idempotencyKey, 'key-1');
    assert.strictEqual(result.transaction.id, repo.rows[0].id);
  });

  it('duplicate request with identical payload returns the original transaction', async () => {
    const { repo, service } = setup();
    const first = await service.createTransaction(baseInput);
    const second = await service.createTransaction(baseInput);
    assert.strictEqual(repo.rows.length, 1);
    assert.strictEqual(repo.createCalls.length, 1);
    assert.strictEqual(second.transaction.id, first.transaction.id);
  });

  it('concurrent duplicate requests create only one transaction', async () => {
    const { repo, service } = setup();
    const [a, b] = await Promise.all([
      service.createTransaction(baseInput),
      service.createTransaction(baseInput),
    ]);
    assert.strictEqual(repo.rows.length, 1);
    assert.strictEqual(a.transaction.id, b.transaction.id);
  });

  it('concurrent same-key requests do not create an extra customer', async () => {
    const repo = new InMemoryTransactionRepository();
    let customerCreates = 0;
    const gateway: TransactionCustomerGateway = {
      ensureCustomer: async (businessId, createdByUserId, name) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        for (const customer of repo.customers.values()) {
          if (
            customer.businessId === businessId &&
            customer.name.toLowerCase() === name.toLowerCase()
          ) {
            return customer;
          }
        }
        customerCreates += 1;
        const customer = makeCustomer({
          id: `concurrent-${customerCreates}`,
          businessId,
          createdByUserId,
          name,
        });
        repo.customers.set(customer.id, customer);
        return customer;
      },
      getCustomerById: async () => null,
      getCustomerByName: async () => null,
    };
    const service = createTransactionService(repo, gateway);
    const input = {
      businessId: BUSINESS_ID,
      createdByUserId: CREATOR_ID,
      customerName: 'New Customer',
      amount: 100,
      type: 'CREDIT' as const,
      idempotencyKey: 'concurrent-new-customer',
    };

    const [first, second] = await Promise.all([
      service.createTransaction(input),
      service.createTransaction(input),
    ]);

    assert.strictEqual(first.transaction.id, second.transaction.id);
    assert.strictEqual(customerCreates, 1);
    assert.strictEqual(repo.customers.size, 1);
    assert.strictEqual(repo.rows.length, 1);
  });

  it('same key reused with a different payload is rejected with 409', async () => {
    const { repo, service } = setup();
    await service.createTransaction(baseInput);
    await assert.rejects(
      () => service.createTransaction({ ...baseInput, amount: 999 }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.strictEqual(error.statusCode, 409);
        assert.match(error.message, /different request payload/);
        return true;
      }
    );
    assert.strictEqual(repo.rows.length, 1);
  });

  it('idempotency keys are business-scoped at the repository level', async () => {
    const { repo, service } = setup();
    await service.createTransaction(baseInput);

    const row = await repo.findByIdempotencyKey(BUSINESS_ID, 'key-1');
    assert.ok(row, 'the owning business finds the row');
    assert.strictEqual(row.businessId, BUSINESS_ID);
    assert.strictEqual(await repo.findByIdempotencyKey(OTHER_BUSINESS_ID, 'key-1'), null);
    assert.strictEqual(repo.rows.length, 1);
  });

  it('different keys create separate transactions', async () => {
    const { repo, service } = setup();
    await service.createTransaction(baseInput);
    await service.createTransaction({ ...baseInput, idempotencyKey: 'key-2', amount: 100 });
    assert.strictEqual(repo.rows.length, 2);
  });

  it('different businesses can use the same key independently', async () => {
    const repo = new InMemoryTransactionRepository([
      makeCustomer(),
      makeCustomer({ id: 'c-2', businessId: OTHER_BUSINESS_ID, createdByUserId: OTHER_CREATOR_ID }),
    ]);
    const { gateway } = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await service.createTransaction(baseInput);
    await service.createTransaction({
      ...baseInput,
      businessId: OTHER_BUSINESS_ID,
      createdByUserId: OTHER_CREATOR_ID,
      customerName: 'Raju',
    });

    assert.strictEqual(repo.rows.length, 2);
    assert.strictEqual(
      repo.rows.filter((row) => row.idempotencyKey === 'key-1').length,
      2
    );
  });
});
