import prisma from '../../lib/prisma.js';
import {
  PrismaCustomerRepository,
  type CustomerRepository,
  type UpdateCustomerData,
} from '../../repositories/customerRepository.js';
import { calculateOutstandingAmount } from '../../utils/ledger.js';

export type UpdateCustomerInput = {
  name?: string;
  phone?: string;
};

export type UpdateCustomerResult =
  | { ok: true; customer: Awaited<ReturnType<CustomerRepository['create']>> }
  | { ok: false; code: 'NOT_FOUND' | 'NAME_CONFLICT'; message: string };

export type DeleteCustomerResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'HAS_TRANSACTIONS'; message: string };

export async function ensureDefaultUser() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    take: 1,
  });

  if (users.length > 0) {
    return users[0];
  }

  return prisma.user.create({
    data: {
      name: 'Demo Shopkeeper',
      email: 'shopkeeper@hisabnaki.local',
      businessName: 'Raju General Store',
    },
  });
}

export function createCustomerService(repository: CustomerRepository) {
  async function ensureCustomer(userId: string, customerName: string, phone?: string) {
    const normalizedName = customerName.trim();

    if (!normalizedName) {
      throw new Error('Customer name is required.');
    }

    const existing = await repository.findByNameForDuplicateCheck(userId, normalizedName);

    if (existing) {
      return existing;
    }

    return repository.create({
      userId,
      name: normalizedName,
      phone: phone ?? null,
    });
  }

  async function updateCustomer(
    userId: string,
    customerId: string,
    updates: UpdateCustomerInput
  ): Promise<UpdateCustomerResult> {
    if (updates.name === undefined && updates.phone === undefined) {
      throw new Error('At least one field is required.');
    }

    let trimmedName: string | undefined;
    if (updates.name !== undefined) {
      trimmedName = updates.name.trim();
      if (!trimmedName) {
        throw new Error('Customer name is required.');
      }
    }

    const trimmedPhone = updates.phone !== undefined ? updates.phone.trim() : undefined;

    const current = await repository.findById(userId, customerId);
    if (!current) {
      return { ok: false, code: 'NOT_FOUND', message: 'Customer not found.' };
    }

    if (trimmedName !== undefined) {
      const duplicate = await repository.findByNameForDuplicateCheck(userId, trimmedName);
      if (duplicate && duplicate.id !== customerId) {
        return {
          ok: false,
          code: 'NAME_CONFLICT',
          message: 'Customer with this name already exists.',
        };
      }
    }

    const data: UpdateCustomerData = {};
    if (trimmedName !== undefined) {
      data.name = trimmedName;
    }
    if (trimmedPhone !== undefined) {
      data.phone = trimmedPhone || null;
    }

    const customer = await repository.update(userId, customerId, data);
    if (!customer) {
      return { ok: false, code: 'NOT_FOUND', message: 'Customer not found.' };
    }

    return { ok: true, customer };
  }

  async function deleteCustomer(
    userId: string,
    customerId: string
  ): Promise<DeleteCustomerResult> {
    const outcome = await repository.delete(userId, customerId);

    if (outcome.status === 'DELETED') {
      return { ok: true };
    }

    if (outcome.status === 'HAS_TRANSACTIONS') {
      return {
        ok: false,
        code: 'HAS_TRANSACTIONS',
        message: 'Cannot delete a customer with transaction history.',
      };
    }

    return { ok: false, code: 'NOT_FOUND', message: 'Customer not found.' };
  }

  async function getCustomersForUser(userId: string) {
    const customers = await repository.listForUser(userId);

    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      createdAt: customer.createdAt,
      outstandingBalance: calculateOutstandingAmount(customer.transactions),
      transactionCount: customer.transactions.length,
    }));
  }

  async function getCustomerById(userId: string, customerId: string) {
    const customer = await repository.findById(userId, customerId);

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      outstandingBalance: calculateOutstandingAmount(customer.transactions),
    };
  }

  async function getCustomerByName(userId: string, customerName: string) {
    const customer = await repository.findByName(userId, customerName);

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      outstandingBalance: calculateOutstandingAmount(customer.transactions),
    };
  }

  async function getCustomerTransactions(userId: string, customerId: string) {
    const customer = await repository.findById(userId, customerId);

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      outstandingBalance: calculateOutstandingAmount(customer.transactions),
    };
  }

  return {
    ensureCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomersForUser,
    getCustomerById,
    getCustomerByName,
    getCustomerTransactions,
  };
}

const defaultService = createCustomerService(new PrismaCustomerRepository());

export async function ensureCustomer(userId: string, customerName: string, phone?: string) {
  return defaultService.ensureCustomer(userId, customerName, phone);
}

export async function updateCustomer(
  userId: string,
  customerId: string,
  updates: UpdateCustomerInput
) {
  return defaultService.updateCustomer(userId, customerId, updates);
}

export async function deleteCustomer(userId: string, customerId: string) {
  return defaultService.deleteCustomer(userId, customerId);
}

export async function getCustomersForUser(userId: string) {
  return defaultService.getCustomersForUser(userId);
}

export async function getCustomerById(userId: string, customerId: string) {
  return defaultService.getCustomerById(userId, customerId);
}

export async function getCustomerByName(userId: string, customerName: string) {
  return defaultService.getCustomerByName(userId, customerName);
}

export async function getCustomerTransactions(userId: string, customerId: string) {
  return defaultService.getCustomerTransactions(userId, customerId);
}
