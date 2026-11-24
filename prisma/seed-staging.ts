/**
 * Idempotent staging seed for HisabNaki.
 *
 * Seeds a synthetic test user with OWNER memberships in two businesses plus
 * a few customers and transactions each, so staging can be exercised
 * end-to-end. Every write is an upsert on a stable ID, so running this
 * script multiple times never duplicates users, memberships, customers or
 * transactions.
 *
 * Safety:
 * - Never run this against the development database; run it only against the
 *   staging Neon branch DATABASE_URL.
 * - Do not run `prisma:seed` (dev) against staging, or seed-staging against dev.
 * - Pass the staging password via the required SEED_PASSWORD variable; it is never committed.
 *
 * Usage (from repository root, with the staging environment active):
 *   SEED_PASSWORD=your-staging-password npx tsx prisma/seed-staging.ts
 *   or: npm run prisma:seed:staging
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../backend/src/services/auth/passwordService.js';

const prisma = new PrismaClient();

const STAGING_EMAIL = 'staging@hisabnaki.test';
const STAGING_NAME = 'HisabNaki Test User';
const STAGING_PASSWORD = process.env.SEED_PASSWORD;

const STAGING_BIZ_1 = { id: 'staging-biz-1', name: 'Raju General Store' };
const STAGING_BIZ_2 = { id: 'staging-biz-2', name: 'Sharma Kirana Store' };

const STAGING_CUSTOMERS: Record<string, Array<{ id: string; name: string; phone: string }>> = {
  [STAGING_BIZ_1.id]: [
    { id: 'staging-cust-1', name: 'Raju Sharma', phone: '9999999901' },
    { id: 'staging-cust-2', name: 'Amit Kumar', phone: '9999999902' },
  ],
  [STAGING_BIZ_2.id]: [
    { id: 'staging-cust-3', name: 'Priya Sharma', phone: '9999999903' },
    { id: 'staging-cust-4', name: 'Mahendra Jat', phone: '9999999904' },
  ],
};

const STAGING_TRANSACTIONS: Record<
  string,
  Array<{
    id: string;
    customerId: string;
    type: Prisma.TransactionCreateWithoutBusinessInput['type'];
    amount: number;
    description: string;
    paymentMethod?: 'CASH' | 'UPI';
    saleMode?: 'CASH';
    openingDirection?: 'INCREASE' | 'DECREASE';
  }>
> = {
  [STAGING_BIZ_1.id]: [
    {
      id: 'staging-tx-1',
      customerId: 'staging-cust-1',
      type: 'CREDIT',
      amount: 450.75,
      description: 'Udhaar - Raju Sharma',
    },
    {
      id: 'staging-tx-2',
      customerId: 'staging-cust-1',
      type: 'PAYMENT',
      amount: 100.50,
      description: 'Payment - Raju Sharma',
      paymentMethod: 'CASH',
    },
    {
      id: 'staging-tx-3',
      customerId: 'staging-cust-2',
      type: 'CREDIT',
      amount: 700,
      description: 'Udhaar - Amit Kumar',
    },
    {
      id: 'staging-tx-4',
      customerId: 'staging-cust-2',
      type: 'SALE',
      amount: 300,
      description: 'Cash sale - Amit Kumar',
      saleMode: 'CASH',
      paymentMethod: 'CASH',
    },
  ],
  [STAGING_BIZ_2.id]: [
    {
      id: 'staging-tx-5',
      customerId: 'staging-cust-3',
      type: 'CREDIT',
      amount: 1200,
      description: 'Udhaar - Priya Sharma',
    },
    {
      id: 'staging-tx-6',
      customerId: 'staging-cust-3',
      type: 'PAYMENT',
      amount: 400,
      description: 'Payment - Priya Sharma',
      paymentMethod: 'UPI',
    },
    {
      id: 'staging-tx-7',
      customerId: 'staging-cust-4',
      type: 'CREDIT',
      amount: 850,
      description: 'Udhaar - Mahendra Jat',
    },
  ],
};

async function ensureTransaction(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    businessId: string;
    customerId: string;
    createdByUserId: string;
    type: Prisma.TransactionCreateWithoutBusinessInput['type'];
    amount: number;
    description: string;
    paymentMethod?: 'CASH' | 'UPI';
    saleMode?: 'CASH';
    openingDirection?: 'INCREASE' | 'DECREASE';
  }
) {
  const existingById = await tx.transaction.findUnique({
    where: { id: input.id },
    select: { id: true },
  });
  if (existingById) {
    return;
  }

  const idempotencyKey = `staging:${input.businessId}:${input.id}`;
  const existingByKey = await tx.transaction.findFirst({
    where: { businessId: input.businessId, idempotencyKey },
    select: { id: true },
  });
  if (existingByKey) {
    return;
  }

  await tx.transaction.create({
    data: {
      id: input.id,
      businessId: input.businessId,
      customerId: input.customerId,
      createdByUserId: input.createdByUserId,
      type: input.type,
      status: 'ACTIVE',
      amount: input.amount,
      description: input.description,
      paymentMethod: input.paymentMethod,
      saleMode: input.saleMode,
      openingDirection: input.openingDirection,
      idempotencyKey,
    },
  });
}

async function main() {
  const seedPassword = STAGING_PASSWORD?.trim() ?? '';
  if (seedPassword === '') {
    console.error('SEED_PASSWORD is required to run the staging seed (staging-only; never commit).');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') {
    console.error('DATABASE_URL is required to run the staging seed.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(seedPassword);

  await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.upsert({
        where: { email: STAGING_EMAIL },
        update: { name: STAGING_NAME, passwordHash },
        create: {
          name: STAGING_NAME,
          email: STAGING_EMAIL,
          phone: null,
          passwordHash,
        },
      });

      for (const business of [STAGING_BIZ_1, STAGING_BIZ_2]) {
        await tx.business.upsert({
          where: { id: business.id },
          update: { name: business.name, deletedAt: null },
          create: { id: business.id, name: business.name },
        });

        await tx.membership.upsert({
          where: {
            businessId_userId: { businessId: business.id, userId: user.id },
          },
          update: { role: 'OWNER', status: 'ACTIVE' },
          create: {
            id: `staging-membership-${business.id}`,
            businessId: business.id,
            userId: user.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });

        for (const customer of STAGING_CUSTOMERS[business.id]) {
          await tx.customer.upsert({
            where: { id: customer.id },
            update: {
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
        }

        for (const transaction of STAGING_TRANSACTIONS[business.id]) {
          await ensureTransaction(tx, {
            id: transaction.id,
            businessId: business.id,
            customerId: transaction.customerId,
            createdByUserId: user.id,
            type: transaction.type,
            amount: transaction.amount,
            description: transaction.description,
            paymentMethod: transaction.paymentMethod,
            saleMode: transaction.saleMode,
            openingDirection: transaction.openingDirection,
          });
        }
      }
    },
    { timeout: 60000 }
  );

  console.log('Staging seed completed.');
  console.log(`Staging user: ${STAGING_EMAIL}`);
  console.log(`Businesses: ${STAGING_BIZ_1.name}, ${STAGING_BIZ_2.name}`);
  console.log('Run against the staging Neon branch DATABASE_URL.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
