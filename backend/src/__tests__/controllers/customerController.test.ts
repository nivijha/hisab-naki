import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCustomerController, type CustomerControllerServices } from '../../controllers/customerController.js';
import { TEST_AUTH, makeReq, makeRes } from '../helpers/http.js';

function makeServices() {
  const calls: Record<string, unknown[][]> = {
    ensureCustomer: [],
    getCustomersForBusiness: [],
    getCustomerById: [],
    getCustomerTransactions: [],
    updateCustomer: [],
    deleteCustomer: [],
  };
  const services = {
    ensureCustomer: async (...args: unknown[]) => {
      calls.ensureCustomer.push(args);
      return { id: 'c-1', name: 'Raju', businessId: 'biz-1', createdByUserId: 'user-1' };
    },
    getCustomersForBusiness: async (...args: unknown[]) => {
      calls.getCustomersForBusiness.push(args);
      return [];
    },
    getCustomerById: async (...args: unknown[]) => {
      calls.getCustomerById.push(args);
      return null;
    },
    getCustomerTransactions: async (...args: unknown[]) => {
      calls.getCustomerTransactions.push(args);
      return null;
    },
    updateCustomer: async (...args: unknown[]) => {
      calls.updateCustomer.push(args);
      return { ok: true, customer: { id: 'c-1' } };
    },
    deleteCustomer: async (...args: unknown[]) => {
      calls.deleteCustomer.push(args);
      return { ok: true };
    },
  } as unknown as CustomerControllerServices;
  return { services, calls };
}

describe('customer controller - tenant context', () => {
  it('lists customers using the authenticated businessId', async () => {
    const { services, calls } = makeServices();
    const controller = createCustomerController(services);
    const req = makeReq({ auth: TEST_AUTH, query: { businessId: 'biz-2' } });
    const res = makeRes();

    await controller.listCustomersHandler(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(calls.getCustomersForBusiness, [['biz-1']]);
  });

  it('creation uses authenticated businessId and userId, ignoring body tenant IDs', async () => {
    const { services, calls } = makeServices();
    const controller = createCustomerController(services);
    const req = makeReq({
      auth: TEST_AUTH,
      body: { name: 'Raju', phone: '123', businessId: 'biz-2', createdByUserId: 'attacker' },
    });
    const res = makeRes();

    await controller.createCustomerHandler(req, res);

    assert.strictEqual(res.statusCode, 201);
    assert.deepStrictEqual(calls.ensureCustomer[0], ['biz-1', 'user-1', 'Raju', '123']);
  });

  it('detail lookup is scoped to the authenticated business', async () => {
    const { services, calls } = makeServices();
    const controller = createCustomerController(services);
    const req = makeReq({
      auth: TEST_AUTH,
      params: { id: 'c-1' },
      query: { businessId: 'biz-2' },
    });
    await controller.getCustomerDetailHandler(req, makeRes());
    assert.deepStrictEqual(calls.getCustomerById[0], ['biz-1', 'c-1']);
  });

  it('transaction history lookup is scoped to the authenticated business', async () => {
    const { services, calls } = makeServices();
    const controller = createCustomerController(services);
    const req = makeReq({ auth: TEST_AUTH, params: { id: 'c-1' } });
    await controller.getCustomerTransactionsHandler(req, makeRes());
    assert.deepStrictEqual(calls.getCustomerTransactions[0], ['biz-1', 'c-1']);
  });

  it('update and delete pass the authenticated businessId', async () => {
    const { services, calls } = makeServices();
    const controller = createCustomerController(services);

    await controller.updateCustomerHandler(
      makeReq({ auth: TEST_AUTH, params: { id: 'c-1' }, body: { name: 'Raju' } }),
      makeRes()
    );
    await controller.deleteCustomerHandler(
      makeReq({ auth: TEST_AUTH, params: { id: 'c-1' } }),
      makeRes()
    );

    assert.strictEqual(calls.updateCustomer[0][0], 'biz-1');
    assert.deepStrictEqual(calls.deleteCustomer[0], ['biz-1', 'c-1']);
  });
});
