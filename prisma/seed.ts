import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'shopkeeper@hisabnaki.local' },
    update: {},
    create: {
      name: 'Demo Shopkeeper',
      email: 'shopkeeper@hisabnaki.local',
      businessName: 'Raju General Store',
    },
  });

  const customers = [
    { name: 'Raju Sharma', phone: '9876543210' },
    { name: 'Amit Kumar', phone: '9876543211' },
    { name: 'Neha Verma', phone: '9876543212' },
    { name: 'Suresh Gupta', phone: '9876543213' },
  ];

  for (const item of customers) {
    const customer = await prisma.customer.upsert({
      where: {
        id: `${user.id}-${item.name}`,
      },
      update: {},
      create: {
        id: `${user.id}-${item.name}`,
        userId: user.id,
        name: item.name,
        phone: item.phone,
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          userId: user.id,
          customerId: customer.id,
          type: 'CREDIT',
          amount: item.name.includes('Raju') ? 450 : item.name.includes('Amit') ? 700 : item.name.includes('Neha') ? 850 : 600,
          description: 'Udhaar',
        },
        {
          userId: user.id,
          customerId: customer.id,
          type: 'PAYMENT',
          amount: item.name.includes('Raju') ? 200 : item.name.includes('Amit') ? 300 : item.name.includes('Neha') ? 250 : 150,
          description: 'Payment received',
        },
      ],
    });
  }

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
