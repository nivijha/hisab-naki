import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCustomerService } from '../../../services/ledger/customerService.js';
import type {
  CreateCustomerInput,
  CustomerRepository,
  CustomerWithTransactions,
  DeleteCustomerOutcome,
  UpdateCustomerData,
} from '../../../repositories/customerRepository.js';
import type { Customer, Transaction } from '@prisma/client';

function makeCustomer(id: string, userId: string, name: string, phone: string | null = null): Customer {
  return {
    id,
    userId,
    name,
    phone,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeTransaction(id: string, type: 'CREDIT' | 'PAYMENT' | 'SALE' | 'EXPENSE', amount: number): Transaction {
  return {
    id,
    userId: 'user-1',
    customerId: 'c-1',
    type,
    amount,
    description: 'test',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

class InMemoryCustomerRepository implements CustomerRepository {
  readonly customers = new Map<string, Customer>();
  readonly transactions = new Map<string, Transaction[]>();
  nextId = 1;

  async create(input: CreateCustomerInput): Promise<Customer> {
    const customer = makeCustomer(`c-${this.nextId++}`, input.userId, input.name, input.phone ?? null);
    this.customers.set(customer.id, customer);
    this.transactions.set(customer.id, []);
    return customer;
  }

  async update(
    userId: string,
    customerId: string,
    data: UpdateCustomerData
  ): Promise<Customer | null> {
    const customer = this.customers.get(customerId);
    if (!customer || customer.userId !== userId) return null;
    const updated: Customer = {
      ...customer,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
    };
    this.customers.set(customerId, updated);
    return updated;
  }

  async delete(userId: string, customerId: string): Promise<DeleteCustomerOutcome> {
    const customer = this.customers.get(customerId);
    if (!customer || customer.userId !== userId) return { status: 'NOT_FOUND' };
    if ((this.transactions.get(customerId) ?? []).length > 0) {
      return { status: 'HAS_TRANSACTIONS' };
    }
    this.customers.delete(customerId);
    this.transactions.delete(customerId);
    return { status: 'DELETED' };
  }

  async findById(userId: string, customerId: string): Promise<CustomerWithTransactions | null> {
    const customer = this.customers.get(customerId);
    if (!customer || customer.userId !== userId) return null;
    return { ...customer, transactions: this.transactions.get(customerId) ?? [] };
  }

  async findByName(userId: string, customerName: string): Promise<CustomerWithTransactions | null> {
    const found = this.findByCaseInsensitiveName(userId, customerName);
    if (!found) return null;
    return { ...found, transactions: this.transactions.get(found.id) ?? [] };
  }

  async findByNameForDuplicateCheck(userId: string, customerName: string): Promise<Customer | null> {
    return this.findByCaseInsensitiveName(userId, customerName);
  }

  async listForUser(userId: string): Promise<CustomerWithTransactions[]> {
    return [...this.customers.values()]
      .filter((c) => c.userId === userId)
      .reverse()
      .map((c) => ({ ...c, transactions: this.transactions.get(c.id) ?? [] }));
  }

  private findByCaseInsensitiveName(userId: string, name: string): Customer | null {
    const lower = name.toLowerCase();
    for (const customer of this.customers.values()) {
      if (customer.userId === userId && customer.name.toLowerCase() === lower) {
        return customer;
      }
    }
    return null;
  }
}

describe('customer service (repository boundary)', () => {
  it('successful customer creation', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const customer = await service.ensureCustomer('user-1', 'Raju Sharma');

    assert.strictEqual(customer.name, 'Raju Sharma');
    assert.strictEqual(customer.userId, 'user-1');
    assert.strictEqual(customer.phone, null);
    assert.strictEqual(repo.customers.size, 1);
  });

  it('customer creation trims the name', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const customer = await service.ensureCustomer('user-1', '  Raju  ');
    assert.strictEqual(customer.name, 'Raju');
  });

  it('empty customer name is rejected', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    await assert.rejects(
      () => service.ensureCustomer('user-1', '   '),
      /Customer name is required/
    );
    assert.strictEqual(repo.customers.size, 0);
  });

  it('duplicate customer handling is case-insensitive and returns existing', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const first = await service.ensureCustomer('user-1', 'Raju', '123');
    const duplicate = await service.ensureCustomer('user-1', 'RAJU', '999');

    assert.strictEqual(duplicate.id, first.id);
    assert.strictEqual(duplicate.name, first.name);
    assert.strictEqual(repo.customers.size, 1, 'no second customer created');
  });

  it('duplicate check is scoped to the user', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    await service.ensureCustomer('user-1', 'Raju');
    const otherUserCustomer = await service.ensureCustomer('user-2', 'Raju');

    assert.notStrictEqual(otherUserCustomer.userId, 'user-1');
    assert.strictEqual(repo.customers.size, 2);
  });

  it('customer lookup by ID returns customer with outstanding balance', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');
    repo.transactions.set(created.id, [
      makeTransaction('t-1', 'CREDIT', 500),
      makeTransaction('t-2', 'PAYMENT', 200),
    ]);

    const customer = await service.getCustomerById('user-1', created.id);

    assert.ok(customer);
    assert.strictEqual(customer.name, 'Raju');
    assert.strictEqual(customer.outstandingBalance, 300);
    assert.strictEqual(customer.transactions.length, 2);
  });

  it('customer not found returns null (by id)', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const customer = await service.getCustomerById('user-1', 'missing');
    assert.strictEqual(customer, null);
  });

  it('customer not found returns null (by name)', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const customer = await service.getCustomerByName('user-1', 'Unknown');
    assert.strictEqual(customer, null);
  });

  it('customer lookup by name is case-insensitive', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju Sharma');

    const customer = await service.getCustomerByName('user-1', 'raju sharma');
    assert.ok(customer);
    assert.strictEqual(customer.id, created.id);
  });

  it('customer listing includes summary fields', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const a = await service.ensureCustomer('user-1', 'Amit');
    await service.ensureCustomer('user-1', 'Neha');
    await service.ensureCustomer('user-2', 'Other User Customer');
    repo.transactions.set(a.id, [
      makeTransaction('t-1', 'CREDIT', 400),
      makeTransaction('t-2', 'PAYMENT', 100),
    ]);

    const customers = await service.getCustomersForUser('user-1');

    assert.strictEqual(customers.length, 2, 'only user-1 customers listed');
    const amit = customers.find((c) => c.name === 'Amit');
    assert.ok(amit);
    assert.strictEqual(amit.outstandingBalance, 300);
    assert.strictEqual(amit.transactionCount, 2);
    assert.ok('createdAt' in amit);
    assert.ok('phone' in amit);
  });

  it('getCustomerTransactions returns the same shape as getCustomerById', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');
    repo.transactions.set(created.id, [makeTransaction('t-1', 'CREDIT', 700)]);

    const customer = await service.getCustomerTransactions('user-1', created.id);

    assert.ok(customer);
    assert.strictEqual(customer.outstandingBalance, 700);
    assert.strictEqual(customer.transactions.length, 1);
  });

  it('repository errors propagate through the service', async () => {
    const failingRepo: CustomerRepository = {
      create: async () => { throw new Error('DB down'); },
      update: async () => { throw new Error('DB down'); },
      delete: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      findByName: async () => { throw new Error('DB down'); },
      findByNameForDuplicateCheck: async () => { throw new Error('DB down'); },
      listForUser: async () => { throw new Error('DB down'); },
    };
    const service = createCustomerService(failingRepo);

    await assert.rejects(() => service.ensureCustomer('user-1', 'Raju'), /DB down/);
    await assert.rejects(() => service.getCustomerById('user-1', 'c-1'), /DB down/);
    await assert.rejects(() => service.getCustomersForUser('user-1'), /DB down/);
    await assert.rejects(() => service.getCustomerByName('user-1', 'Raju'), /DB down/);
    await assert.rejects(() => service.getCustomerTransactions('user-1', 'c-1'), /DB down/);
  });
});

