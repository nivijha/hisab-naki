import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from '../backend/src/services/auth/passwordService.js';

const prisma = new PrismaClient();

const SEED_USER_EMAIL = 'shopkeeper@hisabnaki.local';
const SEED_USER_NAME = 'Demo Shopkeeper';
const SEED_BUSINESS_ID = 'hisabnaki-demo-business';
const SEED_BUSINESS_NAME = 'Raju General Store';
const SEED_OWNER_MEMBERSHIP_ID = 'hisabnaki-demo-membership-owner';

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'demo-password';

const demoCustomers = [
  { id: 'hisabnaki-demo-cust-raju-sharma', name: 'Raju Sharma', phone: '9876543210', credit: 450, payment: 200 },
  { id: 'hisabnaki-demo-cust-amit-kumar', name: 'Amit Kumar', phone: '9876543211', credit: 700, payment: 300 },
  { id: 'hisabnaki-demo-cust-neha-verma', name: 'Neha Verma', phone: '9876543212', credit: 850, payment: 250 },
  { id: 'hisabnaki-demo-cust-suresh-gupta', name: 'Suresh Gupta', phone: '9876543213', credit: 600, payment: 150 },
];

async function ensureTransaction(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    businessId: string;
    customerId: string;
    createdByUserId: string;
    type: 'CREDIT' | 'PAYMENT';
    amount: number;
    description: string;
    paymentMethod?: 'CASH';
  }
) {
  const existingById = await tx.transaction.findUnique({
    where: { id: input.id },
    select: { id: true },
  });
  if (existingById) {
    return;
  }

  const idempotencyKey = `seed:${input.businessId}:${input.id}`;
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
      idempotencyKey,
    },
  });
}

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

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

      await tx.business.upsert({
        where: { id: SEED_BUSINESS_ID },
        update: { name: SEED_BUSINESS_NAME, deletedAt: null },
        create: { id: SEED_BUSINESS_ID, name: SEED_BUSINESS_NAME },
      });

      await tx.membership.upsert({
        where: {
          businessId_userId: {
            businessId: SEED_BUSINESS_ID,
            userId: user.id,
          },
        },
        update: { role: 'OWNER', status: 'ACTIVE' },
        create: {
          id: SEED_OWNER_MEMBERSHIP_ID,
          businessId: SEED_BUSINESS_ID,
          userId: user.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      for (const customer of demoCustomers) {
        await tx.customer.upsert({
          where: { id: customer.id },
          update: {
            name: customer.name,
            phone: customer.phone,
            deletedAt: null,
          },
          create: {
            id: customer.id,
            businessId: SEED_BUSINESS_ID,
            name: customer.name,
            phone: customer.phone,
            createdByUserId: user.id,
          },
        });

        await ensureTransaction(tx, {
          id: `${customer.id}-credit`,
          businessId: SEED_BUSINESS_ID,
          customerId: customer.id,
          createdByUserId: user.id,
          type: 'CREDIT',
          amount: customer.credit,
          description: 'Udhaar',
        });

        await ensureTransaction(tx, {
          id: `${customer.id}-payment`,
          businessId: SEED_BUSINESS_ID,
          customerId: customer.id,
          createdByUserId: user.id,
          type: 'PAYMENT',
          amount: customer.payment,
          description: 'Payment received',
          paymentMethod: 'CASH',
        });
      }
    },
    { timeout: 60000 }
  );

  console.log('Demo multi-business data seeded successfully.');
  console.log('Demo login password is controlled by SEED_PASSWORD (development only).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
