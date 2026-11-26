import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { HttpError } from '../../middleware/authenticate.js';
import { isPrototypeSignupEnabled } from '../auth/prototypeSignupService.js';

export type CreatedBusiness = {
  business: { id: string; name: string; currency: string };
  membership: { membershipId: string; businessId: string; role: 'OWNER'; status: 'ACTIVE' };
  replayed: boolean;
};

export interface BusinessOnboardingRepository {
  createFirstBusiness(userId: string, name: string, idempotencyKey: string, requestHash: string): Promise<CreatedBusiness>;
}

export function createBusinessOnboardingService(repository: BusinessOnboardingRepository) {
  return {
    createFirstBusiness(userId: string, name: string, idempotencyKey: string) {
      if (!userId.trim()) throw new HttpError(401, 'Authenticated user is required.');
      if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        throw new HttpError(400, 'A valid Idempotency-Key header is required.');
      }
      const normalizedName = name.trim();
      if (normalizedName.length < 2 || normalizedName.length > 120) throw new HttpError(400, 'Enter a valid shop name.');
      const requestHash = createHash('sha256').update(normalizedName).digest('hex');
      return repository.createFirstBusiness(userId, normalizedName, idempotencyKey, requestHash);
    },
  };
}

export class PrismaBusinessOnboardingRepository implements BusinessOnboardingRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async createFirstBusiness(userId: string, name: string, idempotencyKey: string, requestHash: string): Promise<CreatedBusiness> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.client.$transaction(async tx => {
          const previous = await this.findIdempotentResult(tx, userId, idempotencyKey);
          if (previous) {
            if (previous.requestHash !== requestHash) throw new HttpError(409, 'This Idempotency-Key was already used for a different shop name.');
            return { ...previous.result, replayed: true };
          }

          const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, phoneVerifiedAt: true } });
          if (!user) throw new HttpError(401, 'Authenticated user was not found.');
          // Prototype signup leaves the phone unverified; allow onboarding for
          // those users while PROTOTYPE_SIGNUP_ENABLED is on.
          if (!user.phoneVerifiedAt && !isPrototypeSignupEnabled()) {
            throw new HttpError(403, 'Verify your phone before creating a shop.');
          }
          const activeMemberships = await tx.membership.count({ where: { userId, status: 'ACTIVE', business: { is: { deletedAt: null } } } });
          if (activeMemberships > 0) throw new HttpError(409, 'This account already has an active business. Select it or contact support.');

          const business = await tx.business.create({ data: { name }, select: { id: true, name: true, currency: true } });
          const membership = await tx.membership.create({
            data: { userId, businessId: business.id, role: 'OWNER', status: 'ACTIVE' },
            select: { id: true, businessId: true, role: true, status: true },
          });
          await tx.$executeRaw`INSERT INTO "BusinessCreationRequest" ("id", "userId", "idempotencyKey", "requestHash", "businessId") VALUES (${randomUUID()}, ${userId}, ${idempotencyKey}, ${requestHash}, ${business.id})`;
          return {
            business,
            membership: { membershipId: membership.id, businessId: membership.businessId, role: 'OWNER', status: 'ACTIVE' },
            replayed: false,
          };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        if (error instanceof HttpError) throw error;
        const code = prismaErrorCode(error);
        if (code === 'P2002' || code === 'P2034') {
          const existing = await this.findIdempotentResult(this.client, userId, idempotencyKey);
          if (existing) {
            if (existing.requestHash !== requestHash) throw new HttpError(409, 'This Idempotency-Key was already used for a different shop name.');
            return { ...existing.result, replayed: true };
          }
        }
        if (code === 'P2034' && attempt === 0) continue;
        if (code === 'P2002' || code === 'P2034') throw new HttpError(409, 'A shop setup request already completed. Refresh your business list before trying again.');
        throw error;
      }
    }
    throw new HttpError(409, 'A shop setup request is already being processed. Check your businesses before retrying.');
  }

  private async findIdempotentResult(client: PrismaClient | Prisma.TransactionClient, userId: string, idempotencyKey: string) {
    const rows = await client.$queryRaw<Array<{
      requestHash: string; businessId: string; businessName: string; currency: string;
      membershipId: string | null; role: string | null; membershipStatus: string | null;
    }>>`SELECT r."requestHash", b."id" AS "businessId", b."name" AS "businessName", b."currency", m."id" AS "membershipId", m."role"::text AS "role", m."status"::text AS "membershipStatus" FROM "BusinessCreationRequest" r JOIN "Business" b ON b."id" = r."businessId" LEFT JOIN "Membership" m ON m."businessId" = r."businessId" AND m."userId" = r."userId" WHERE r."userId" = ${userId} AND r."idempotencyKey" = ${idempotencyKey} LIMIT 1`;
    const previous = rows[0];
    if (!previous) return null;
    if (!previous.membershipId || previous.role !== 'OWNER' || previous.membershipStatus !== 'ACTIVE') throw new HttpError(409, 'The original shop setup is incomplete. Contact support before retrying.');
    return {
      requestHash: previous.requestHash,
      result: {
        business: { id: previous.businessId, name: previous.businessName, currency: previous.currency },
        membership: { membershipId: previous.membershipId, businessId: previous.businessId, role: 'OWNER' as const, status: 'ACTIVE' as const },
      },
    };
  }
}

function prismaErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