describe('customer service - updateCustomer', () => {
  it('1. successful update', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju', '111');

    const result = await service.updateCustomer('user-1', created.id, {
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
    const created = await service.ensureCustomer('user-1', 'Raju');

    const result = await service.updateCustomer('user-1', created.id, { name: '  Amit  ' });
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.customer.name, 'Amit');
  });

  it('3. empty name rejection', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');

    await assert.rejects(
      () => service.updateCustomer('user-1', created.id, { name: '   ' }),
      /Customer name is required/
    );
    const current = await service.getCustomerById('user-1', created.id);
    assert.strictEqual(current?.name, 'Raju', 'name must be unchanged');
  });

  it('4. duplicate name rejection (excludes current customer)', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const raju = await service.ensureCustomer('user-1', 'Raju');
    await service.ensureCustomer('user-1', 'Amit');

    const result = await service.updateCustomer('user-1', raju.id, { name: 'amit' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'NAME_CONFLICT');
    }

    // Updating to the same name (case-insensitive) is allowed
    const sameName = await service.updateCustomer('user-1', raju.id, { name: 'RAJU' });
    assert.strictEqual(sameName.ok, true);
  });

  it('5. updating a customer without changing its name (phone only)', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju', '111');

    const result = await service.updateCustomer('user-1', created.id, { phone: '222' });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.customer.phone, '222');
      assert.strictEqual(result.customer.name, 'Raju');
    }
  });

  it('6. partial update preserves omitted fields', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju', '111');
    repo.transactions.set(created.id, [makeTransaction('t-1', 'CREDIT', 500)]);

    const result = await service.updateCustomer('user-1', created.id, { name: 'Amit' });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.customer.name, 'Amit');
      assert.strictEqual(result.customer.phone, '111', 'omitted phone preserved');
    }
    const detail = await service.getCustomerById('user-1', created.id);
    assert.strictEqual(detail?.transactions.length, 1, 'transactions untouched');
  });

  it('7. updating a nonexistent customer', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const result = await service.updateCustomer('user-1', 'missing', { name: 'Amit' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'NOT_FOUND');
      assert.strictEqual(result.message, 'Customer not found.');
    }
  });

  it('8. customer belonging to another user cannot be updated', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');

    const result = await service.updateCustomer('user-2', created.id, { name: 'Hacked' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'NOT_FOUND');

    const current = await service.getCustomerById('user-1', created.id);
    assert.strictEqual(current?.name, 'Raju', 'original customer unchanged');
  });

  it('9. repository errors propagate correctly', async () => {
    const failingRepo: CustomerRepository = {
      create: async () => { throw new Error('DB down'); },
      update: async () => { throw new Error('DB down'); },
      delete: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      findByName: async () => { throw new Error('DB down'); },
      findByNameForDuplicateCheck: async () => { throw new Error('DB down'); },
      listForUser: async () => { throw new Error('DB down'); },
    };
    const service = createCustomerService(failingRepo);

    await assert.rejects(
      () => service.updateCustomer('user-1', 'c-1', { name: 'Amit' }),
      /DB down/
    );
  });

  it('10. empty update request is rejected', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');

    await assert.rejects(
      () => service.updateCustomer('user-1', created.id, {}),
      /At least one field is required/
    );
    const current = await service.getCustomerById('user-1', created.id);
    assert.strictEqual(current?.name, 'Raju');
  });

  it('empty phone clears the phone value', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju', '111');

    const result = await service.updateCustomer('user-1', created.id, { phone: '   ' });
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.customer.phone, null);
  });
});

