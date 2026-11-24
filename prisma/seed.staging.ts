import { existsSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../backend/src/services/auth/passwordService.js';

loadEnv({ path: '.env.staging' });

const STAGING_URL = process.env.STAGING_DATABASE_URL;

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

function assertStagingOnly(): string {
  if (!STAGING_URL) {
    throw new Error(
      'STAGING_DATABASE_URL is required. Refusing to seed without an explicit staging connection string.'
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(STAGING_URL)) {
    throw new Error('STAGING_DATABASE_URL must be a PostgreSQL connection string.');
  }
  if (/(localhost|127\.0\.0\.1|::1)/i.test(STAGING_URL)) {
    throw new Error('STAGING_DATABASE_URL points at a local database. Refusing to seed.');
  }
  const devUrl = process.env.DATABASE_URL;
  if (devUrl && (devUrl === STAGING_URL || hostOf(devUrl) === hostOf(STAGING_URL))) {
    throw new Error(
      'STAGING_DATABASE_URL matches the development DATABASE_URL. Refusing to seed the development database.'
    );
  }
  return STAGING_URL;
}

const prisma = new PrismaClient({
  datasources: { db: { url: assertStagingOnly() } },
});

const SEED_USER_EMAIL = 'staging.shopkeeper@hisabnaki.test';
const SEED_USER_NAME = 'Staging Test Shopkeeper';
const SEED_PASSWORD = process.env.STAGING_SEED_PASSWORD ?? 'staging-demo-password';

const businesses = [
  {
    id: 'stg-business-raju-general-store',
    name: 'Raju General Store',
    membershipId: 'stg-membership-raju-owner',
  },
  {
    id: 'stg-business-sharma-kirana-store',
    name: 'Sharma Kirana Store',
    membershipId: 'stg-membership-sharma-owner',
  },
] as const;

type StagingTransactionType =
  | 'CREDIT'
  | 'PAYMENT'
  | 'SALE'
  | 'EXPENSE'
  | 'OPENING_BALANCE';

type SeedTransaction = {
  id: string;
  type: StagingTransactionType;
  amount: number;
  customerId?: string;
  saleMode?: 'CASH' | 'CREDIT';
  paymentMethod?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';
  openingDirection?: 'INCREASE' | 'DECREASE';
  description: string;
};

const customersByBusiness: Record<string, Array<{ id: string; name: string; phone: string; transactions: SeedTransaction[] }>> = {
  'stg-business-raju-general-store': [
    {
      id: 'stg-customer-raju-txn-1',
      name: 'Staging Customer Raju A',
      phone: '9000000001',
      transactions: [
        { id: 'stg-tx-raju-a-credit', type: 'CREDIT', amount: 1250.5, customerId: 'stg-customer-raju-txn-1', description: 'Synthetic udhaar' },
        { id: 'stg-tx-raju-a-payment', type: 'PAYMENT', amount: 300.25, customerId: 'stg-customer-raju-txn-1', paymentMethod: 'CASH', description: 'Synthetic payment' },
        { id: 'stg-tx-raju-a-opening', type: 'OPENING_BALANCE', amount: 100, customerId: 'stg-customer-raju-txn-1', openingDirection: 'INCREASE', description: 'Synthetic opening balance' },
      ],
    },
    {
      id: 'stg-customer-raju-txn-2',
      name: 'Staging Customer Raju B',
      phone: '9000000002',
      transactions: [
        { id: 'stg-tx-raju-b-credit', type: 'CREDIT', amount: 500, customerId: 'stg-customer-raju-txn-2', description: 'Synthetic udhaar' },
        { id: 'stg-tx-raju-b-payment', type: 'PAYMENT', amount: 500, customerId: 'stg-customer-raju-txn-2', paymentMethod: 'UPI', description: 'Synthetic payment' },
      ],
    },
    { id: 'stg-business-raju-cash-sale', name: 'Staging Walk-in Sale', phone: '9000000099', transactions: [] } as never,
  ],
  'stg-business-sharma-kirana-store': [
    {
      id: 'stg-customer-sharma-txn-1',
      name: 'Staging Customer Sharma A',
      phone: '9000000011',
      transactions: [
        { id: 'stg-tx-sharma-a-credit', type: 'CREDIT', amount: 999.99, customerId: 'stg-customer-sharma-txn-1', description: 'Synthetic udhaar' },
        { id: 'stg-tx-sharma-a-payment', type: 'PAYMENT', amount: 199.99, customerId: 'stg-customer-sharma-txn-1', paymentMethod: 'BANK_TRANSFER', description: 'Synthetic payment' },
      ],
    },
    {
      id: 'stg-customer-sharma-txn-2',
      name: 'Staging Customer Sharma B',
      phone: '9000000012',
      transactions: [
        { id: 'stg-tx-sharma-b-sale-credit', type: 'SALE', amount: 450, customerId: 'stg-customer-sharma-txn-2', saleMode: 'CREDIT', description: 'Synthetic credit sale' },
        { id: 'stg-tx-sharma-b-payment', type: 'PAYMENT', amount: 150, customerId: 'stg-customer-sharma-txn-2', paymentMethod: 'CASH', description: 'Synthetic payment' },
      ],
    },
  ],
};

const businessLevelTransactions: Record<string, SeedTransaction[]> = {
  'stg-business-raju-general-store': [
    { id: 'stg-tx-raju-cash-sale', type: 'SALE', amount: 250, saleMode: 'CASH', paymentMethod: 'CASH', description: 'Synthetic cash sale' },
    { id: 'stg-tx-raju-expense', type: 'EXPENSE', amount: 75, paymentMethod: 'CASH', description: 'Synthetic expense' },
  ],
  'stg-business-sharma-kirana-store': [
    { id: 'stg-tx-sharma-cash-sale', type: 'SALE', amount: 100, saleMode: 'CASH', paymentMethod: 'UPI', description: 'Synthetic cash sale' },
    { id: 'stg-tx-sharma-expense', type: 'EXPENSE', amount: 40, paymentMethod: 'CASH', description: 'Synthetic expense' },
  ],
};

async function ensureTransaction(
  tx: Prisma.TransactionClient,
  businessId: string,
  createdByUserId: string,
  input: SeedTransaction
): Promise<void> {
  const existing = await tx.transaction.findUnique({
    where: { id: input.id },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  try {
    await tx.transaction.create({
      data: {
        id: input.id,
        businessId,
        customerId: input.customerId ?? null,
        createdByUserId,
        type: input.type,
        status: 'ACTIVE',
        amount: input.amount,
        saleMode: input.saleMode ?? null,
        paymentMethod: input.paymentMethod ?? null,
        openingDirection: input.openingDirection ?? null,
        description: input.description,
        idempotencyKey: `stg-seed:${input.id}`,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return;
    }
    throw error;
  }
}

async function ensureAuditLog(
  tx: Prisma.TransactionClient,
  businessId: string,
  actorUserId: string,
  businessName: string
): Promise<void> {
  const existing = await tx.auditLog.findFirst({
    where: { businessId, entityType: 'Business', entityId: businessId, action: 'CREATE' },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  await tx.auditLog.create({
    data: {
      businessId,
      actorType: 'USER',
      actorUserId,
      action: 'CREATE',
      entityType: 'Business',
      entityId: businessId,
      after: { id: businessId, name: businessName },
      metadata: { seeded: true, source: 'seed.staging' },
    },
  });
}

async function main(): Promise<void> {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.upsert({
        where: { email: SEED_USER_EMAIL },
        update: { name: SEED_USER_NAME, passwordHash },
        create: {
          name: SEED_USER_NAME,
          email: SEED_USER_EMAIL,
          passwordHash,
        },
      });

      for (const business of businesses) {
        await tx.business.upsert({
          where: { id: business.id },
          update: { name: business.name, deletedAt: null },
          create: { id: business.id, name: business.name },
        });

        await tx.membership.upsert({
          where: { businessId_userId: { businessId: business.id, userId: user.id } },
          update: { role: 'OWNER', status: 'ACTIVE' },
          create: {
            id: business.membershipId,
            businessId: business.id,
            userId: user.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });

        for (const customer of customersByBusiness[business.id] ?? []) {
          if (!customer.name) {
            continue;
          }
          await tx.customer.upsert({
            where: { id: customer.id },
            update: {
              businessId: business.id,
              name: customer.name,
              phone: customer.phone,
              deletedAt: null,
            },
            create: {
              id: customer.id,
              businessId: business.id,
              name: customer.name,
              phone: customer.phone,
              createdByUserId: user.id,
            },
          });

          for (const transaction of customer.transactions) {
            await ensureTransaction(tx, business.id, user.id, transaction);
          }
        }

        for (const transaction of businessLevelTransactions[business.id] ?? []) {
          await ensureTransaction(tx, business.id, user.id, transaction);
        }

        await ensureAuditLog(tx, business.id, user.id, business.name);
      }

      return user;
    },
    { timeout: 60000 }
  );

  console.log('Staging seed completed for user:', SEED_USER_EMAIL);
  console.log('Password source: STAGING_SEED_PASSWORD (default applies when unset).');
  console.log('Businesses: Raju General Store, Sharma Kirana Store (both OWNER/ACTIVE).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
