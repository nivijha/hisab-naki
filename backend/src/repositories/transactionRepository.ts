import { Prisma } from '@prisma/client';
import type {
  Customer,
  OpeningBalanceDirection,
  PaymentMethod,
  PrismaClient,
  SaleMode,
  Transaction,
  TransactionType,
} from '@prisma/client';
import prisma from '../lib/prisma.js';

export type TransactionWithCustomer = Transaction & { customer: Customer | null };

export type CreateTransactionRecordInput = {
  businessId: string;
  createdByUserId: string;
  customerId?: string | null;
  type: TransactionType;
  amount: Prisma.Decimal | number;
  description: string;
  saleMode?: SaleMode | null;
  paymentMethod?: PaymentMethod | null;
  openingDirection?: OpeningBalanceDirection | null;
  originalTransactionId?: string | null;
  idempotencyKey?: string;
};

export type IdempotentCreateResult = {
  transaction: TransactionWithCustomer;
  created: boolean;
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
  createIdempotent(input: CreateTransactionRecordInput): Promise<IdempotentCreateResult>;
  findById(transactionId: string, businessId: string): Promise<TransactionWithCustomer | null>;
  findByIdempotencyKey(
    businessId: string,
    idempotencyKey: string
  ): Promise<TransactionWithCustomer | null>;
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
        customerId: input.customerId ?? null,
        type: input.type,
        amount: input.amount,
        description: input.description,
        saleMode: input.saleMode ?? null,
        paymentMethod: input.paymentMethod ?? null,
        openingDirection: input.openingDirection ?? null,
        originalTransactionId: input.originalTransactionId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
      include: {
        customer: true,
      },
    });
  }

  async createIdempotent(input: CreateTransactionRecordInput): Promise<IdempotentCreateResult> {
    const key = input.idempotencyKey;
    if (!key) {
      return { transaction: await this.create(input), created: true };
    }

    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(`${input.businessId}:${key}`).digest();
    const lockKey = digest.readBigInt64BE(0);

    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      const existing = await tx.transaction.findFirst({
        where: { businessId: input.businessId, idempotencyKey: key },
        include: { customer: true },
      });
      if (existing) {
        return { transaction: existing, created: false };
      }

      try {
        const created = await tx.transaction.create({
          data: {
            businessId: input.businessId,
            createdByUserId: input.createdByUserId,
            customerId: input.customerId ?? null,
            type: input.type,
            amount: input.amount,
            description: input.description,
            saleMode: input.saleMode ?? null,
            paymentMethod: input.paymentMethod ?? null,
            openingDirection: input.openingDirection ?? null,
            originalTransactionId: input.originalTransactionId ?? null,
            idempotencyKey: key,
          },
          include: { customer: true },
        });
        return { transaction: created, created: true };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const raced = await tx.transaction.findFirst({
            where: { businessId: input.businessId, idempotencyKey: key },
            include: { customer: true },
          });
          if (raced) {
            return { transaction: raced, created: false };
          }
        }
        throw error;
      }
    });
  }

  findById(transactionId: string, businessId: string): Promise<TransactionWithCustomer | null> {
    return this.client.transaction.findFirst({
      where: { id: transactionId, businessId },
      include: { customer: true },
    });
  }

  findByIdempotencyKey(
    businessId: string,
    idempotencyKey: string
  ): Promise<TransactionWithCustomer | null> {
    return this.client.transaction.findFirst({
      where: { businessId, idempotencyKey },
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
      where: { businessId, deletedAt: null },
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
