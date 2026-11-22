import {
  PrismaCustomerRepository,
  type CustomerRepository,
  type UpdateCustomerData,
} from '../../repositories/customerRepository.js';
import { calculateOutstandingAmount, toDisplayNumber } from '../../utils/ledger.js';

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

export function createCustomerService(repository: CustomerRepository) {
  async function ensureCustomer(
    businessId: string,
    createdByUserId: string,
    customerName: string,
    phone?: string
  ) {
    const normalizedName = customerName.trim();

    if (!normalizedName) {
      throw new Error('Customer name is required.');
    }

    const existing = await repository.findByNameForDuplicateCheck(businessId, normalizedName);

    if (existing) {
      return existing;
    }

    return repository.create({
      businessId,
      createdByUserId,
      name: normalizedName,
      phone: phone ?? null,
    });
  }

  async function updateCustomer(
    businessId: string,
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

    const current = await repository.findById(businessId, customerId);
    if (!current) {
      return { ok: false, code: 'NOT_FOUND', message: 'Customer not found.' };
    }

    if (trimmedName !== undefined) {
      const duplicate = await repository.findByNameForDuplicateCheck(businessId, trimmedName);
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

    const customer = await repository.update(businessId, customerId, data);
    if (!customer) {
      return { ok: false, code: 'NOT_FOUND', message: 'Customer not found.' };
    }

    return { ok: true, customer };
  }

  async function deleteCustomer(
    businessId: string,
    customerId: string
  ): Promise<DeleteCustomerResult> {
    const outcome = await repository.delete(businessId, customerId);

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

  async function getCustomersForBusiness(businessId: string) {
    const customers = await repository.listForBusiness(businessId);

    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      createdAt: customer.createdAt,
      outstandingBalance: toDisplayNumber(calculateOutstandingAmount(customer.transactions)),
      transactionCount: customer.transactions.length,
    }));
  }

  async function getCustomerById(businessId: string, customerId: string) {
    const customer = await repository.findById(businessId, customerId);

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      outstandingBalance: toDisplayNumber(calculateOutstandingAmount(customer.transactions)),
    };
  }

  async function getCustomerByName(businessId: string, customerName: string) {
    const customer = await repository.findByName(businessId, customerName);

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      outstandingBalance: toDisplayNumber(calculateOutstandingAmount(customer.transactions)),
    };
  }

  async function getCustomerTransactions(businessId: string, customerId: string) {
    const customer = await repository.findById(businessId, customerId);

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      outstandingBalance: toDisplayNumber(calculateOutstandingAmount(customer.transactions)),
    };
  }

  return {
    ensureCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomersForBusiness,
    getCustomerById,
    getCustomerByName,
    getCustomerTransactions,
  };
}

const defaultService = createCustomerService(new PrismaCustomerRepository());

export async function ensureCustomer(
  businessId: string,
  createdByUserId: string,
  customerName: string,
  phone?: string
) {
  return defaultService.ensureCustomer(businessId, createdByUserId, customerName, phone);
}

export async function updateCustomer(
  businessId: string,
  customerId: string,
  updates: UpdateCustomerInput
) {
  return defaultService.updateCustomer(businessId, customerId, updates);
}

export async function deleteCustomer(businessId: string, customerId: string) {
  return defaultService.deleteCustomer(businessId, customerId);
}

export async function getCustomersForBusiness(businessId: string) {
  return defaultService.getCustomersForBusiness(businessId);
}

export async function getCustomerById(businessId: string, customerId: string) {
  return defaultService.getCustomerById(businessId, customerId);
}

export async function getCustomerByName(businessId: string, customerName: string) {
  return defaultService.getCustomerByName(businessId, customerName);
}

export async function getCustomerTransactions(businessId: string, customerId: string) {
  return defaultService.getCustomerTransactions(businessId, customerId);
}
