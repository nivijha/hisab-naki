import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../../../middleware/authenticate.js';
import { PrismaBusinessOnboardingRepository } from '../../../services/business/businessOnboardingService.js';

function makeClient(options: { replay?: boolean; verified?: boolean } = {}) {
  const operations: string[] = [];
  const previous = options.replay ? [{
    requestHash: 'request-hash', businessId: 'business-existing', businessName: 'Nivi Shop', currency: 'INR',
    membershipId: 'membership-existing', role: 'OWNER', membershipStatus: 'ACTIVE',
  }] : [];
  const tx = {
    $queryRaw: async () => previous,
    $executeRaw: async () => { operations.push('idempotency-record'); return 1; },
    user: { findUnique: async () => ({ id: 'user-1', phoneVerifiedAt: options.verified === false ? null : new Date() }) },
    membership: { count: async () => 0, create: async () => { operations.push('membership'); return { id: 'membership-1', businessId: 'business-1', role: 'OWNER', status: 'ACTIVE' }; } },
    business: { create: async ({ data }: { data: { name: string } }) => { operations.push('business'); return { id: 'business-1', name: data.name, currency: 'INR' }; } },
  };
  const client = {
    ...tx,
    $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
  } as unknown as PrismaClient;
  return { client, operations };
}

describe('PrismaBusinessOnboardingRepository', () => {
  it('creates the business and OWNER membership inside one database transaction', async () => {
    const { client, operations } = makeClient();
    const repository = new PrismaBusinessOnboardingRepository(client);
    const result = await repository.createFirstBusiness('user-1', 'Nivi Shop', 'onboard-key-123', 'request-hash');
    assert.deepEqual(operations, ['business', 'membership', 'idempotency-record']);
    assert.deepEqual(result, {
      business: { id: 'business-1', name: 'Nivi Shop', currency: 'INR' },
      membership: { membershipId: 'membership-1', businessId: 'business-1', role: 'OWNER', status: 'ACTIVE' },
      replayed: false,
    });
  });

  it('replays the original server-generated business and membership for the same request key', async () => {
    const { client, operations } = makeClient({ replay: true });
    const result = await new PrismaBusinessOnboardingRepository(client).createFirstBusiness('user-1', 'Nivi Shop', 'onboard-key-123', 'request-hash');
    assert.deepEqual(operations, []);
    assert.equal(result.business.id, 'business-existing');
    assert.equal(result.membership.membershipId, 'membership-existing');
    assert.equal(result.replayed, true);
  });

  it('does not create a business when phone verification is missing', async () => {
    const { client, operations } = makeClient({ verified: false });
    await assert.rejects(
      new PrismaBusinessOnboardingRepository(client).createFirstBusiness('user-1', 'Nivi Shop', 'onboard-key-123', 'request-hash'),
      error => error instanceof HttpError && error.statusCode === 403,
    );
    assert.deepEqual(operations, []);
  });
});
