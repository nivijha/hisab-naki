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

export type CreateCustomerIfNotExistsResult =
  | { status: 'CREATED'; customer: Customer }
  | { status: 'EXACT_MATCH'; customer: Customer };

export interface CustomerRepository {
  create(input: CreateCustomerInput): Promise<Customer>;
  createIfNotExistsByName(input: CreateCustomerInput): Promise<CreateCustomerIfNotExistsResult>;
  update(
    businessId: string,
    customerId: string,
    data: UpdateCustomerData
  ): Promise<Customer | null>;
  delete(businessId: string, customerId: string): Promise<DeleteCustomerOutcome>;
  findById(businessId: string, customerId: string): Promise<CustomerWithTransactions | null>;
  findByName(businessId: string, customerName: string): Promise<CustomerWithTransactions | null>;
  findByNameForDuplicateCheck(businessId: string, customerName: string): Promise<Customer | null>;
  findCandidatesByName(businessId: string, customerName: string): Promise<Customer[]>;
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

  async createIfNotExistsByName(input: CreateCustomerInput): Promise<CreateCustomerIfNotExistsResult> {
    const normalizedName = input.name.trim();
    const id = input['id' as never] as string | undefined;
    void id;

    return this.client.$transaction(async (tx) => {
      // Serialize same-name customer creation in active business scope.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${input.businessId}:${normalizedName.toLowerCase()}`}))`;

      const existing = await tx.customer.findFirst({
        where: {
          businessId: input.businessId,
          deletedAt: null,
          name: { equals: normalizedName, mode: 'insensitive' },
        },
      });
      if (existing) {
        return { status: 'EXACT_MATCH', customer: existing };
      }

      const customer = await tx.customer.create({
        data: {
          businessId: input.businessId,
          createdByUserId: input.createdByUserId,
          name: normalizedName,
          phone: input.phone ?? null,
        },
      });
      return { status: 'CREATED', customer };
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

  findCandidatesByName(businessId: string, customerName: string): Promise<Customer[]> {
    const normalized = customerName.trim();
    return this.client.customer.findMany({
      where: {
        businessId,
        deletedAt: null,
        name: { contains: normalized, mode: 'insensitive' },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
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
