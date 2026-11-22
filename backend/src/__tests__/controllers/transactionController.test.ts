import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createTransactionController, type TransactionControllerServices } from '../../controllers/transactionController.js';
import { HttpError } from '../../middleware/authenticate.js';
import { TEST_AUTH, makeReq, makeRes } from '../helpers/http.js';

function makeServices() {
  const calls: Record<string, unknown[][]> = {
    createTransaction: [],
    getCustomerBalanceForName: [],
    getTotalOutstandingForUser: [],
    getTransactionById: [],
    getTransactionHistory: [],
    getTransactionsForUser: [],
    getCustomerByName: [],
    getDashboardSummary: [],
  };
  const services = {
    createTransaction: async (...args: unknown[]) => {
      calls.createTransaction.push(args);
      return { customer: { name: 'Raju' }, outstandingBalance: 450 };
    },
    getCustomerBalanceForName: async (...args: unknown[]) => {
      calls.getCustomerBalanceForName.push(args);
      return { customerName: 'Raju', outstandingBalance: 450, balanceText: '₹450' };
    },
    getTotalOutstandingForUser: async (...args: unknown[]) => {
      calls.getTotalOutstandingForUser.push(args);
      return { totalOutstanding: 450, totalOutstandingText: '₹450' };
    },
    getTransactionById: async (...args: unknown[]) => {
      calls.getTransactionById.push(args);
      return null;
    },
    getTransactionHistory: async (...args: unknown[]) => {
      calls.getTransactionHistory.push(args);
      return { transactions: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    },
    getTransactionsForUser: async (...args: unknown[]) => {
      calls.getTransactionsForUser.push(args);
      return [];
    },
    getCustomerByName: async (...args: unknown[]) => {
      calls.getCustomerByName.push(args);
      return null;
    },
    getDashboardSummary: async (...args: unknown[]) => {
      calls.getDashboardSummary.push(args);
      return {
        businessName: 'Shop One',
        todaysSales: 10,
        todaysExpenses: 2,
        paymentsReceived: 3,
        newCredit: 4,
        totalOutstanding: 5,
        recentTransactions: [],
      };
    },
  } as unknown as TransactionControllerServices;
  return { services, calls };
}

describe('transaction controller - tenant context', () => {
  it('creation passes businessId and createdByUserId from auth, ignoring body spoofing', async () => {
    const { services, calls } = makeServices();
    const controller = createTransactionController(services);
    const res = makeRes();

    await controller.createTransactionHandler(
      makeReq({
        auth: TEST_AUTH,
        body: {
          customerName: 'Raju', amount: 100, type: 'CREDIT',
          businessId: 'biz-2', createdByUserId: 'attacker',
        },
      }),
      res
    );

    assert.strictEqual(res.statusCode, 201);
    const input = calls.createTransaction[0][0] as Record<string, unknown>;
    assert.strictEqual(input.businessId, 'biz-1');
    assert.strictEqual(input.createdByUserId, 'user-1');
  });

  it('balance and total outstanding intents use authenticated businessId', async () => {
    const { services, calls } = makeServices();
    const controller = createTransactionController(services);

    await controller.createTransactionHandler(
      makeReq({ auth: TEST_AUTH, body: { intent: 'GET_BALANCE', customerName: 'Raju' } }),
      makeRes()
    );
    await controller.createTransactionHandler(
      makeReq({ auth: TEST_AUTH, body: { intent: 'GET_TOTAL_OUTSTANDING' } }),
      makeRes()
    );

    assert.deepStrictEqual(calls.getCustomerBalanceForName[0], ['biz-1', 'Raju']);
    assert.deepStrictEqual(calls.getTotalOutstandingForUser[0], ['biz-1']);
  });

  it('today transactions and customer transactions are business-scoped', async () => {
    const { services, calls } = makeServices();
    const controller = createTransactionController(services);

    await controller.createTransactionHandler(
      makeReq({ auth: TEST_AUTH, body: { intent: 'GET_TODAY_TRANSACTIONS' } }),
      makeRes()
    );
    await controller.createTransactionHandler(
      makeReq({ auth: TEST_AUTH, body: { intent: 'GET_CUSTOMER_TRANSACTIONS', customerName: 'Raju' } }),
      makeRes()
    );

    assert.deepStrictEqual(calls.getTransactionsForUser[0], ['biz-1']);
    assert.deepStrictEqual(calls.getCustomerByName[0], ['biz-1', 'Raju']);
  });

  it('list, history and detail use authenticated businessId', async () => {
    const { services, calls } = makeServices();
    const controller = createTransactionController(services);

    await controller.listTransactionsHandler(
      makeReq({ auth: TEST_AUTH, query: { businessId: 'biz-2' } }),
      makeRes()
    );
    await controller.getTransactionByIdHandler(
      makeReq({ auth: TEST_AUTH, params: { id: 'tx-1' } }),
      makeRes()
    );

    assert.deepStrictEqual(calls.getTransactionsForUser[0], ['biz-1']);
    assert.deepStrictEqual(calls.getTransactionById[0], ['biz-1', 'tx-1']);
  });

  it('history query path passes the authenticated businessId with filters', async () => {
    const { services, calls } = makeServices();
    const controller = createTransactionController(services);
    const req = makeReq({ auth: TEST_AUTH, query: { page: 1, limit: 5 } });
    (req as unknown as Request & { historyQueryRequested?: boolean }).historyQueryRequested = true;

    await controller.listTransactionsHandler(req, makeRes());

    const businessId = calls.getTransactionHistory[0][0];
    const query = calls.getTransactionHistory[0][1] as Record<string, unknown>;
    assert.strictEqual(businessId, 'biz-1');
    assert.strictEqual(query.page, 1);
  });

  it('dashboard summary uses authenticated businessId and keeps seven keys', async () => {
    const { services, calls } = makeServices();
    const controller = createTransactionController(services);
    const res = makeRes();

    await controller.dashboardSummaryHandler(makeReq({ auth: TEST_AUTH }), res);

    assert.deepStrictEqual(calls.getDashboardSummary[0], ['biz-1']);
    assert.strictEqual(res.statusCode, 200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    assert.deepStrictEqual(Object.keys(data).sort(), [
      'businessName', 'newCredit', 'paymentsReceived', 'recentTransactions',
      'todaysExpenses', 'todaysSales', 'totalOutstanding',
    ]);
  });
});

describe('transaction controller - error handling', () => {
  it('internal errors do not leak their messages and map to a generic 500', async () => {
    const services = {
      ...makeServices(),
      createTransaction: async () => { throw new Error('db password=hunter2'); },
    } as unknown as TransactionControllerServices;
    const controller = createTransactionController(services);
    const res = makeRes();

    await controller.createTransactionHandler(
      makeReq({ auth: TEST_AUTH, body: { customerName: 'Raju', amount: 100, type: 'CREDIT' } }),
      res
    );

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { ok: false, message: 'Could not process the transaction.' });
  });

  it('HttpError status codes and messages are preserved', async () => {
    const services = {
      ...makeServices(),
      createTransaction: async () => {
        throw new HttpError(409, 'Idempotency key was reused with a different request payload.');
      },
    } as unknown as TransactionControllerServices;
    const controller = createTransactionController(services);
    const res = makeRes();

    await controller.createTransactionHandler(
      makeReq({ auth: TEST_AUTH, body: { customerName: 'Raju', amount: 100, type: 'CREDIT' } }),
      res
    );

    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { ok: false, message: 'Idempotency key was reused with a different request payload.' });
  });
});
