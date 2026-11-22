import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { createAuthenticate, HttpError } from '../../middleware/authenticate.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import type { ActiveMembership, MembershipLookup } from '../../services/auth/membershipService.js';
import { TokenError, type VerifiedToken } from '../../services/auth/tokenService.js';

const USER_ID = 'user-1';
const BUSINESS_ID = 'biz-1';

const activeMembership: ActiveMembership = {
  id: 'membership-1',
  userId: USER_ID,
  businessId: BUSINESS_ID,
  role: 'OWNER' as Role,
  status: 'ACTIVE',
};

function makeReq(headers: Record<string, string>, extras: Record<string, unknown> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    ...extras,
  } as Request;
}

function makeLookup(
  result: ActiveMembership | null,
  calls: Array<{ userId: string; businessId: string }> = []
): MembershipLookup {
  return {
    findActive: async (userId, businessId) => {
      calls.push({ userId, businessId });
      return result;
    },
  };
}

function runMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Request
): Promise<{ error?: unknown }> {
  return new Promise((resolve) => {
    const next = ((error?: unknown) => resolve({ error })) as NextFunction;
    void middleware(req, {} as Response, next);
  });
}

function bearerHeaders(token: string, businessId?: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...(businessId ? { 'x-business-id': businessId } : {}),
  };
}

function withValidToken(overrides: Partial<VerifiedToken> = {}): VerifiedToken {
  return { sub: USER_ID, exp: 9_999_999_999, ...overrides };
}

describe('authenticate middleware', () => {
  it('rejects a missing Authorization header with 401', async () => {
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(activeMembership),
    });
    const { error } = await runMiddleware(middleware, makeReq({ 'x-business-id': BUSINESS_ID }));
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 401);
  });

  it('rejects a malformed Authorization scheme with 401', async () => {
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(activeMembership),
    });
    const req = makeReq({ authorization: 'Basic abc', 'x-business-id': BUSINESS_ID });
    const { error } = await runMiddleware(middleware, req);
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 401);
  });

  it('rejects an invalid token with 401', async () => {
    const middleware = createAuthenticate({
      verifyToken: () => { throw new TokenError('Invalid token signature.'); },
      membershipLookup: makeLookup(activeMembership),
    });
    const { error } = await runMiddleware(
      middleware,
      makeReq(bearerHeaders('bad.token.value', BUSINESS_ID))
    );
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 401);
    assert.match(error.message, /Invalid token signature/);
  });

  it('rejects an expired token with 401', async () => {
    const middleware = createAuthenticate({
      verifyToken: () => { throw new TokenError('Token has expired.'); },
      membershipLookup: makeLookup(activeMembership),
    });
    const { error } = await runMiddleware(
      middleware,
      makeReq(bearerHeaders('expired.token', BUSINESS_ID))
    );
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 401);
    assert.match(error.message, /expired/);
  });

  it('accepts a valid token with an ACTIVE membership', async () => {
    const req = makeReq(bearerHeaders('valid-token', BUSINESS_ID));
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(activeMembership),
    });
    const { error } = await runMiddleware(middleware, req);
    assert.strictEqual(error, undefined);
    assert.deepStrictEqual(req.auth, {
      userId: USER_ID,
      businessId: BUSINESS_ID,
      membershipId: 'membership-1',
      role: 'OWNER',
    });
  });

  it('rejects a missing business context with 400 and never looks up membership', async () => {
    const calls: Array<{ userId: string; businessId: string }> = [];
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(activeMembership, calls),
    });
    const { error } = await runMiddleware(middleware, makeReq(bearerHeaders('valid-token')));
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 400);
    assert.strictEqual(calls.length, 0);
  });

  it('rejects a suspended membership with 403', async () => {
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(null),
    });
    const { error } = await runMiddleware(
      middleware,
      makeReq(bearerHeaders('valid-token', BUSINESS_ID))
    );
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 403);
  });

  it('rejects a removed membership with 403', async () => {
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(null),
    });
    const { error } = await runMiddleware(
      middleware,
      makeReq(bearerHeaders('valid-token', BUSINESS_ID))
    );
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 403);
  });

  it('rejects a user accessing another user\'s business', async () => {
    const foreignMembership: ActiveMembership = {
      ...activeMembership,
      userId: 'user-2',
      businessId: 'biz-2',
      id: 'membership-2',
    };
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(foreignMembership),
    });
    const { error } = await runMiddleware(
      middleware,
      makeReq(bearerHeaders('valid-token', BUSINESS_ID))
    );
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 403);
  });

  it('requires explicit business selection when the user has multiple memberships', async () => {
    const calls: Array<{ userId: string; businessId: string }> = [];
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: makeLookup(activeMembership, calls),
    });
    const req = makeReq(bearerHeaders('valid-token'), {
      body: { businessId: 'biz-2' },
      query: { businessId: 'biz-2' },
    });
    const { error } = await runMiddleware(middleware, req);
    assert.ok(error instanceof HttpError);
    assert.strictEqual(error.statusCode, 400, 'no silent first-membership fallback');
    assert.strictEqual(calls.length, 0);
  });

  it('does not trust userId, businessId or role from body or query', async () => {
    const calls: Array<{ userId: string; businessId: string }> = [];
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken({ sub: USER_ID }),
      membershipLookup: makeLookup(activeMembership, calls),
    });
    const req = makeReq(bearerHeaders('valid-token', BUSINESS_ID), {
      body: { userId: 'attacker', businessId: 'biz-2', role: 'ADMIN' },
      query: { userId: 'attacker', businessId: 'biz-2', role: 'ADMIN' },
    });
    const { error } = await runMiddleware(middleware, req);
    assert.strictEqual(error, undefined);
    assert.deepStrictEqual(calls, [{ userId: USER_ID, businessId: BUSINESS_ID }]);
    assert.strictEqual((req.auth as AuthContext).userId, USER_ID);
    assert.strictEqual((req.auth as AuthContext).businessId, BUSINESS_ID);
    assert.strictEqual((req.auth as AuthContext).role, 'OWNER');
  });

  it('propagates unexpected membership lookup errors', async () => {
    const middleware = createAuthenticate({
      verifyToken: () => withValidToken(),
      membershipLookup: {
        findActive: async () => { throw new Error('DB down'); },
      },
    });
    const { error } = await runMiddleware(
      middleware,
      makeReq(bearerHeaders('valid-token', BUSINESS_ID))
    );
    assert.ok(error instanceof Error);
    assert.match(error.message, /DB down/);
  });
});
