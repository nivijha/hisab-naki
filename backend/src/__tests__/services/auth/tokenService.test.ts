import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import {
  getJwtSecret,
  getTokenTtlSeconds,
  signAccessToken,
  TokenError,
  verifyAccessToken,
  type VerifiedToken,
} from '../../../services/auth/tokenService.js';

const SECRET = 'test-secret-at-least-32-characters-long';
const NOW_MS = 1_000_000_000_000;
const NOW_SEC = NOW_MS / 1000;

function signToken(
  payload: Record<string, unknown>,
  secret: string = SECRET,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }
): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verify(token: string): VerifiedToken {
  return verifyAccessToken(token, SECRET, () => NOW_MS);
}

describe('tokenService', () => {
  it('verifies a valid token and returns its claims', () => {
    const token = signToken({ sub: 'user-1', iat: NOW_SEC - 60, exp: NOW_SEC + 3600 });
    const result = verify(token);
    assert.strictEqual(result.sub, 'user-1');
    assert.strictEqual(result.iat, NOW_SEC - 60);
    assert.strictEqual(result.exp, NOW_SEC + 3600);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signToken({ sub: 'user-1', exp: NOW_SEC + 100 }, 'different-secret');
    assert.throws(() => verify(token), /Invalid token signature/);
  });

  it('rejects an expired token', () => {
    const token = signToken({ sub: 'user-1', exp: NOW_SEC - 1 });
    assert.throws(() => verify(token), /Token has expired/);
  });

  it('rejects a token expiring exactly at now', () => {
    const token = signToken({ sub: 'user-1', exp: NOW_SEC });
    assert.throws(() => verify(token), /Token has expired/);
  });

  it('rejects a missing subject', () => {
    const token = signToken({ exp: NOW_SEC + 100 });
    assert.throws(() => verify(token), /Token subject is invalid/);
  });

  it('rejects an empty subject', () => {
    const token = signToken({ sub: '   ', exp: NOW_SEC + 100 });
    assert.throws(() => verify(token), /Token subject is invalid/);
  });

  it('rejects a missing or non-numeric expiration', () => {
    assert.throws(
      () => verify(signToken({ sub: 'user-1' })),
      /Token expiration is invalid/
    );
    assert.throws(
      () => verify(signToken({ sub: 'user-1', exp: 'tomorrow' })),
      /Token expiration is invalid/
    );
  });

  it('rejects an invalid issued-at claim', () => {
    const token = signToken({ sub: 'user-1', exp: NOW_SEC + 100, iat: 'yesterday' });
    assert.throws(() => verify(token), /Token issued-at claim is invalid/);
  });

  it('rejects malformed tokens', () => {
    assert.throws(() => verify(''), /Token is required/);
    assert.throws(() => verify('abc.def'), /Malformed token/);
    assert.throws(() => verify('a.b.c'), /Malformed token/);
    assert.throws(() => verify('%%%.e30.e30'), /Malformed token/);
  });

  it('rejects an unsupported algorithm', () => {
    const token = signToken(
      { sub: 'user-1', exp: NOW_SEC + 100 },
      SECRET,
      { alg: 'none', typ: 'JWT' }
    );
    assert.throws(() => verify(token), /Unsupported token header/);
  });

  it('rejects tampered payloads', () => {
    const token = signToken({ sub: 'user-1', exp: NOW_SEC + 100 });
    const segments = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'user-2', exp: NOW_SEC + 100 })).toString('base64url');
    const tampered = `${segments[0]}.${tamperedPayload}.${segments[2]}`;
    assert.throws(() => verify(tampered), /Invalid token signature/);
  });

  it('issues a token that round-trips through verification', () => {
    const result = signAccessToken('user-1', SECRET, 3600, () => NOW_MS);
    const verified = verifyAccessToken(result.token, SECRET, () => NOW_MS);
    assert.strictEqual(verified.sub, 'user-1');
    assert.strictEqual(verified.exp, Math.floor(NOW_MS / 1000) + 3600);
    assert.strictEqual(result.expiresAt.getTime(), verified.exp * 1000);
  });

  it('rejects invalid issuance input', () => {
    assert.throws(() => signAccessToken('', SECRET, 3600, () => NOW_MS), /Token subject is required/);
    assert.throws(() => signAccessToken('user-1', SECRET, 0, () => NOW_MS), /positive integer/);
  });

  it('fails when JWT_SECRET is not configured', () => {
    const previous = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      assert.throws(() => getJwtSecret(), /JWT secret is not configured/);
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  });

  it('rejects a short JWT secret', () => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'too-short';
    try {
      assert.throws(() => getJwtSecret(), /at least 32 characters/);
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  });

  it('caps configured token lifetime at 24 hours', () => {
    const previous = process.env.JWT_EXPIRES_IN_SECONDS;
    process.env.JWT_EXPIRES_IN_SECONDS = '99999999';
    try {
      assert.strictEqual(getTokenTtlSeconds(), 86400);
    } finally {
      if (previous === undefined) delete process.env.JWT_EXPIRES_IN_SECONDS;
      else process.env.JWT_EXPIRES_IN_SECONDS = previous;
    }
  });

  it('fails when JWT_SECRET is blank', () => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = '   ';
    try {
      assert.throws(() => getJwtSecret(), /JWT secret is not configured/);
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
  });
});
