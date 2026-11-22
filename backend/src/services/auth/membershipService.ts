import type { Membership, PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';

export type ActiveMembership = Pick<
  Membership,
  'id' | 'userId' | 'businessId' | 'role' | 'status'
>;

export type MembershipSummary = {
  membershipId: string;
  businessId: string;
  businessName: string;
  role: Membership['role'];
  status: Membership['status'];
};

export interface MembershipLookup {
  findActive(userId: string, businessId: string): Promise<ActiveMembership | null>;
}

export interface MembershipLister {
  listActiveForUser(userId: string): Promise<MembershipSummary[]>;
}

export class PrismaMembershipLister implements MembershipLister {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listActiveForUser(userId: string): Promise<MembershipSummary[]> {
    const memberships = await this.client.membership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        business: { is: { deletedAt: null } },
      },
      select: {
        id: true,
        businessId: true,
        role: true,
        status: true,
        business: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      membershipId: membership.id,
      businessId: membership.businessId,
      businessName: membership.business.name,
      role: membership.role,
      status: membership.status,
    }));
  }
}

export class PrismaMembershipLookup implements MembershipLookup {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findActive(userId: string, businessId: string): Promise<ActiveMembership | null> {
    return this.client.membership.findFirst({
      where: {
        userId,
        businessId,
        status: 'ACTIVE',
        business: { is: { deletedAt: null } },
      },
      select: {
        id: true,
        userId: true,
        businessId: true,
        role: true,
        status: true,
      },
    });
  }
}
