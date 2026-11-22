import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createTransactionService, type TransactionCustomerGateway } from '../../../services/ledger/transactionService.js';
import { calculateOutstandingAmount } from '../../../utils/ledger.js';
import type {
  CreateTransactionRecordInput,
  TransactionRepository,
  TransactionWithCustomer,
  CustomerTransactionGroup,
  TransactionHistoryQuery,
  TransactionHistoryPage,
} from '../../../repositories/transactionRepository.js';
import type { Customer, Transaction, TransactionType } from '@prisma/client';

const USER_ID = 'user-1';

function makeCustomer(id: string, name: string, userId = USER_ID): Customer {
  return {
    id,
    userId,
    name,
    phone: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeTransaction(
  id: string,
  type: TransactionType,
  amount: number,
  customerId: string,
  createdAt = new Date('2026-01-02T00:00:00.000Z')
): Transaction {
  return {
    id,
    userId: USER_ID,
    customerId,
    type,
    amount,
    description: 'test',
    createdAt,
  };
}

class InMemoryTransactionRepository implements TransactionRepository {
  readonly rows: Transaction[] = [];
  readonly customers = new Map<string, Customer>();
  nextId = 1;

  constructor(customers: Customer[] = []) {
    for (const c of customers) this.customers.set(c.id, c);
  }

  async create(input: CreateTransactionRecordInput): Promise<TransactionWithCustomer> {
    const transaction = makeTransaction(
      `t-${this.nextId++}`,
      input.type,
      input.amount,
      input.customerId
    );
    transaction.userId = input.userId;
    transaction.description = input.description;
    this.rows.push(transaction);
    return { ...transaction, customer: this.customers.get(input.customerId) ?? null };
  }

  async listForUser(userId: string): Promise<TransactionWithCustomer[]> {
    return this.rows
      .filter((t) => t.userId === userId)
      .slice()
      .reverse()
      .map((t) => ({ ...t, customer: this.customers.get(t.customerId ?? '') ?? null }));
  }

  async listForCustomer(customerId: string, userId: string): Promise<Transaction[]> {
    return this.rows.filter((t) => t.customerId === customerId && t.userId === userId);
  }

  async listCustomerTransactionGroups(userId: string): Promise<CustomerTransactionGroup[]> {
    return [...this.customers.values()]
      .filter((c) => c.userId === userId)
      .map((c) => ({ transactions: this.rows.filter((t) => t.customerId === c.id) }));
  }

  async findById(transactionId: string, userId: string): Promise<TransactionWithCustomer | null> {
    const transaction = this.rows.find((t) => t.id === transactionId && t.userId === userId);
    if (!transaction) return null;
    return { ...transaction, customer: this.customers.get(transaction.customerId ?? '') ?? null };
  }

  async findHistory(query: TransactionHistoryQuery): Promise<TransactionHistoryPage> {
    let matches = this.rows.filter((t) => t.userId === query.userId);
    if (query.type) matches = matches.filter((t) => t.type === query.type);
    if (query.customerId) matches = matches.filter((t) => t.customerId === query.customerId);
    if (query.from) matches = matches.filter((t) => t.createdAt >= (query.from as Date));
    if (query.to) matches = matches.filter((t) => t.createdAt <= (query.to as Date));

    const sorted = matches.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (query.page - 1) * query.limit;
    const pageRows = sorted.slice(start, start + query.limit);

    return {
      transactions: pageRows.map((t) => ({
        ...t,
        customer: this.customers.get(t.customerId ?? '') ?? null,
      })),
      total: matches.length,
    };
  }
}

function makeGateway(repo: InMemoryTransactionRepository): TransactionCustomerGateway {
  return {
    ensureDefaultUser: async () => ({
      id: USER_ID,
      name: 'Demo Shopkeeper',
      email: null,
      businessName: 'Raju General Store',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
    ensureCustomer: async (_userId, name) => {
      for (const c of repo.customers.values()) {
        if (c.name.toLowerCase() === name.toLowerCase()) return c;
      }
      throw new Error('CUSTOMER_NOT_FOUND');
    },
    getCustomerByName: async (userId, name) => {
      for (const c of repo.customers.values()) {
        if (c.name.toLowerCase() === name.toLowerCase()) {
          const transactions = await repo.listForCustomer(c.id, userId);
          return {
            ...c,
            transactions,
            outstandingBalance: calculateOutstandingAmount(transactions),
          };
        }
      }
      return null;
    },
  };
}

describe('transaction service (repository boundary)', () => {
  it('1. successful CREDIT creation', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    const result = await service.createTransaction({
      customerName: 'Raju',
      amount: 450,
      type: 'CREDIT',
    });

    assert.strictEqual(result.transaction.type, 'CREDIT');
    assert.strictEqual(result.transaction.amount, 450);
    assert.strictEqual(result.transaction.customer?.name, 'Raju');
    assert.strictEqual(result.outstandingBalance, 450, 'CREDIT increases outstanding');
  });

  it('2. successful PAYMENT creation', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    const result = await service.createTransaction({
      customerName: 'Raju',
      amount: 200,
      type: 'PAYMENT',
    });

    assert.strictEqual(result.transaction.type, 'PAYMENT');
    assert.strictEqual(result.outstandingBalance, -200, 'PAYMENT decreases outstanding');
  });

  it('3. SALE behavior', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    const result = await service.createTransaction({
      customerName: 'Raju',
      amount: 1000,
      type: 'SALE',
    });

    assert.strictEqual(result.transaction.type, 'SALE');
    assert.strictEqual(result.transaction.amount, 1000, 'SALE amount stored');
    assert.strictEqual(result.outstandingBalance, 0, 'SALE does not affect outstanding');
  });

  it('4. EXPENSE behavior', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    const result = await service.createTransaction({
      customerName: 'Raju',
      amount: 500,
      type: 'EXPENSE',
    });

    assert.strictEqual(result.transaction.type, 'EXPENSE');
    assert.strictEqual(result.outstandingBalance, 0, 'EXPENSE does not affect outstanding');
  });

  it('5. customer not found', async () => {
    const repo = new InMemoryTransactionRepository();
    const service = createTransactionService(repo, makeGateway(repo));

    await assert.rejects(
      () => service.createTransaction({ customerName: 'Ghost', amount: 100, type: 'CREDIT' }),
      /CUSTOMER_NOT_FOUND/
    );
    assert.strictEqual(repo.rows.length, 0, 'no transaction created');
  });

  it('6. customer ownership mismatch', async () => {
    const otherUserCustomer = makeCustomer('c-1', 'Raju', 'user-2');
    const repo = new InMemoryTransactionRepository([otherUserCustomer]);
    const gateway = makeGateway(repo);
    gateway.ensureCustomer = async () => otherUserCustomer;
    const service = createTransactionService(repo, gateway);

    // listForCustomer is scoped by userId - other user's customer has no rows
    const rows = await repo.listForCustomer('c-1', USER_ID);
    assert.strictEqual(rows.length, 0, 'transactions not leaked across users');

    const result = await service.createTransaction({
      customerName: 'Raju',
      amount: 100,
      type: 'CREDIT',
    });
    assert.strictEqual(result.transaction.userId, USER_ID);
    assert.strictEqual(result.outstandingBalance, 100);
  });

  it('7. transaction listing', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    await service.createTransaction({ customerName: 'Raju', amount: 100, type: 'CREDIT' });
    await service.createTransaction({ customerName: 'Raju', amount: 50, type: 'PAYMENT' });

    const list = await service.getTransactionsForUser(USER_ID);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(typeof list[0].formattedAmount, 'string');
    assert.ok(list[0].formattedAmount.length > 0, 'formattedAmount present');
    assert.strictEqual(list[0].customer?.name, 'Raju');
  });

  it('8. customer-specific transaction listing', async () => {
    const raju = makeCustomer('c-1', 'Raju');
    const amit = makeCustomer('c-2', 'Amit');
    const repo = new InMemoryTransactionRepository([raju, amit]);
    const gateway = makeGateway(repo);
    const service = createTransactionService(repo, gateway);

    await service.createTransaction({ customerName: 'Raju', amount: 100, type: 'CREDIT' });
    await service.createTransaction({ customerName: 'Amit', amount: 200, type: 'CREDIT' });

    const rajuRows = await repo.listForCustomer('c-1', USER_ID);
    assert.strictEqual(rajuRows.length, 1);
    assert.strictEqual(rajuRows[0].amount, 100);
    const amitRows = await repo.listForCustomer('c-2', USER_ID);
    assert.strictEqual(amitRows.length, 1);
    assert.strictEqual(amitRows[0].amount, 200);
  });

  it('9. transaction summary behavior', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    const today = new Date();
    repo.rows.push(makeTransaction('t-old', 'SALE', 999, 'c-1', new Date('2020-01-01')));
    repo.rows.push(makeTransaction('t-sale', 'SALE', 100, 'c-1', today));
    repo.rows.push(makeTransaction('t-exp', 'EXPENSE', 50, 'c-1', today));
    repo.rows.push(makeTransaction('t-pay', 'PAYMENT', 30, 'c-1', today));
    repo.rows.push(makeTransaction('t-credit', 'CREDIT', 200, 'c-1', today));

    const summary = await service.getDashboardSummary(USER_ID);

    assert.strictEqual(summary.todaysSales, 100);
    assert.strictEqual(summary.todaysExpenses, 50);
    assert.strictEqual(summary.paymentsReceived, 30);
    assert.strictEqual(summary.newCredit, 200);
    assert.strictEqual(summary.totalOutstanding, 170, 'CREDIT 200 - PAYMENT 30; SALE/EXPENSE ignored');
    assert.strictEqual(summary.recentTransactions.length, 5);
    assert.strictEqual(summary.businessName, 'Raju General Store');
  });

  it('10. repository error propagation', async () => {
    const failingRepo: TransactionRepository = {
      create: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      listForUser: async () => { throw new Error('DB down'); },
      listForCustomer: async () => { throw new Error('DB down'); },
      listCustomerTransactionGroups: async () => { throw new Error('DB down'); },
      findHistory: async () => { throw new Error('DB down'); },
    };
    const customer = makeCustomer('c-1', 'Raju');
    const gatewayRepo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(failingRepo, makeGateway(gatewayRepo));

    await assert.rejects(
      () => service.createTransaction({ customerName: 'Raju', amount: 100, type: 'CREDIT' }),
      /DB down/
    );
    await assert.rejects(() => service.getTransactionsForUser(USER_ID), /DB down/);
    await assert.rejects(() => service.getDashboardSummary(USER_ID), /DB down/);
    await assert.rejects(() => service.getTotalOutstandingForUser(USER_ID), /DB down/);
  });

  it('11. outstanding balance consistency', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    await service.createTransaction({ customerName: 'Raju', amount: 500, type: 'CREDIT' });
    await service.createTransaction({ customerName: 'Raju', amount: 200, type: 'PAYMENT' });
    await service.createTransaction({ customerName: 'Raju', amount: 1000, type: 'SALE' });
    await service.createTransaction({ customerName: 'Raju', amount: 300, type: 'EXPENSE' });

    const created = await service.createTransaction({
      customerName: 'Raju',
      amount: 50,
      type: 'CREDIT',
    });
    assert.strictEqual(created.outstandingBalance, 350, '500 - 200 + 50');

    const balance = await service.getCustomerBalanceForName(USER_ID, 'Raju');
    assert.strictEqual(balance?.outstandingBalance, 350);

    const total = await service.getTotalOutstandingForUser(USER_ID);
    assert.strictEqual(total.totalOutstanding, 350);
    assert.strictEqual(total.totalOutstandingText, '₹350');
  });

  it('createTransaction rounds amount and applies default description', async () => {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));

    const result = await service.createTransaction({
      customerName: 'Raju',
      amount: 100.6,
      type: 'CREDIT',
    });

    assert.strictEqual(result.transaction.amount, 101, 'Math.round applied');
    assert.strictEqual(result.transaction.description, 'Ledger update');
  });

  it('getCustomerBalanceForName returns null for unknown customer', async () => {
    const repo = new InMemoryTransactionRepository();
    const service = createTransactionService(repo, makeGateway(repo));

    const balance = await service.getCustomerBalanceForName(USER_ID, 'Ghost');
    assert.strictEqual(balance, null);
  });
});

