import type {
  Customer,
  Prisma,
  PrismaClient,
  Transaction,
  TransactionType,
} from '@prisma/client';
import prisma from '../lib/prisma.js';

export type TransactionWithCustomer = Transaction & { customer: Customer | null };

export type CreateTransactionRecordInput = {
  businessId: string;
  createdByUserId: string;
  customerId: string;
  type: TransactionType;
  amount: Prisma.Decimal | number;
  description: string;
};

export type CustomerTransactionGroup = {
  transactions: Transaction[];
};

export type TransactionHistoryQuery = {
  businessId: string;
  page: number;
  limit: number;
  type?: TransactionType;
  customerId?: string;
  from?: Date;
  to?: Date;
};

export type TransactionHistoryPage = {
  transactions: TransactionWithCustomer[];
  total: number;
};

export interface TransactionRepository {
  create(input: CreateTransactionRecordInput): Promise<TransactionWithCustomer>;
  findById(transactionId: string, businessId: string): Promise<TransactionWithCustomer | null>;
  listForBusiness(businessId: string): Promise<TransactionWithCustomer[]>;
  listForCustomer(customerId: string, businessId: string): Promise<Transaction[]>;
  listCustomerTransactionGroups(businessId: string): Promise<CustomerTransactionGroup[]>;
  findHistory(query: TransactionHistoryQuery): Promise<TransactionHistoryPage>;
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  create(input: CreateTransactionRecordInput): Promise<TransactionWithCustomer> {
    return this.client.transaction.create({
      data: {
        businessId: input.businessId,
        createdByUserId: input.createdByUserId,
        customerId: input.customerId,
        type: input.type,
        amount: input.amount,
        description: input.description,
      },
      include: {
        customer: true,
      },
    });
  }

  findById(transactionId: string, businessId: string): Promise<TransactionWithCustomer | null> {
    return this.client.transaction.findFirst({
      where: { id: transactionId, businessId },
      include: { customer: true },
    });
  }

  listForBusiness(businessId: string): Promise<TransactionWithCustomer[]> {
    return this.client.transaction.findMany({
      where: { businessId, status: 'ACTIVE' },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForCustomer(customerId: string, businessId: string): Promise<Transaction[]> {
    return this.client.transaction.findMany({
      where: { customerId, businessId, status: 'ACTIVE' },
    });
  }

  async listCustomerTransactionGroups(businessId: string): Promise<CustomerTransactionGroup[]> {
    return this.client.customer.findMany({
      where: { businessId },
      include: {
        transactions: { where: { status: 'ACTIVE' } },
      },
    });
  }

  async findHistory(query: TransactionHistoryQuery): Promise<TransactionHistoryPage> {
    const where: Prisma.TransactionWhereInput = {
      businessId: query.businessId,
      status: 'ACTIVE',
    };

    if (query.type) {
      where.type = query.type;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.from || query.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.from) createdAt.gte = query.from;
      if (query.to) createdAt.lte = query.to;
      where.createdAt = createdAt;
    }

    const [transactions, total] = await Promise.all([
      this.client.transaction.findMany({
        where,
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.client.transaction.count({ where }),
    ]);

    return { transactions, total };
  }
}
