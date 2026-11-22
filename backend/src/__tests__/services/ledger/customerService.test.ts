import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Prisma } from '@prisma/client';
import type { Customer, Transaction } from '@prisma/client';
import { createCustomerService } from '../../../services/ledger/customerService.js';
import type {
  CreateCustomerInput,
  CustomerRepository,
  CustomerWithTransactions,
  DeleteCustomerOutcome,
  UpdateCustomerData,
} from '../../../repositories/customerRepository.js';

const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';
const CREATOR_ID = 'user-1';
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

function makeTransaction(
  id: string,
  type: 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE',
  amount: number | string,
  customerId = 'c-1'
): Transaction {
  return {
    id,
    businessId: BUSINESS_ID,
    customerId,
    type,
    status: 'ACTIVE',
    amount: new Prisma.Decimal(amount),
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
  };
}

class InMemoryCustomerRepository implements CustomerRepository {
  readonly customers = new Map<string, Customer>();
  readonly transactions = new Map<string, Transaction[]>();
  nextId = 1;

  async create(input: CreateCustomerInput): Promise<Customer> {
    const customer = makeCustomer({
      id: `c-${this.nextId++}`,
      businessId: input.businessId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      phone: input.phone ?? null,
    });
    this.customers.set(customer.id, customer);
    this.transactions.set(customer.id, []);
    return customer;
  }

  async update(
    businessId: string,
    customerId: string,
    data: UpdateCustomerData
  ): Promise<Customer | null> {
    const customer = this.customers.get(customerId);
    if (!customer || customer.businessId !== businessId) return null;
    const updated: Customer = {
      ...customer,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
    };
    this.customers.set(customerId, updated);
    return updated;
  }

  async delete(businessId: string, customerId: string): Promise<DeleteCustomerOutcome> {
    const customer = this.customers.get(customerId);
    if (!customer || customer.businessId !== businessId) return { status: 'NOT_FOUND' };
    if ((this.transactions.get(customerId) ?? []).length > 0) {
      return { status: 'HAS_TRANSACTIONS' };
    }
    this.customers.delete(customerId);
    this.transactions.delete(customerId);
    return { status: 'DELETED' };
  }

  async findById(businessId: string, customerId: string): Promise<CustomerWithTransactions | null> {
    const customer = this.customers.get(customerId);
    if (!customer || customer.businessId !== businessId) return null;
    return { ...customer, transactions: this.transactions.get(customerId) ?? [] };
  }

  async findByName(businessId: string, customerName: string): Promise<CustomerWithTransactions | null> {
    const found = this.findByCaseInsensitiveName(businessId, customerName);
    if (!found) return null;
    return { ...found, transactions: this.transactions.get(found.id) ?? [] };
  }

  async findByNameForDuplicateCheck(businessId: string, customerName: string): Promise<Customer | null> {
    return this.findByCaseInsensitiveName(businessId, customerName);
  }

  async listForBusiness(businessId: string): Promise<CustomerWithTransactions[]> {
    return [...this.customers.values()]
      .filter((c) => c.businessId === businessId)
      .reverse()
      .map((c) => ({ ...c, transactions: this.transactions.get(c.id) ?? [] }));
  }

  private findByCaseInsensitiveName(businessId: string, name: string): Customer | null {
    const lower = name.toLowerCase();
    for (const customer of this.customers.values()) {
      if (customer.businessId === businessId && customer.name.toLowerCase() === lower) {
        return customer;
      }
    }
    return null;
  }
}

describe('customer service - business-scoped creation', () => {
  it('successful customer creation passes businessId and createdByUserId', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const customer = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju Sharma');

    assert.strictEqual(customer.name, 'Raju Sharma');
    assert.strictEqual(customer.businessId, BUSINESS_ID);
    assert.strictEqual(customer.createdByUserId, CREATOR_ID);
    assert.strictEqual(customer.phone, null);
    assert.strictEqual(repo.customers.size, 1);
  });

  it('customer creation trims the name', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const customer = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, '  Raju  ');
    assert.strictEqual(customer.name, 'Raju');
  });

  it('empty customer name is rejected', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    await assert.rejects(
      () => service.ensureCustomer(BUSINESS_ID, CREATOR_ID, '   '),
      /Customer name is required/
    );
    assert.strictEqual(repo.customers.size, 0);
  });

  it('duplicate customer handling is case-insensitive and returns existing', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const first = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju', '123');
    const duplicate = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'RAJU', '999');

    assert.strictEqual(duplicate.id, first.id);
    assert.strictEqual(duplicate.name, first.name);
    assert.strictEqual(repo.customers.size, 1);
  });

  it('duplicate check is scoped to the business', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    const otherBusinessCustomer = await service.ensureCustomer(OTHER_BUSINESS_ID, CREATOR_ID, 'Raju');

    assert.notStrictEqual(otherBusinessCustomer.businessId, BUSINESS_ID);
    assert.strictEqual(repo.customers.size, 2);
  });
});

