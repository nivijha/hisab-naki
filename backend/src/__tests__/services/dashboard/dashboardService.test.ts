import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createDashboardService } from '../../../services/dashboard/dashboardService.js';
import type {
  TransactionRepository,
  TransactionWithCustomer,
  CustomerTransactionGroup,
  TransactionHistoryQuery,
  TransactionHistoryPage,
  CreateTransactionRecordInput,
  IdempotentCreateResult,
} from '../../../repositories/transactionRepository.js';
import { Prisma } from '@prisma/client';
import type { Transaction, TransactionType } from '@prisma/client';

const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';
const CREATOR_ID = 'user-1';
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const NOW = new Date('2026-06-15T12:00:00.000Z');

function makeTransaction(
  id: string,
  type: TransactionType,
  amount: number | string,
  createdAt: Date,
  overrides: Partial<Transaction> = {}
): TransactionWithCustomer {
  return {
    id,
    businessId: BUSINESS_ID,
    customerId: 'c-1',
    type,
    status: 'ACTIVE',
    amount: new Prisma.Decimal(amount),
    saleMode: null,
    paymentMethod: null,
    openingDirection: null,
    description: 'test',
    occurredAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    createdByUserId: CREATOR_ID,
    voidedAt: null,
    voidedByUserId: null,
    voidReason: null,
    originalTransactionId: null,
    idempotencyKey: null,
    customer: null,
    ...overrides,
  };
}

type ScopedGroup = {
  businessId: string;
  transactions: Transaction[];
  deletedAt?: Date | null;
};

class InMemoryDashboardRepository implements TransactionRepository {
  readonly transactions: TransactionWithCustomer[] = [];
  readonly groups: ScopedGroup[] = [];
  readonly businessReads: string[] = [];

  async create(_input: CreateTransactionRecordInput): Promise<TransactionWithCustomer> {
    throw new Error('not used');
  }

  async createIdempotent(_input: CreateTransactionRecordInput): Promise<IdempotentCreateResult> {
    throw new Error('not used');
  }

  async findByIdempotencyKey(
    _businessId: string,
    _idempotencyKey: string
  ): Promise<TransactionWithCustomer | null> {
    throw new Error('not used');
  }

  async findById(_transactionId: string, _businessId: string): Promise<TransactionWithCustomer | null> {
    throw new Error('not used');
  }

  async listForBusiness(businessId: string): Promise<TransactionWithCustomer[]> {
    this.businessReads.push(businessId);
    return this.transactions.filter(
      (t) => t.businessId === businessId && t.status === 'ACTIVE'
    );
  }

  async listForCustomer(_customerId: string, _businessId: string) {
    return [];
  }

  async listCustomerTransactionGroups(businessId: string): Promise<CustomerTransactionGroup[]> {
    this.businessReads.push(businessId);
    return this.groups
      .filter((g) => g.businessId === businessId && (g.deletedAt ?? null) === null)
      .map((g) => ({
        transactions: g.transactions.filter((transaction) => transaction.status === 'ACTIVE'),
      }));
  }

  async findHistory(_query: TransactionHistoryQuery): Promise<TransactionHistoryPage> {
    throw new Error('not used');
  }
}

function makeService(repo: InMemoryDashboardRepository, overrides = {}) {
  return createDashboardService({
    repository: repo,
    now: () => NOW,
    getBusinessName: async () => 'Test Shop',
    fallbackBusinessName: 'My Business',
    ...overrides,
  });
}

