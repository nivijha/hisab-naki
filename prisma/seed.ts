import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_USER_EMAIL = 'shopkeeper@hisabnaki.local';
const SEED_BUSINESS_ID = 'hisabnaki-demo-business';
const SEED_OWNER_MEMBERSHIP_ID = 'hisabnaki-demo-membership-owner';

const demoCustomers = [
  { id: 'hisabnaki-demo-cust-raju-sharma', name: 'Raju Sharma', phone: '9876543210', credit: 450, payment: 200 },
  { id: 'hisabnaki-demo-cust-amit-kumar', name: 'Amit Kumar', phone: '9876543211', credit: 700, payment: 300 },
  { id: 'hisabnaki-demo-cust-neha-verma', name: 'Neha Verma', phone: '9876543212', credit: 850, payment: 250 },
  { id: 'hisabnaki-demo-cust-suresh-gupta', name: 'Suresh Gupta', phone: '9876543213', credit: 600, payment: 150 },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: SEED_USER_EMAIL },
      update: {},
      create: {
        name: 'Demo Shopkeeper',
        email: SEED_USER_EMAIL,
      },
    });

    const business = await tx.business.findUnique({
      where: { id: SEED_BUSINESS_ID },
    });
    if (!business) {
      await tx.business.create({
        data: { id: SEED_BUSINESS_ID, name: 'Raju General Store' },
      });
    }

    const ownerMembership = await tx.membership.findUnique({
      where: { id: SEED_OWNER_MEMBERSHIP_ID },
    });
    if (!ownerMembership) {
      await tx.membership.create({
        data: {
          id: SEED_OWNER_MEMBERSHIP_ID,
          businessId: SEED_BUSINESS_ID,
          userId: user.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
    }

    for (const customer of demoCustomers) {
      if (!(await tx.customer.findUnique({ where: { id: customer.id } }))) {
        await tx.customer.create({
          data: {
            id: customer.id,
            businessId: SEED_BUSINESS_ID,
            name: customer.name,
            phone: customer.phone,
            createdByUserId: user.id,
          },
        });
      }

      const creditTxId = `${customer.id}-credit`;
      if (!(await tx.transaction.findUnique({ where: { id: creditTxId } }))) {
        await tx.transaction.create({
          data: {
            id: creditTxId,
            businessId: SEED_BUSINESS_ID,
            customerId: customer.id,
            type: 'CREDIT',
            status: 'ACTIVE',
            amount: customer.credit,
            description: 'Udhaar',
            createdByUserId: user.id,
          },
        });
      }

      const paymentTxId = `${customer.id}-payment`;
      if (!(await tx.transaction.findUnique({ where: { id: paymentTxId } }))) {
        await tx.transaction.create({
          data: {
            id: paymentTxId,
            businessId: SEED_BUSINESS_ID,
            customerId: customer.id,
            type: 'PAYMENT',
            status: 'ACTIVE',
            amount: customer.payment,
            paymentMethod: 'CASH',
            description: 'Payment received',
            createdByUserId: user.id,
          },
        });
      }
    }
  }, { timeout: 60000 });

  console.log('Demo data seeded successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
