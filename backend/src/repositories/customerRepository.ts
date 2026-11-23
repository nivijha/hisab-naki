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
  | { status: 'NOT_FOUND' };

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
      where: { id: customerId, businessId, deletedAt: null },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.client.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
    });
  }

  async delete(businessId: string, customerId: string): Promise<DeleteCustomerOutcome> {
    const result = await this.client.customer.updateMany({
      where: { id: customerId, businessId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      return { status: 'NOT_FOUND' };
    }

    return { status: 'DELETED' };
  }

  findById(businessId: string, customerId: string): Promise<CustomerWithTransactions | null> {
    return this.client.customer.findFirst({
      where: { id: customerId, businessId, deletedAt: null },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  findByName(businessId: string, customerName: string): Promise<CustomerWithTransactions | null> {
    return this.client.customer.findFirst({
      where: {
        businessId,
        deletedAt: null,
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
        deletedAt: null,
        name: { equals: customerName, mode: 'insensitive' },
      },
    });
  }

  listForBusiness(businessId: string): Promise<CustomerWithTransactions[]> {
    return this.client.customer.findMany({
      where: { businessId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { transactions: true },
    });
  }
}