describe('dashboard service', () => {
  it('1. today sales calculation', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'SALE', 100, NOW));
    repo.transactions.push(makeTransaction('t2', 'SALE', 250, NOW));
    repo.transactions.push(
      makeTransaction('t3', 'SALE', 999, new Date('2026-06-14T12:00:00.000Z'))
    );
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 350);
  });

  it('2. outstanding balance calculation', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('t1', 'CREDIT', 500, NOW),
        makeTransaction('t2', 'PAYMENT', 200, NOW),
        makeTransaction('t3', 'SALE', 1000, NOW, { saleMode: 'CASH' }),
        makeTransaction('t4', 'EXPENSE', 300, NOW),
      ],
    });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.totalOutstanding, 300, 'CREDIT 500 - PAYMENT 200; cash SALE/EXPENSE ignored');
  });

  it('3. recent transaction ordering and limit', async () => {
    const repo = new InMemoryDashboardRepository();
    for (let i = 0; i < 8; i++) {
      repo.transactions.push(
        makeTransaction(`t${i}`, 'CREDIT', i + 1, new Date(NOW.getTime() - i * 1000))
      );
    }
    // repository returns desc order in production; mock pushes newest-first
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.recentTransactions.length, 5);
    assert.strictEqual(summary.recentTransactions[0].id, 't0');
    assert.strictEqual(summary.recentTransactions[4].id, 't4');
  });

  it('4. customer groups are read internally for outstanding (count not exposed)', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [makeTransaction('t1', 'CREDIT', 100, NOW)],
    });
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [makeTransaction('t2', 'PAYMENT', 40, NOW)],
    });
    let groupsRead = 0;
    const original = repo.listCustomerTransactionGroups.bind(repo);
    repo.listCustomerTransactionGroups = async (businessId: string) => {
      groupsRead += 1;
      return original(businessId);
    };
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(groupsRead, 1, 'customer groups are read internally');
    assert.strictEqual(summary.totalOutstanding, 60, 'both customer groups contribute');
    assert.ok(!('customerCount' in summary), 'customerCount is not part of the API response');
  });

  it('4b. deleted customers are excluded from outstanding but their history is not read as a customer group', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [makeTransaction('t1', 'CREDIT', 400, NOW)],
    });
    repo.groups.push({
      businessId: BUSINESS_ID,
      deletedAt: NOW,
      transactions: [makeTransaction('t2', 'CREDIT', 900, NOW)],
    });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.totalOutstanding, 400);
  });

  it('5. empty dashboard', async () => {
    const repo = new InMemoryDashboardRepository();
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 0);
    assert.strictEqual(summary.todaysExpenses, 0);
    assert.strictEqual(summary.paymentsReceived, 0);
    assert.strictEqual(summary.newCredit, 0);
    assert.strictEqual(summary.totalOutstanding, 0);
    assert.strictEqual(summary.recentTransactions.length, 0);
    assert.ok(!('customerCount' in summary));
  });

  it('6. business name from existing user data', async () => {
    const repo = new InMemoryDashboardRepository();
    const service = makeService(repo, {
      getBusinessName: async () => 'Shopkeeper Business Name',
    });

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.businessName, 'Shopkeeper Business Name');
  });

  it('7. configurable fallback business name', async () => {
    const repo = new InMemoryDashboardRepository();
    const service = makeService(repo, {
      getBusinessName: async () => undefined,
      fallbackBusinessName: 'Configured Fallback',
    });

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.businessName, 'Configured Fallback');
  });

  it('7b. empty user business name uses fallback', async () => {
    const repo = new InMemoryDashboardRepository();
    const service = makeService(repo, {
      getBusinessName: async () => '   ',
      fallbackBusinessName: 'Fallback Shop',
    });

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.businessName, 'Fallback Shop');
  });

  it('8. repository error propagation', async () => {
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
    const service = createDashboardService({ repository: failingRepo, now: () => NOW });

    await assert.rejects(() => service.getDashboardSummary(BUSINESS_ID), /DB down/);
  });

  it('9. existing response shape compatibility', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'PAYMENT', 50, NOW));
    repo.groups.push({ businessId: BUSINESS_ID, transactions: [] });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    const expectedKeys = [
      'businessName',
      'todaysSales',
      'todaysExpenses',
      'paymentsReceived',
      'newCredit',
      'totalOutstanding',
      'recentTransactions',
    ];
    for (const key of expectedKeys) {
      assert.ok(key in summary, `missing expected key: ${key}`);
    }
    assert.deepStrictEqual(
      Object.keys(summary).sort(),
      [...expectedKeys].sort(),
      'dashboard response must have exactly the original keys'
    );
    assert.strictEqual(summary.paymentsReceived, 50);
    assert.strictEqual(typeof summary.businessName, 'string');
    assert.ok(Array.isArray(summary.recentTransactions));
  });

  it('all per-type today sums are computed', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'SALE', 10, NOW));
    repo.transactions.push(makeTransaction('t2', 'EXPENSE', 20, NOW));
    repo.transactions.push(makeTransaction('t3', 'PAYMENT', 30, NOW));
    repo.transactions.push(makeTransaction('t4', 'CREDIT', 40, NOW));
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 10);
    assert.strictEqual(summary.todaysExpenses, 20);
    assert.strictEqual(summary.paymentsReceived, 30);
    assert.strictEqual(summary.newCredit, 40);
  });
});

