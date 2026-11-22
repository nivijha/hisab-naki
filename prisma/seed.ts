import { PrismaClient, type Role } from '@prisma/client';
import { hashPassword } from '../backend/src/services/auth/passwordService.js';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'demo-password';

const businesses = [
  {
    id: 'seed-business-1',
    name: 'Raju General Store',
    owner: {
      id: 'seed-user-1',
      name: 'Demo Shopkeeper',
      email: 'shopkeeper@hisabnaki.local',
      phone: '9000000001',
    },
    customers: [
      { id: 'seed-customer-1', name: 'Raju Sharma', phone: '9876543210', credit: 450, payment: 200 },
      { id: 'seed-customer-2', name: 'Amit Kumar', phone: '9876543211', credit: 700, payment: 300 },
      { id: 'seed-customer-3', name: 'Neha Verma', phone: '9876543212', credit: 850, payment: 250 },
      { id: 'seed-customer-4', name: 'Suresh Gupta', phone: '9876543213', credit: 600, payment: 150 },
    ],
  },
  {
    id: 'seed-business-2',
    name: 'Neha Traders',
    owner: {
      id: 'seed-user-2',
      name: 'Neha Traders Owner',
      email: 'owner@nehratraders.local',
      phone: '9000000002',
    },
    customers: [
      { id: 'seed-customer-5', name: 'Raju Sharma', phone: '9876543220', credit: 300, payment: 50 },
    ],
  },
];

async function ensureUser(user: { id: string; name: string; email: string; phone: string }, passwordHash: string) {
  return prisma.user.upsert({
    where: { id: user.id },
    update: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      passwordHash,
    },
    create: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      passwordHash,
    },
  });
}

async function ensureBusiness(businessId: string, name: string) {
  return prisma.business.upsert({
    where: { id: businessId },
    update: { name, deletedAt: null },
    create: { id: businessId, name },
  });
}

async function ensureMembership(userId: string, businessId: string, role: Role) {
  const existing = await prisma.membership.findFirst({
    where: { userId, businessId },
  });
  if (existing) {
    return prisma.membership.update({
      where: { id: existing.id },
      data: { role, status: 'ACTIVE' },
    });
  }
  return prisma.membership.create({
    data: { userId, businessId, role, status: 'ACTIVE' },
  });
}

async function ensureCustomer(
  customer: { id: string; name: string; phone: string },
  businessId: string,
  createdByUserId: string
) {
  return prisma.customer.upsert({
    where: { id: customer.id },
    update: {
      businessId,
      name: customer.name,
      phone: customer.phone,
      deletedAt: null,
    },
    create: {
      id: customer.id,
      businessId,
      name: customer.name,
      phone: customer.phone,
      createdByUserId,
    },
  });
}

async function ensureTransaction(
  businessId: string,
  customerId: string,
  createdByUserId: string,
  type: 'CREDIT' | 'PAYMENT',
  amount: number,
  description: string,
  key: string
) {
  const existing = await prisma.transaction.findFirst({
    where: { businessId, idempotencyKey: key },
  });
  if (existing) {
    return existing;
  }
  return prisma.transaction.create({
    data: {
      businessId,
      customerId,
      createdByUserId,
      type,
      amount,
      description,
      status: 'ACTIVE',
      idempotencyKey: key,
    },
  });
}

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const business of businesses) {
    const user = await ensureUser(business.owner, passwordHash);
    await ensureBusiness(business.id, business.name);
    await ensureMembership(user.id, business.id, 'OWNER');

    for (const customer of business.customers) {
      const created = await ensureCustomer(customer, business.id, user.id);
      await ensureTransaction(
        business.id,
        created.id,
        user.id,
        'CREDIT',
        customer.credit,
        'Udhaar',
        `seed:${business.id}:${customer.id}:credit`
      );
      await ensureTransaction(
        business.id,
        created.id,
        user.id,
        'PAYMENT',
        customer.payment,
        'Payment received',
        `seed:${business.id}:${customer.id}:payment`
      );
    }
  }

  console.log('Demo multi-business data seeded successfully.');
  console.log(`Demo login password: ${DEMO_PASSWORD} (development only; set SEED_PASSWORD to override).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