describe('customer service - deleteCustomer', () => {
  it('1. successful deletion without transactions', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');

    const result = await service.deleteCustomer('user-1', created.id);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(repo.customers.has(created.id), false);
    assert.strictEqual(await service.getCustomerById('user-1', created.id), null);
  });

  it('2. deletion blocked when transactions exist', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');
    repo.transactions.set(created.id, [makeTransaction('t-1', 'CREDIT', 500)]);

    const result = await service.deleteCustomer('user-1', created.id);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'HAS_TRANSACTIONS');
      assert.match(result.message, /transaction history/);
    }
    assert.strictEqual(repo.customers.has(created.id), true, 'customer must still exist');
    assert.strictEqual(repo.transactions.get(created.id)?.length, 1, 'transaction must be preserved');
  });

  it('3. customer not found', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const result = await service.deleteCustomer('user-1', 'missing');

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, 'NOT_FOUND');
      assert.strictEqual(result.message, 'Customer not found.');
    }
  });

  it('4. customer belonging to another user cannot be deleted', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);
    const created = await service.ensureCustomer('user-1', 'Raju');

    const result = await service.deleteCustomer('user-2', created.id);

    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.strictEqual(result.code, 'NOT_FOUND');
    assert.strictEqual(repo.customers.has(created.id), true, 'other user customer untouched');
  });

  it('5. repository errors propagate correctly', async () => {
    const failingRepo: CustomerRepository = {
      create: async () => { throw new Error('DB down'); },
      update: async () => { throw new Error('DB down'); },
      delete: async () => { throw new Error('DB down'); },
      findById: async () => { throw new Error('DB down'); },
      findByName: async () => { throw new Error('DB down'); },
      findByNameForDuplicateCheck: async () => { throw new Error('DB down'); },
      listForUser: async () => { throw new Error('DB down'); },
    };
    const service = createCustomerService(failingRepo);

    await assert.rejects(
      () => service.deleteCustomer('user-1', 'c-1'),
      /DB down/
    );
  });

  it('6. existing customer operations continue working', async () => {
    const repo = new InMemoryCustomerRepository();
    const service = createCustomerService(repo);

    const created = await service.ensureCustomer('user-1', 'Raju', '111');
    const listed = await service.getCustomersForUser('user-1');
    assert.strictEqual(listed.length, 1);

    const renamed = await service.updateCustomer('user-1', created.id, { name: 'Raju Sharma' });
    assert.strictEqual(renamed.ok, true);

    const removed = await service.deleteCustomer('user-1', created.id);
    assert.strictEqual(removed.ok, true);

    assert.strictEqual((await service.getCustomersForUser('user-1')).length, 0);
    assert.strictEqual(await service.getCustomerByName('user-1', 'Raju Sharma'), null);
  });
});