describe('transaction service - getTransactionHistory', () => {
  function seedRepo(count: number) {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    for (let i = 0; i < count; i++) {
      repo.rows.push(
        makeTransaction(
          `t-${i}`,
          i % 2 === 0 ? 'CREDIT' : 'PAYMENT',
          (i + 1) * 10,
          'c-1',
          new Date(Date.UTC(2026, 0, 1 + i))
        )
      );
    }
    return { repo, service: createTransactionService(repo, makeGateway(repo)) };
  }

  it('1. default page and limit', async () => {
    const { service } = seedRepo(12);
    const result = await service.getTransactionHistory(USER_ID);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 10);
    assert.strictEqual(result.transactions.length, 10);
    assert.strictEqual(result.total, 12);
  });

  it('2. custom page and limit', async () => {
    const { service } = seedRepo(12);
    const result = await service.getTransactionHistory(USER_ID, { page: 2, limit: 3 });
    assert.strictEqual(result.page, 2);
    assert.strictEqual(result.limit, 3);
    assert.strictEqual(result.transactions.length, 3);
    assert.strictEqual(result.total, 12);
    assert.strictEqual(result.totalPages, 4);
  });

  it('3. maximum limit enforcement', async () => {
    const { service } = seedRepo(5);
    const result = await service.getTransactionHistory(USER_ID, { limit: 1000 });
    assert.strictEqual(result.limit, 100, 'limit clamped to 100');
    assert.strictEqual(result.transactions.length, 5);
  });

  it('4. transaction type filtering', async () => {
    const { service } = seedRepo(10);
    const result = await service.getTransactionHistory(USER_ID, { type: 'CREDIT' });
    assert.strictEqual(result.total, 5);
    assert.ok(result.transactions.every((t) => t.type === 'CREDIT'));
  });

  it('5. customer filtering', async () => {
    const raju = makeCustomer('c-1', 'Raju');
    const amit = makeCustomer('c-2', 'Amit');
    const repo = new InMemoryTransactionRepository([raju, amit]);
    repo.rows.push(makeTransaction('t-1', 'CREDIT', 100, 'c-1'));
    repo.rows.push(makeTransaction('t-2', 'CREDIT', 200, 'c-2'));
    const service = createTransactionService(repo, makeGateway(repo));

    const result = await service.getTransactionHistory(USER_ID, { customerId: 'c-2' });
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.transactions[0].customerId, 'c-2');
  });

  it('6. date filtering', async () => {
    const { service } = seedRepo(5);
    const from = new Date(Date.UTC(2026, 0, 3));
    const result = await service.getTransactionHistory(USER_ID, { from });
    assert.strictEqual(result.total, 3, 'transactions on/after Jan 3');
  });

  it('7. total count and totalPages', async () => {
    const { service } = seedRepo(11);
    const result = await service.getTransactionHistory(USER_ID, { limit: 5 });
    assert.strictEqual(result.total, 11);
    assert.strictEqual(result.totalPages, 3);
  });

  it('8. empty result set', async () => {
    const { service } = seedRepo(0);
    const result = await service.getTransactionHistory(USER_ID);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.totalPages, 0);
    assert.strictEqual(result.transactions.length, 0);
  });

  it('9. invalid pagination values fall back to defaults', async () => {
    const { service } = seedRepo(12);
    const result = await service.getTransactionHistory(USER_ID, { page: -5, limit: 0 });
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.limit, 10);
  });

  it('10. existing unpaginated API behavior', async () => {
    const { service } = seedRepo(3);
    const list = await service.getTransactionsForUser(USER_ID);
    assert.strictEqual(list.length, 3);
    assert.ok(Array.isArray(list));
    assert.ok(list[0].formattedAmount);
  });

  it('11. repository error propagation', async () => {
    const failingRepo: TransactionRepository = {
      create: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      listForUser: async () => { throw new Error('DB down'); },
      listForCustomer: async () => { throw new Error('DB down'); },
      listCustomerTransactionGroups: async () => { throw new Error('DB down'); },
      findHistory: async () => { throw new Error('DB down'); },
    };
    const service = createTransactionService(failingRepo, makeGateway(new InMemoryTransactionRepository()));

    await assert.rejects(
      () => service.getTransactionHistory(USER_ID),
      /DB down/
    );
  });

  it('history results include formattedAmount', async () => {
    const { service } = seedRepo(2);
    const result = await service.getTransactionHistory(USER_ID);
    assert.strictEqual(typeof result.transactions[0].formattedAmount, 'string');
  });
});

