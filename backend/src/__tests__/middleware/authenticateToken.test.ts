import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { createAuthenticateToken } from '../../middleware/authenticateToken.js';
import { HttpError } from '../../middleware/authenticate.js';
import { TokenError } from '../../services/auth/tokenService.js';

function makeReq(headers: Record<string, string>): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as Request;
}

function runMiddleware(middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>, req: Request) {
  return new Promise<{ error?: unknown }>((resolve) => {
    const next = ((error?: unknown) => resolve({ error })) as NextFunction;
    void middleware(req, {} as Response, next);
  });
}

describe('authenticateToken middleware', () => {
  it('accepts a valid Bearer token', async () => {
    const req = makeReq({ authorization: 'Bearer token-1' });
    const middleware = createAuthenticateToken({ verifyToken: () => ({ sub: 'user-1', exp: 9999999999 }) });
    const { error } = await runMiddleware(middleware, req);
    assert.equal(error, undefined);
    assert.deepEqual(req.authUser, { userId: 'user-1' });
  });

  it('accepts a valid session cookie when Authorization is absent', async () => {
    const req = makeReq({ cookie: 'hisabnaki_session=cookie-token' });
    const middleware = createAuthenticateToken({ verifyToken: (token) => ({ sub: token === 'cookie-token' ? 'user-2' : 'wrong', exp: 9999999999 }) });
    const { error } = await runMiddleware(middleware, req);
    assert.equal(error, undefined);
    assert.deepEqual(req.authUser, { userId: 'user-2' });
  });

  it('prefers Bearer token for backward compatibility', async () => {
    const req = makeReq({ authorization: 'Bearer bearer-token', cookie: 'hisabnaki_session=cookie-token' });
    const seen: string[] = [];
    const middleware = createAuthenticateToken({ verifyToken: (token) => { seen.push(token); return { sub: 'user-3', exp: 9999999999 }; } });
    const { error } = await runMiddleware(middleware, req);
    assert.equal(error, undefined);
    assert.deepEqual(seen, ['bearer-token']);
  });

  it('rejects missing auth', async () => {
    const middleware = createAuthenticateToken({ verifyToken: () => ({ sub: 'user-1', exp: 9999999999 }) });
    const { error } = await runMiddleware(middleware, makeReq({}));
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 401);
  });

  it('maps token errors to 401', async () => {
    const middleware = createAuthenticateToken({ verifyToken: () => { throw new TokenError('Token has expired.'); } });
    const { error } = await runMiddleware(middleware, makeReq({ authorization: 'Bearer bad' }));
    assert.ok(error instanceof HttpError);
    assert.equal(error.statusCode, 401);
  });
});
