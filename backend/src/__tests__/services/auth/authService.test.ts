import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAuthService, type AuthUserLookup, type AuthUserRecord } from '../../../services/auth/authService.js';
import type { MembershipLister, MembershipSummary } from '../../../services/auth/membershipService.js';
import { HttpError } from '../../../middleware/authenticate.js';
import { verifyAccessToken } from '../../../services/auth/tokenService.js';
import { hashPassword } from '../../../services/auth/passwordService.js';

const SECRET = 'test-secret-at-least-32-characters-long';
const NOW_MS = 1_000_000_000_000;
const PASSWORD = 'correct-password';
const PASSWORD_HASH = await hashPassword(PASSWORD);

function makeUserLookup(user: AuthUserRecord | null, calls: string[] = []): AuthUserLookup {
  return {
    findByIdentifier: async (identifier) => {
      calls.push(identifier);
      return user;
    },
  };
}

function makeMembershipLister(
  memberships: MembershipSummary[],
  calls: string[] = []
): MembershipLister {
  return {
    listActiveForUser: async (userId) => {
      calls.push(userId);
      return memberships;
    },
  };
}

function service(options: {
  user?: AuthUserRecord | null;
  memberships?: MembershipSummary[];
  expiresInSeconds?: number;
  userCalls?: string[];
  membershipCalls?: string[];
} = {}) {
  return createAuthService({
    userLookup: makeUserLookup(options.user === undefined ? { id: 'user-1', passwordHash: PASSWORD_HASH } : options.user, options.userCalls),
    membershipLister: makeMembershipLister(options.memberships ?? [], options.membershipCalls),
    secret: SECRET,
    expiresInSeconds: options.expiresInSeconds ?? 3600,
    now: () => NOW_MS,
  });
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

describe('authService - login', () => {
  it('logs in successfully with a valid identifier and password', async () => {
    const calls: string[] = [];
    const result = await service({ userCalls: calls }).login('user@example.com', PASSWORD);

    assert.strictEqual(result.tokenType, 'Bearer');
    assert.strictEqual(result.expiresIn, 3600);
    assert.ok(result.token.split('.').length === 3);
    assert.deepStrictEqual(calls, ['user@example.com']);

    const verified = verifyAccessToken(result.token, SECRET, () => NOW_MS);
    assert.strictEqual(verified.sub, 'user-1');
  });

  it('issues a token with sub and exp claims expiring at the configured time', async () => {
    const result = await service({ expiresInSeconds: 60 }).login('user-1', PASSWORD);
    const verified = verifyAccessToken(result.token, SECRET, () => NOW_MS);

    assert.strictEqual(verified.sub, 'user-1');
    assert.strictEqual(verified.exp, Math.floor(NOW_MS / 1000) + 60);
    assert.strictEqual(result.expiresAt.getTime(), verified.exp * 1000);

    assert.throws(
      () => verifyAccessToken(result.token, SECRET, () => NOW_MS + 60_000),
      /Token has expired/
    );
  });

  it('rejects an incorrect password without revealing which field was wrong', async () => {
    await expectHttpError(
      service().login('user-1', 'wrong-password'),
      401,
      /Invalid credentials/
    );
  });

  it('rejects an unknown account with the same generic error', async () => {
    await expectHttpError(
      service({ user: null }).login('nobody', PASSWORD),
      401,
      /Invalid credentials/
    );
  });

  it('rejects missing credentials with 400', async () => {
    await expectHttpError(service().login('', PASSWORD), 400, /Identifier and password are required/);
    await expectHttpError(service().login('user-1', ''), 400, /Identifier and password are required/);
  });

  it('rejects a user without a configured password', async () => {
    await expectHttpError(
      service({ user: { id: 'user-1', passwordHash: null } }).login('user-1', PASSWORD),
      401,
      /Invalid credentials/
    );
  });

  it('rejects login when JWT_SECRET is not configured', async () => {
    const previous = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const unconfigured = createAuthService({
        userLookup: makeUserLookup({ id: 'user-1', passwordHash: PASSWORD_HASH }),
        membershipLister: makeMembershipLister([]),
        now: () => NOW_MS,
      });
      await expectHttpError(unconfigured.login('user-1', PASSWORD), 500, /JWT secret is not configured/);
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  });
});

describe('authService - memberships', () => {
  const memberships: MembershipSummary[] = [
    { membershipId: 'm-1', businessId: 'biz-1', businessName: 'Shop One', role: 'OWNER', status: 'ACTIVE' },
    { membershipId: 'm-2', businessId: 'biz-2', businessName: 'Shop Two', role: 'STAFF', status: 'ACTIVE' },
  ];

  it('returns only ACTIVE memberships for the authenticated user', async () => {
    const calls: string[] = [];
    const result = await service({ memberships, membershipCalls: calls }).listMemberships('user-1');
    assert.deepStrictEqual(result, memberships);
    assert.deepStrictEqual(calls, ['user-1']);
  });

  it('excludes suspended and removed memberships from selection', async () => {
    const activeOnly = memberships.filter((m) => m.status === 'ACTIVE');
    const result = await service({ memberships: activeOnly }).listMemberships('user-1');
    assert.strictEqual(result.length, 2);
    assert.ok(result.every((m) => m.status === 'ACTIVE'));
  });

  it('does not return memberships belonging to another user', async () => {
    const calls: string[] = [];
    const result = await service({ memberships: [], membershipCalls: calls }).listMemberships('user-2');
    assert.deepStrictEqual(result, []);
    assert.deepStrictEqual(calls, ['user-2'], 'lookup must use the authenticated identity only');
  });

  it('rejects a request without an authenticated user', async () => {
    await expectHttpError(service().listMemberships(''), 400, /Authenticated user is required/);
  });
});