describe('customer service - business-scoped reads', () => {
  it('lookup by ID uses the supplied business and returns outstanding balance', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    repo.transactions.set(created.id, [
      makeTransaction('t-1', 'CREDIT', 500),
      makeTransaction('t-2', 'PAYMENT', 200),
    ]);

    const customer = await service.getCustomerById(BUSINESS_ID, created.id);

    assert.ok(customer);
    assert.strictEqual(customer.name, 'Raju');
    assert.strictEqual(customer.outstandingBalance, 300);
    assert.strictEqual(customer.transactions.length, 2);
  });

  it('lookup by ID with a different business returns null', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');

    assert.strictEqual(
      await service.getCustomerById(OTHER_BUSINESS_ID, created.id),
      null,
      'cross-business lookup must be not found'
    );
  });

  it('customer not found returns null (by id and by name)', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    assert.strictEqual(await service.getCustomerById(BUSINESS_ID, 'missing'), null);
    assert.strictEqual(await service.getCustomerByName(BUSINESS_ID, 'Unknown'), null);
  });

  it('lookup by name is case-insensitive within the business', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju Sharma');

    const customer = await service.getCustomerByName(BUSINESS_ID, 'raju sharma');
    assert.ok(customer);
    assert.strictEqual(customer.id, created.id);
    assert.strictEqual(await service.getCustomerByName(OTHER_BUSINESS_ID, 'Raju Sharma'), null);
  });

  it('listing is scoped to the supplied business', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const a = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Amit');
    await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Neha');
    await service.ensureCustomer(OTHER_BUSINESS_ID, CREATOR_ID, 'Other Business Customer');
    repo.transactions.set(a.id, [
      makeTransaction('t-1', 'CREDIT', 400),
      makeTransaction('t-2', 'PAYMENT', 100),
    ]);

    const customers = await service.getCustomersForBusiness(BUSINESS_ID);

    assert.strictEqual(customers.length, 2, 'only current-business customers listed');
    const amit = customers.find((c) => c.name === 'Amit');
    assert.ok(amit);
    assert.strictEqual(amit.outstandingBalance, 300);
    assert.strictEqual(amit.transactionCount, 2);
    assert.ok('createdAt' in amit);
    assert.ok('phone' in amit);
    assert.strictEqual((await service.getCustomersForBusiness(OTHER_BUSINESS_ID)).length, 1);
  });

  it('getCustomerTransactions uses the supplied business', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    repo.transactions.set(created.id, [makeTransaction('t-1', 'CREDIT', 700)]);

    const customer = await service.getCustomerTransactions(BUSINESS_ID, created.id);
    assert.ok(customer);
    assert.strictEqual(customer.outstandingBalance, 700);
    assert.strictEqual(customer.transactions.length, 1);
    assert.strictEqual(await service.getCustomerTransactions(OTHER_BUSINESS_ID, created.id), null);
  });

  it('repository errors propagate through the service', async () => {
    const failingRepo: CustomerRepository = {
      create: async () => { throw new Error('DB down'); },
      update: async () => { throw new Error('DB down'); },
      delete: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      findByName: async () => { throw new Error('DB down'); },
      findByNameForDuplicateCheck: async () => { throw new Error('DB down'); },
      listForBusiness: async () => { throw new Error('DB down'); },
    };
    const service = createCustomerService(failingRepo);

    await assert.rejects(() => service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju'), /DB down/);
    await assert.rejects(() => service.getCustomerById(BUSINESS_ID, 'c-1'), /DB down/);
    await assert.rejects(() => service.getCustomersForBusiness(BUSINESS_ID), /DB down/);
    await assert.rejects(() => service.getCustomerByName(BUSINESS_ID, 'Raju'), /DB down/);
    await assert.rejects(() => service.getCustomerTransactions(BUSINESS_ID, 'c-1'), /DB down/);
  });
});