// Boundary value computed the same way as the service (local midnight).
const LOCAL_MIDNIGHT = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

describe('dashboard service - date boundaries', () => {
  it('includes a transaction exactly at local midnight', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(
      makeTransaction('midnight', 'SALE', 100, new Date(LOCAL_MIDNIGHT.getTime()))
    );
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 100, 'midnight is included (>= startOfToday)');
  });

  it('excludes a transaction one millisecond before local midnight', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(
      makeTransaction('before', 'SALE', 100, new Date(LOCAL_MIDNIGHT.getTime() - 1))
    );
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 0, 'just-before-midnight is excluded');
  });

  it('excludes all previous-day transaction types from today totals', async () => {
    const repo = new InMemoryDashboardRepository();
    const previousDay = new Date(LOCAL_MIDNIGHT.getTime() - 24 * 60 * 60 * 1000);
    repo.transactions.push(makeTransaction('s', 'SALE', 10, previousDay));
    repo.transactions.push(makeTransaction('e', 'EXPENSE', 20, previousDay));
    repo.transactions.push(makeTransaction('p', 'PAYMENT', 30, previousDay));
    repo.transactions.push(makeTransaction('c', 'CREDIT', 40, previousDay));
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 0);
    assert.strictEqual(summary.todaysExpenses, 0);
    assert.strictEqual(summary.paymentsReceived, 0);
    assert.strictEqual(summary.newCredit, 0);
  });
});

describe('dashboard service - transaction type isolation', () => {
  const zeroToday = (s: Awaited<ReturnType<ReturnType<typeof makeService>['getDashboardSummary']>>) => ({
    sales: s.todaysSales,
    expenses: s.todaysExpenses,
    payments: s.paymentsReceived,
    credit: s.newCredit,
  });

  it('SALE contributes only to todaysSales', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'SALE', 100, NOW));
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.deepStrictEqual(zeroToday(summary), {
      sales: 100,
      expenses: 0,
      payments: 0,
      credit: 0,
    });
  });

  it('EXPENSE contributes only to todaysExpenses', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'EXPENSE', 100, NOW));
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.deepStrictEqual(zeroToday(summary), {
      sales: 0,
      expenses: 100,
      payments: 0,
      credit: 0,
    });
  });

  it('PAYMENT contributes only to paymentsReceived', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'PAYMENT', 100, NOW));
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.deepStrictEqual(zeroToday(summary), {
      sales: 0,
      expenses: 0,
      payments: 100,
      credit: 0,
    });
  });

  it('CREDIT contributes only to newCredit', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'CREDIT', 100, NOW));
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.deepStrictEqual(zeroToday(summary), {
      sales: 0,
      expenses: 0,
      payments: 0,
      credit: 100,
    });
  });

  it('cash SALE and EXPENSE do not affect totalOutstanding', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('s', 'SALE', 1000, NOW, { saleMode: 'CASH' }),
        makeTransaction('e', 'EXPENSE', 500, NOW),
      ],
    });
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.totalOutstanding, 0);
  });

  it('credit SALE contributes to totalOutstanding', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('s', 'SALE', 1000, NOW, { saleMode: 'CREDIT' }),
        makeTransaction('cash', 'SALE', 500, NOW, { saleMode: 'CASH' }),
      ],
    });
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.totalOutstanding, 1000);
  });
});