describe('transaction service - getTransactionById', () => {
  function setup() {
    const customer = makeCustomer('c-1', 'Raju');
    const repo = new InMemoryTransactionRepository([customer]);
    const service = createTransactionService(repo, makeGateway(repo));
    return { repo, service, customer };
  }

  it('1. successful transaction lookup', async () => {
    const { repo, service } = setup();
    repo.rows.push(makeTransaction('t-1', 'CREDIT', 450, 'c-1'));

    const result = await service.getTransactionById(USER_ID, 't-1');

    assert.ok(result);
    assert.strictEqual(result.id, 't-1');
    assert.strictEqual(result.type, 'CREDIT');
    assert.strictEqual(result.amount, 450);
  });

  it('2. transaction not found', async () => {
    const { service } = setup();
    const result = await service.getTransactionById(USER_ID, 'missing');
    assert.strictEqual(result, null);
  });

  it('3. transaction belonging to another user returns not found', async () => {
    const { repo, service } = setup();
    const other = makeTransaction('t-2', 'CREDIT', 100, 'c-1');
    other.userId = 'user-2';
    repo.rows.push(other);

    const result = await service.getTransactionById(USER_ID, 't-2');
    assert.strictEqual(result, null, 'other-user transaction indistinguishable from missing');
    const otherResult = await service.getTransactionById('user-2', 't-2');
    assert.ok(otherResult, 'owner can retrieve it');
  });

  it('4. customer details are preserved', async () => {
    const { repo, service } = setup();
    repo.rows.push(makeTransaction('t-1', 'CREDIT', 450, 'c-1'));

    const result = await service.getTransactionById(USER_ID, 't-1');
    assert.ok(result);
    assert.strictEqual(result.customer?.name, 'Raju');
    assert.strictEqual(result.customer?.id, 'c-1');
  });

  it('5. amount formatting is consistent with listing', async () => {
    const { repo, service } = setup();
    repo.rows.push(makeTransaction('t-1', 'CREDIT', 450, 'c-1'));

    const detail = await service.getTransactionById(USER_ID, 't-1');
    const list = await service.getTransactionsForUser(USER_ID);
    assert.ok(detail);
    assert.strictEqual(detail.formattedAmount, list[0].formattedAmount);
    assert.strictEqual(detail.formattedAmount, '₹450');
  });

  it('6. invalid transaction ID is rejected', async () => {
    const { service } = setup();
    // Service itself does not validate; the API layer uses transactionIdParamSchema.
    // An empty ID should simply not match any record.
    const result = await service.getTransactionById(USER_ID, '');
    assert.strictEqual(result, null);
  });

  it('7. repository errors propagate correctly', async () => {
    const failingRepo: TransactionRepository = {
      create: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      listForUser: async () => { throw new Error('DB down'); },
      listForCustomer: async () => { throw new Error('DB down'); },
      listCustomerTransactionGroups: async () => { throw new Error('DB down'); },
      findHistory: async () => { throw new Error('DB down'); },
    };
    const service = createTransactionService(failingRepo, makeGateway(new InMemoryTransactionRepository()));

    await assert.rejects(
      () => service.getTransactionById(USER_ID, 't-1'),
      /DB down/
    );
  });

  it('detail returns full transaction shape matching listing entry', async () => {
    const { repo, service } = setup();
    repo.rows.push(makeTransaction('t-1', 'PAYMENT', 200, 'c-1'));

    const detail = await service.getTransactionById(USER_ID, 't-1');
    const list = await service.getTransactionsForUser(USER_ID);
    assert.ok(detail);
    assert.deepStrictEqual(detail, list[0]);
  });
});
