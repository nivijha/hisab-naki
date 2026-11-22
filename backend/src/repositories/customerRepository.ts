import type { Customer, PrismaClient, Transaction } from '@prisma/client';
import prisma from '../lib/prisma.js';

export type CustomerWithTransactions = Customer & { transactions: Transaction[] };

export type CreateCustomerInput = {
  userId: string;
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
    userId: string,
    customerId: string,
    data: UpdateCustomerData
  ): Promise<Customer | null>;
  delete(userId: string, customerId: string): Promise<DeleteCustomerOutcome>;
  findById(userId: string, customerId: string): Promise<CustomerWithTransactions | null>;
  findByName(userId: string, customerName: string): Promise<CustomerWithTransactions | null>;
  findByNameForDuplicateCheck(userId: string, customerName: string): Promise<Customer | null>;
  listForUser(userId: string): Promise<CustomerWithTransactions[]>;
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  create(input: CreateCustomerInput): Promise<Customer> {
    return this.client.customer.create({
      data: {
        userId: input.userId,
        name: input.name,
        phone: input.phone ?? null,
      },
    });
  }

  async update(
    userId: string,
    customerId: string,
    data: UpdateCustomerData
  ): Promise<Customer | null> {
    const result = await this.client.customer.updateMany({
      where: { id: customerId, userId },
      data,
    });

    if (result.count === 0) {
      return null;
    }

    return this.client.customer.findFirst({
      where: { id: customerId, userId },
    });
  }

  async delete(userId: string, customerId: string): Promise<DeleteCustomerOutcome> {
    const customer = await this.client.customer.findFirst({
      where: { id: customerId, userId },
      select: { id: true },
    });

    if (!customer) {
      return { status: 'NOT_FOUND' };
    }

    const transactionCount = await this.client.transaction.count({
      where: { customerId },
    });

    if (transactionCount > 0) {
      return { status: 'HAS_TRANSACTIONS' };
    }

    const result = await this.client.customer.deleteMany({
      where: { id: customerId, userId },
    });

    if (result.count === 0) {
      return { status: 'NOT_FOUND' };
    }

    return { status: 'DELETED' };
  }

  findById(userId: string, customerId: string): Promise<CustomerWithTransactions | null> {
    return this.client.customer.findFirst({
      where: { id: customerId, userId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  findByName(userId: string, customerName: string): Promise<CustomerWithTransactions | null> {
    return this.client.customer.findFirst({
      where: {
        userId,
        name: { equals: customerName, mode: 'insensitive' },
      },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  findByNameForDuplicateCheck(userId: string, customerName: string): Promise<Customer | null> {
    return this.client.customer.findFirst({
      where: {
        userId,
        name: { equals: customerName, mode: 'insensitive' },
      },
    });
  }

  listForUser(userId: string): Promise<CustomerWithTransactions[]> {
    return this.client.customer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { transactions: true },
    });
  }
}