describe('dashboard service - outstanding edge cases', () => {
  it('multiple customers with different CREDIT/PAYMENT histories', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('a1', 'CREDIT', 500, NOW),
        makeTransaction('a2', 'PAYMENT', 200, NOW),
      ],
    });
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('b1', 'CREDIT', 300, NOW),
        makeTransaction('b2', 'PAYMENT', 50, NOW),
      ],
    });
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.totalOutstanding, 550, '(500-200) + (300-50)');
  });

  it('a customer with no transactions contributes zero', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({ businessId: BUSINESS_ID, transactions: [] });
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [makeTransaction('c1', 'CREDIT', 250, NOW)],
    });
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.totalOutstanding, 250);
  });

  it('an overpaid customer preserves the negative outstanding balance', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('c1', 'CREDIT', 100, NOW),
        makeTransaction('c2', 'PAYMENT', 300, NOW),
      ],
    });
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.totalOutstanding, -200, 'negative balances are not floored at zero');
  });
});

describe('dashboard service - recent transactions', () => {
  it('returns exactly five records, newest-first, when more than five exist', async () => {
    const repo = new InMemoryDashboardRepository();
    for (let i = 0; i < 7; i++) {
      repo.transactions.push(
        makeTransaction(`t${i}`, 'CREDIT', i + 1, new Date(NOW.getTime() - i * 1000))
      );
    }
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.recentTransactions.length, 5);
    assert.deepStrictEqual(
      summary.recentTransactions.map((t) => t.id),
      ['t0', 't1', 't2', 't3', 't4'],
      'newest-first order preserved'
    );
  });

  it('returns all records when fewer than five exist', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('t1', 'CREDIT', 1, NOW));
    repo.transactions.push(makeTransaction('t2', 'CREDIT', 2, new Date(NOW.getTime() - 1000)));
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.recentTransactions.length, 2);
  });

  it('returns an empty array for empty history', async () => {
    const repo = new InMemoryDashboardRepository();
    const summary = await makeService(repo).getDashboardSummary(BUSINESS_ID);

    assert.deepStrictEqual(summary.recentTransactions, []);
  });
});

describe('dashboard service - business name fallbacks', () => {
  it('uses a user-provided businessName', async () => {
    const repo = new InMemoryDashboardRepository();
    const service = makeService(repo, { getBusinessName: async () => 'Raju General Store' });

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.businessName, 'Raju General Store');
  });

  it('uses fallback when businessName is null', async () => {
    const repo = new InMemoryDashboardRepository();
    const service = makeService(repo, {
      getBusinessName: async () => null,
      fallbackBusinessName: 'Fallback',
    });

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.businessName, 'Fallback');
  });

  it('uses default fallback "My Business" when DASHBOARD_BUSINESS_NAME is absent', async () => {
    const previous = process.env.DASHBOARD_BUSINESS_NAME;
    delete process.env.DASHBOARD_BUSINESS_NAME;
    try {
      const repo = new InMemoryDashboardRepository();
      const service = createDashboardService({
        repository: repo,
        now: () => NOW,
        getBusinessName: async () => undefined,
      });
      const summary = await service.getDashboardSummary(BUSINESS_ID);
      assert.strictEqual(summary.businessName, 'My Business');
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_BUSINESS_NAME;
      else process.env.DASHBOARD_BUSINESS_NAME = previous;
    }
  });

  it('uses default fallback "My Business" when DASHBOARD_BUSINESS_NAME is blank', async () => {
    const previous = process.env.DASHBOARD_BUSINESS_NAME;
    process.env.DASHBOARD_BUSINESS_NAME = '   ';
    try {
      const repo = new InMemoryDashboardRepository();
      const service = createDashboardService({
        repository: repo,
        now: () => NOW,
        getBusinessName: async () => undefined,
      });
      const summary = await service.getDashboardSummary(BUSINESS_ID);
      assert.strictEqual(summary.businessName, 'My Business');
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_BUSINESS_NAME;
      else process.env.DASHBOARD_BUSINESS_NAME = previous;
    }
  });

  it('uses the configured DASHBOARD_BUSINESS_NAME env value when present', async () => {
    const previous = process.env.DASHBOARD_BUSINESS_NAME;
    process.env.DASHBOARD_BUSINESS_NAME = 'Env Configured Shop';
    try {
      const repo = new InMemoryDashboardRepository();
      const service = createDashboardService({
        repository: repo,
        now: () => NOW,
        getBusinessName: async () => undefined,
      });
      const summary = await service.getDashboardSummary(BUSINESS_ID);
      assert.strictEqual(summary.businessName, 'Env Configured Shop');
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_BUSINESS_NAME;
      else process.env.DASHBOARD_BUSINESS_NAME = previous;
    }
  });
});

