import type { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';

export type BusinessNameResolver = (businessId: string) => Promise<string | null | undefined>;

export function createPrismaBusinessNameResolver(
  client: PrismaClient = prisma
): BusinessNameResolver {
  return async (businessId) => {
    const business = await client.business.findFirst({
      where: { id: businessId, deletedAt: null },
      select: { name: true },
    });
    return business?.name ?? null;
  };
}
