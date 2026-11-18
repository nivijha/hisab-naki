import prisma from '../../lib/prisma.js';
import { calculateOutstandingAmount } from '../../utils/ledger.js';

export async function ensureDefaultUser() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    take: 1,
  });

  if (users.length > 0) {
    return users[0];
  }

  return prisma.user.create({
    data: {
      name: 'Demo Shopkeeper',
      email: 'shopkeeper@hisabnaki.local',
      businessName: 'Raju General Store',
    },
  });
}

export async function ensureCustomer(userId: string, customerName: string, phone?: string) {
  const normalizedName = customerName.trim();

  if (!normalizedName) {
    throw new Error('Customer name is required.');
  }

  const existing = await prisma.customer.findFirst({
    where: {
      userId,
      name: {
        equals: normalizedName,
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.customer.create({
    data: {
      userId,
      name: normalizedName,
      phone: phone ?? null,
    },
  });
}

export async function getCustomersForUser(userId: string) {
  const customers = await prisma.customer.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      transactions: true,
    },
  });

  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    createdAt: customer.createdAt,
    outstandingBalance: calculateOutstandingAmount(customer.transactions),
    transactionCount: customer.transactions.length,
  }));
}

export async function getCustomerById(userId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      userId,
    },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) {
    return null;
  }

  return {
    ...customer,
    outstandingBalance: calculateOutstandingAmount(customer.transactions),
  };
}

export async function getCustomerByName(userId: string, customerName: string) {
  const customer = await prisma.customer.findFirst({
    where: {
      userId,
      name: {
        equals: customerName,
        mode: 'insensitive',
      },
    },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) {
    return null;
  }

  return {
    ...customer,
    outstandingBalance: calculateOutstandingAmount(customer.transactions),
  };
}

export async function getCustomerTransactions(userId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: {
      id: customerId,
      userId,
    },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) {
    return null;
  }

  return {
    ...customer,
    outstandingBalance: calculateOutstandingAmount(customer.transactions),
  };
}