describe('customer service - business-scoped updateCustomer', () => {
  it('1. successful update', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju', '111');

    const result = await service.updateCustomer(BUSINESS_ID, created.id, {
      name: 'Raju Sharma',
      phone: '999',
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.customer.name, 'Raju Sharma');
      assert.strictEqual(result.customer.phone, '999');
      assert.strictEqual(result.customer.id, created.id);
    }
  });

  it('2. name trimming', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');

    const result = await service.updateCustomer(BUSINESS_ID, created.id, { name: '  Amit  ' });
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.customer.name, 'Amit');
  });

  it('3. empty name rejection', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');

    await assert.rejects(
      () => service.updateCustomer(BUSINESS_ID, created.id, { name: '   ' }),
      /Customer name is required/
    );
    const current = await service.getCustomerById(BUSINESS_ID, created.id);
    assert.strictEqual(current?.name, 'Raju');
  });

  it('4. duplicate name rejection (excludes current customer)', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const raju = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Amit');

    const result = await service.updateCustomer(BUSINESS_ID, raju.id, { name: 'amit' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'NAME_CONFLICT');

    const sameName = await service.updateCustomer(BUSINESS_ID, raju.id, { name: 'RAJU' });
    assert.strictEqual(sameName.ok, true);
  });

  it('5. updating a customer without changing its name (phone only)', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju', '111');

    const result = await service.updateCustomer(BUSINESS_ID, created.id, { phone: '222' });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.customer.phone, '222');
      assert.strictEqual(result.customer.name, 'Raju');
    }
  });

  it('6. partial update preserves omitted fields', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju', '111');
    repo.transactions.set(created.id, [makeTransaction('t-1', 'CREDIT', 500)]);

    const result = await service.updateCustomer(BUSINESS_ID, created.id, { name: 'Amit' });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.customer.name, 'Amit');
      assert.strictEqual(result.customer.phone, '111', 'omitted phone preserved');
    }
    const detail = await service.getCustomerById(BUSINESS_ID, created.id);
    assert.strictEqual(detail?.transactions.length, 1);
  });

  it('7. updating a nonexistent customer', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const result = await service.updateCustomer(BUSINESS_ID, 'missing', { name: 'Amit' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'NOT_FOUND');
      assert.strictEqual(result.message, 'Customer not found.');
    }
  });

  it('8. customer belonging to another business cannot be updated', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');

    const result = await service.updateCustomer(OTHER_BUSINESS_ID, created.id, { name: 'Hacked' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'NOT_FOUND');

    const current = await service.getCustomerById(BUSINESS_ID, created.id);
    assert.strictEqual(current?.name, 'Raju');
  });

  it('9. repository errors propagate correctly', async () => {
    const failingRepo: CustomerRepository = {
      create: async () => { throw new Error('DB down'); },
      update: async () => { throw new Error('DB down'); },
      delete: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      findByName: async () => { throw new Error('DB down'); },
      findByNameForDuplicateCheck: async () => { throw new Error('DB down'); },
      listForBusiness: async () => { throw new Error('DB down'); },
    };
    const service = createCustomerService(failingRepo);

    await assert.rejects(
      () => service.updateCustomer(BUSINESS_ID, 'c-1', { name: 'Amit' }),
      /DB down/
    );
  });

  it('10. empty update request is rejected', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');

    await assert.rejects(
      () => service.updateCustomer(BUSINESS_ID, created.id, {}),
      /At least one field is required/
    );
  });

  it('empty phone clears the phone value', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju', '111');

    const result = await service.updateCustomer(BUSINESS_ID, created.id, { phone: '   ' });
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.customer.phone, null);
  });
});