describe('dashboard service - error handling', () => {
  it('propagates business-name lookup errors', async () => {
    const repo = new InMemoryDashboardRepository();
    const service = makeService(repo, {
      getBusinessName: async () => {
        throw new Error('user lookup failed');
      },
    });

    await assert.rejects(
      () => service.getDashboardSummary(BUSINESS_ID),
      /user lookup failed/
    );
  });

  it('propagates listCustomerTransactionGroups errors', async () => {
    const failingRepo: TransactionRepository = {
      create: async () => { throw new Error('not used'); },
      createIdempotent: async () => { throw new Error('not used'); },
      findByIdempotencyKey: async () => { throw new Error('not used'); },
      findById: async () => { throw new Error('not used'); },
      listForBusiness: async () => [],
      listForCustomer: async () => [],
      listCustomerTransactionGroups: async () => { throw new Error('groups failed'); },
      findHistory: async () => { throw new Error('not used'); },
    };
    const service = createDashboardService({ repository: failingRepo, now: () => NOW });

    await assert.rejects(
      () => service.getDashboardSummary(BUSINESS_ID),
      /groups failed/
    );
  });
});

describe('dashboard service - Decimal integration', () => {
  it('daily totals preserve fractional amounts', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('s1', 'SALE', '100.50', NOW));
    repo.transactions.push(makeTransaction('s2', 'SALE', '25.25', NOW));
    repo.transactions.push(makeTransaction('e1', 'EXPENSE', '10.75', NOW));
    repo.transactions.push(makeTransaction('p1', 'PAYMENT', '5.50', NOW));
    repo.transactions.push(makeTransaction('c1', 'CREDIT', '200.25', NOW));
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 125.75);
    assert.strictEqual(summary.todaysExpenses, 10.75);
    assert.strictEqual(summary.paymentsReceived, 5.5);
    assert.strictEqual(summary.newCredit, 200.25);
  });

  it('totalOutstanding across multiple customers preserves fractional precision', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('a1', 'CREDIT', '450.50', NOW),
        makeTransaction('a2', 'PAYMENT', '100.25', NOW),
      ],
    });
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('b1', 'CREDIT', '200.75', NOW),
        makeTransaction('b2', 'PAYMENT', '20.50', NOW),
      ],
    });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.totalOutstanding, 530.5);
  });

  it('response monetary values are numbers, not Decimal objects or concatenated strings', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('s1', 'SALE', '100.50', NOW));
    repo.groups.push({ businessId: BUSINESS_ID, transactions: [] });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    for (const key of ['todaysSales', 'todaysExpenses', 'paymentsReceived', 'newCredit', 'totalOutstanding'] as const) {
      assert.strictEqual(typeof summary[key], 'number', `${key} must be a number`);
    }
    assert.strictEqual(summary.todaysSales, 100.5);
  });

  it('integer-based dashboard behavior remains correct', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('s1', 'SALE', 100, NOW));
    repo.transactions.push(makeTransaction('p1', 'PAYMENT', 50, NOW));
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [makeTransaction('c1', 'CREDIT', 500, NOW)],
    });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);
    assert.strictEqual(summary.todaysSales, 100);
    assert.strictEqual(summary.paymentsReceived, 50);
    assert.strictEqual(summary.totalOutstanding, 500);
  });
});

