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
  userId: string;
  customerId: string;
  type: TransactionType;
  amount: number;
  description: string;
};

export type CustomerTransactionGroup = {
  transactions: Transaction[];
};

export type TransactionHistoryQuery = {
  userId: string;
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
  findById(transactionId: string, userId: string): Promise<TransactionWithCustomer | null>;
  listForUser(userId: string): Promise<TransactionWithCustomer[]>;
  listForCustomer(customerId: string, userId: string): Promise<Transaction[]>;
  listCustomerTransactionGroups(userId: string): Promise<CustomerTransactionGroup[]>;
  findHistory(query: TransactionHistoryQuery): Promise<TransactionHistoryPage>;
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  create(input: CreateTransactionRecordInput): Promise<TransactionWithCustomer> {
    return this.client.transaction.create({
      data: {
        userId: input.userId,
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

  findById(transactionId: string, userId: string): Promise<TransactionWithCustomer | null> {
    return this.client.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { customer: true },
    });
  }

  listForUser(userId: string): Promise<TransactionWithCustomer[]> {
    return this.client.transaction.findMany({
      where: { userId },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForCustomer(customerId: string, userId: string): Promise<Transaction[]> {
    return this.client.transaction.findMany({
      where: { customerId, userId },
    });
  }

  async listCustomerTransactionGroups(userId: string): Promise<CustomerTransactionGroup[]> {
    return this.client.customer.findMany({
      where: { userId },
      include: { transactions: true },
    });
  }

  async findHistory(query: TransactionHistoryQuery): Promise<TransactionHistoryPage> {
    const where: Prisma.TransactionWhereInput = { userId: query.userId };

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