describe('customer service - outstanding balances', () => {
  it('fractional outstanding balance is preserved exactly', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    repo.transactions.set(created.id, [
      makeTransaction('t1', 'CREDIT', '100.50'),
      makeTransaction('t2', 'PAYMENT', '25.25'),
    ]);

    const customer = await service.getCustomerById(BUSINESS_ID, created.id);
    assert.ok(customer);
    assert.strictEqual(customer.outstandingBalance, 75.25);
  });

  it('integer-based behavior remains correct', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    repo.transactions.set(created.id, [
      makeTransaction('t1', 'CREDIT', 450),
      makeTransaction('t2', 'PAYMENT', 200),
      makeTransaction('t3', 'SALE', 1000),
      makeTransaction('t4', 'EXPENSE', 500),
    ]);

    const customer = await service.getCustomerById(BUSINESS_ID, created.id);
    assert.ok(customer);
    assert.strictEqual(customer.outstandingBalance, 250);
  });

  it('response contract keeps outstandingBalance a number', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const a = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Amit');
    repo.transactions.set(a.id, [makeTransaction('t1', 'CREDIT', '10.10')]);

    const listed = await service.getCustomersForBusiness(BUSINESS_ID);
    assert.strictEqual(typeof listed[0].outstandingBalance, 'number');
    assert.strictEqual(listed[0].outstandingBalance, 10.1);
  });

  it('overpayment produces a negative number', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    repo.transactions.set(created.id, [
      makeTransaction('t1', 'CREDIT', 100),
      makeTransaction('t2', 'PAYMENT', 300),
    ]);

    const customer = await service.getCustomerById(BUSINESS_ID, created.id);
    assert.ok(customer);
    assert.strictEqual(typeof customer.outstandingBalance, 'number');
    assert.strictEqual(customer.outstandingBalance, -200);
  });
});

describe('customer service - business-scoped deleteCustomer', () => {
  it('1. successful deletion without transactions', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');

    const result = await service.deleteCustomer(BUSINESS_ID, created.id);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(repo.customers.has(created.id), false);
    assert.strictEqual(await service.getCustomerById(BUSINESS_ID, created.id), null);
  });

  it('2. deletion blocked when transactions exist', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');
    repo.transactions.set(created.id, [makeTransaction('t-1', 'CREDIT', 500)]);

    const result = await service.deleteCustomer(BUSINESS_ID, created.id);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'HAS_TRANSACTIONS');
      assert.match(result.message, /transaction history/);
    }
    assert.strictEqual(repo.customers.has(created.id), true);
    assert.strictEqual(repo.transactions.get(created.id)?.length, 1);
  });

  it('3. customer not found', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const result = await service.deleteCustomer(BUSINESS_ID, 'missing');

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'NOT_FOUND');
      assert.strictEqual(result.message, 'Customer not found.');
    }
  });

  it('4. customer belonging to another business cannot be deleted', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju');

    const result = await service.deleteCustomer(OTHER_BUSINESS_ID, created.id);

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'NOT_FOUND');
    assert.strictEqual(repo.customers.has(created.id), true);
  });

  it('5. repository errors propagate correctly', async () => {
    const failingRepo: CustomerRepository = {
      create: async () => { throw new Error('DB down'); },
      update: async () => { throw new Error('DB down'); },
      delete: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      findByName: async () => { throw new Error('DB down'); },
      findByNameForDuplicateCheck: async () => { throw new Error('DB down'); },
      listForBusiness: async () => { throw new Error('DB down'); },
    };
    const service = createCustomerService(failingRepo);

    await assert.rejects(() => service.deleteCustomer(BUSINESS_ID, 'c-1'), /DB down/);
  });

  it('6. existing customer operations continue working', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const created = await service.ensureCustomer(BUSINESS_ID, CREATOR_ID, 'Raju', '111');
    assert.strictEqual((await service.getCustomersForBusiness(BUSINESS_ID)).length, 1);

    const renamed = await service.updateCustomer(BUSINESS_ID, created.id, { name: 'Raju Sharma' });
    assert.strictEqual(renamed.ok, true);

    const removed = await service.deleteCustomer(BUSINESS_ID, created.id);
    assert.strictEqual(removed.ok, true);

    assert.strictEqual((await service.getCustomersForBusiness(BUSINESS_ID)).length, 0);
    assert.strictEqual(await service.getCustomerByName(BUSINESS_ID, 'Raju Sharma'), null);
  });
});
