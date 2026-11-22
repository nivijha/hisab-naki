import type { Customer, PrismaClient, Transaction } from '@prisma/client';
import prisma from '../lib/prisma.js';

export type CustomerWithTransactions = Customer & { transactions: Transaction[] };

export type CreateCustomerInput = {
  businessId: string;
  createdByUserId: string;
  name: string;
  phone?: string | null;
};

export type UpdateCustomerData = {
  name?: string;
  phone?: string | null;
};

export type DeleteCustomerOutcome =
  | { status: 'DELETED' }
  | { status: 'NOT_FOUND' }
  | { status: 'HAS_TRANSACTIONS' };

export interface CustomerRepository {
  create(input: CreateCustomerInput): Promise<Customer>;
  update(
    businessId: string,
    customerId: string,
    data: UpdateCustomerData
  ): Promise<Customer | null>;
  delete(businessId: string, customerId: string): Promise<DeleteCustomerOutcome>;
  findById(businessId: string, customerId: string): Promise<CustomerWithTransactions | null>;
  findByName(businessId: string, customerName: string): Promise<CustomerWithTransactions | null>;
  findByNameForDuplicateCheck(businessId: string, customerName: string): Promise<Customer | null>;
  listForBusiness(businessId: string): Promise<CustomerWithTransactions[]>;
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  create(input: CreateCustomerInput): Promise<Customer> {
    return this.client.customer.create({
      data: {
        businessId: input.businessId,
        createdByUserId: input.createdByUserId,
        name: input.name,
        phone: input.phone ?? null,
      },
    });
  }

  async update(
    businessId: string,
    customerId: string,
    data: UpdateCustomerData
  ): Promise<Customer | null> {
    const result = await this.client.customer.updateMany({
      where: { id: customerId, businessId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.client.customer.findFirst({
      where: { id: customerId, businessId },
    });
  }

  async delete(businessId: string, customerId: string): Promise<DeleteCustomerOutcome> {
    const customer = await this.client.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true },
    });

    if (!customer) {
      return { status: 'NOT_FOUND' };
    }

    const transactionCount = await this.client.transaction.count({
      where: { customerId, businessId },
    });

    if (transactionCount > 0) {
      return { status: 'HAS_TRANSACTIONS' };
    }

    const result = await this.client.customer.deleteMany({
      where: { id: customerId, businessId },
    });

    if (result.count === 0) {
      return { status: 'NOT_FOUND' };
    }

    return { status: 'DELETED' };
  }

  findById(businessId: string, customerId: string): Promise<CustomerWithTransactions | null> {
    return this.client.customer.findFirst({
      where: { id: customerId, businessId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  findByName(businessId: string, customerName: string): Promise<CustomerWithTransactions | null> {
    return this.client.customer.findFirst({
      where: {
        businessId,
        name: { equals: customerName, mode: 'insensitive' },
      },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  findByNameForDuplicateCheck(businessId: string, customerName: string): Promise<Customer | null> {
    return this.client.customer.findFirst({
      where: {
        businessId,
        name: { equals: customerName, mode: 'insensitive' },
      },
    });
  }

  listForBusiness(businessId: string): Promise<CustomerWithTransactions[]> {
    return this.client.customer.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: { transactions: true },
    });
  }
}
