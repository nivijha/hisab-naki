import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { PrismaClient } from '@prisma/client';
import { createAuthService, type AuthUserLookup, type EmailOrPhoneRecord } from '../../../services/auth/authService.js';
import { HttpError } from '../../../middleware/authenticate.js';
import { verifyAccessToken } from '../../../services/auth/tokenService.js';
import type { RegisterInput } from '../../../services/auth/authService.js';

const SECRET = 'test-secret-at-least-32-characters-long';
const NOW_MS = 1_000_000_000_000;

const NEW_USER = {
  id: 'user-reg-1',
  name: 'Test User',
  email: 'test@example.com',
  phone: null,
  phoneVerifiedAt: null,
};

const NEW_BUSINESS = {
  id: 'biz-reg-1',
  name: 'Raju General Store',
  currency: 'INR',
};

const NEW_MEMBERSHIP = {
  id: 'membership-reg-1',
  userId: NEW_USER.id,
  businessId: NEW_BUSINESS.id,
  role: 'OWNER',
  status: 'ACTIVE',
};

type TransactionClient = {
  user: { create: (args: { data: Record<string, unknown> }) => Promise<typeof NEW_USER> };
  business: { create: () => Promise<typeof NEW_BUSINESS> };
  membership: { create: () => Promise<typeof NEW_MEMBERSHIP> };
};

function makeClient() {
  const tx: TransactionClient = {
    user: {
      create: async (args) => {
        assert.ok(args.data.passwordHash, 'password hash must be set at create time');
        assert.ok(!('password' in args.data), 'plaintext password must never be stored');
        return NEW_USER;
      },
    },
    business: { create: async () => NEW_BUSINESS },
    membership: { create: async () => NEW_MEMBERSHIP },
  };
  const client = {
    $transaction: async (callback: (tx: TransactionClient) => Promise<unknown>) => callback(tx),
  } as unknown as PrismaClient;
  return { client, tx };
}

function makeLookup(duplicate: EmailOrPhoneRecord | null): AuthUserLookup {
  return {
    findByIdentifier: async () => null,
    findByEmailOrPhone: async () => duplicate,
  };
}

function makeService(options: { duplicate?: EmailOrPhoneRecord | null } = {}) {
  const { client } = makeClient();
  const hashCalls: string[] = [];
  const service = createAuthService({
    client,
    userLookup: makeLookup(options.duplicate ?? null),
    hash: async (password: string) => {
      hashCalls.push(password);
      return 'scrypt$16384$8$1$salt$hash';
    },
    secret: SECRET,
    expiresInSeconds: 3600,
    now: () => NOW_MS,
  });
  return { service, hashCalls };
}

function makeInput(): RegisterInput {
  return {
    name: 'Test User',
    email: 'test@example.com',
    password: 'StrongPassword123',
    businessName: 'Raju General Store',
  };
}

async function expectHttpError(promise: Promise<unknown>, statusCode: number, pattern: RegExp) {
  try {
    await promise;
    assert.fail('Expected the promise to reject');
  } catch (error) {
    assert.ok(error instanceof HttpError, 'expected HttpError');
    assert.strictEqual(error.statusCode, statusCode);
    assert.match(error.message, pattern);
  }
}

describe('authService - register', () => {
  it('registers a user with an OWNER membership and issues a valid token', async () => {
    const { service, hashCalls } = makeService();
    const result = await service.register(makeInput());

    assert.strictEqual(hashCalls.length, 1);
    assert.strictEqual(hashCalls[0], 'StrongPassword123');

    assert.strictEqual(result.user.id, NEW_USER.id);
    assert.strictEqual(result.user.name, 'Test User');
    assert.strictEqual(result.user.email, 'test@example.com');
    assert.strictEqual(result.user.phone, null);
    assert.strictEqual(result.user.phoneVerifiedAt, null, 'phone must stay unverified');
    assert.strictEqual(result.business.id, NEW_BUSINESS.id);
    assert.strictEqual(result.business.name, 'Raju General Store');
    assert.strictEqual(result.business.currency, 'INR');
    assert.strictEqual(result.membership.role, 'OWNER');
    assert.strictEqual(result.membership.status, 'ACTIVE');
    assert.strictEqual(result.tokenType, 'Bearer');
    assert.strictEqual(result.expiresIn, 3600);
    assert.ok(result.expiresAt instanceof Date);
    assert.ok(result.token.split('.').length === 3);
    assert.ok(!('passwordHash' in result), 'password hash must not be exposed');

    const verified = verifyAccessToken(result.token, SECRET, () => NOW_MS);
    assert.strictEqual(verified.sub, NEW_USER.id);
  });

  it('lowercases the email before duplicate checks', async () => {
    const lookups: Array<{ email: string; phone: string | null }> = [];
    const { client } = makeClient();
    const service = createAuthService({
      client,
      userLookup: {
        findByIdentifier: async () => null,
        findByEmailOrPhone: async (email, phone) => {
          lookups.push({ email, phone });
          return null;
        },
      },
      hash: async () => 'hash',
      secret: SECRET,
      expiresInSeconds: 3600,
      now: () => NOW_MS,
    });

    await service.register({ ...makeInput(), email: 'TeSt@ExAmPlE.CoM' });
    assert.deepStrictEqual(lookups, [{ email: 'test@example.com', phone: null }]);
  });

  it('rejects an already registered email', async () => {
    const { service } = makeService({
      duplicate: { id: 'other-user', email: 'test@example.com', phone: null },
    });
    await expectHttpError(service.register(makeInput()), 400, /Email address is already registered/);
  });

  it('rejects an already registered phone number', async () => {
    const { service } = makeService({
      duplicate: { id: 'other-user', email: null, phone: '9999999999' },
    });
    await expectHttpError(
      service.register({ ...makeInput(), phone: '9999999999' }),
      400,
      /Phone number is already registered/
    );
  });

  it('rejects missing name, email or business name', async () => {
    const { service } = makeService();
    await expectHttpError(service.register({ ...makeInput(), name: '   ' }), 400, /Name, email and business name are required/);
    await expectHttpError(service.register({ ...makeInput(), email: '' }), 400, /Name, email and business name are required/);
    await expectHttpError(service.register({ ...makeInput(), businessName: '  ' }), 400, /Name, email and business name are required/);
  });

  it('rejects a short password without storing anything', async () => {
    const { service } = makeService();
    await expectHttpError(service.register({ ...makeInput(), password: 'short' }), 400, /Password must be at least 8 characters/);
  });
});