describe('dashboard service - multi-tenant scoping', () => {
  it('passes the explicit businessId to both repository reads', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.groups.push({ businessId: BUSINESS_ID, transactions: [] });
    const service = makeService(repo);

    await service.getDashboardSummary(BUSINESS_ID);

    assert.deepStrictEqual(repo.businessReads, [BUSINESS_ID, BUSINESS_ID]);
  });

  it('excludes transactions from another business', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('own', 'SALE', '100.50', NOW));
    repo.transactions.push(makeTransaction(
      'foreign', 'SALE', '999.99', NOW,
      { businessId: OTHER_BUSINESS_ID, customerId: 'c-foreign' }
    ));
    repo.groups.push({ businessId: BUSINESS_ID, transactions: [makeTransaction('b1', 'CREDIT', '200.25', NOW)] });
    repo.groups.push({
      businessId: OTHER_BUSINESS_ID,
      transactions: [makeTransaction('b2', 'CREDIT', '888.88', NOW, { businessId: OTHER_BUSINESS_ID })],
    });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.todaysSales, 100.5);
    assert.strictEqual(summary.totalOutstanding, 200.25);
    assert.strictEqual(summary.recentTransactions.length, 1);
    assert.strictEqual(summary.recentTransactions[0].id, 'own');
  });

  it('VOIDED transactions are excluded from totals and recent list', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('active', 'SALE', '100.50', NOW));
    repo.transactions.push(makeTransaction('void', 'SALE', '900', NOW, { status: 'VOIDED' }));
    repo.groups.push({
      businessId: BUSINESS_ID,
      transactions: [
        makeTransaction('c1', 'CREDIT', '500', NOW),
        makeTransaction('c2', 'CREDIT', '700', NOW, { status: 'VOIDED' }),
      ],
    });
    const service = makeService(repo);

    const summary = await service.getDashboardSummary(BUSINESS_ID);

    assert.strictEqual(summary.todaysSales, 100.5);
    assert.strictEqual(summary.totalOutstanding, 500);
    assert.strictEqual(summary.recentTransactions.length, 1);
    assert.strictEqual(summary.recentTransactions[0].id, 'active');
  });

  it('a second business sees only its own data with the same service instance', async () => {
    const repo = new InMemoryDashboardRepository();
    repo.transactions.push(makeTransaction('own', 'SALE', '10.50', NOW));
    repo.transactions.push(makeTransaction(
      'other', 'SALE', '20.25', NOW,
      { businessId: OTHER_BUSINESS_ID, customerId: 'c-other' }
    ));
    const service = makeService(repo);

    const own = await service.getDashboardSummary(BUSINESS_ID);
    const other = await service.getDashboardSummary(OTHER_BUSINESS_ID);

    assert.strictEqual(own.todaysSales, 10.5);
    assert.strictEqual(own.recentTransactions.length, 1);
    assert.strictEqual(own.recentTransactions[0].id, 'own');
    assert.strictEqual(other.todaysSales, 20.25);
    assert.strictEqual(other.recentTransactions.length, 1);
    assert.strictEqual(other.recentTransactions[0].id, 'other');
    assert.deepStrictEqual(repo.businessReads, [BUSINESS_ID, BUSINESS_ID, OTHER_BUSINESS_ID, OTHER_BUSINESS_ID]);
  });
});
