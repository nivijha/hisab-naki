import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { NextFunction, Request, Response } from 'express';
import { createLoginRateLimiter } from '../../middleware/rateLimit.js';

function runLimiter(limiter: ReturnType<typeof createLoginRateLimiter>, ip = '127.0.0.1') {
  const req = { ip } as Request;
  let blocked = false;
  const res = {
    status: (code: number) => {
      if (code === 429) blocked = true;
      return res;
    },
    json: () => res,
  } as unknown as Response;
  const next = (() => undefined) as NextFunction;
  limiter(req, res, next);
  return blocked;
}

describe('login rate limiter', () => {
  it('allows requests up to the configured maximum', () => {
    let time = 1000;
    const limiter = createLoginRateLimiter({ max: 3, windowMs: 1000, now: () => time });
    assert.strictEqual(runLimiter(limiter), false);
    assert.strictEqual(runLimiter(limiter), false);
    assert.strictEqual(runLimiter(limiter), false);
  });

  it('blocks requests exceeding the maximum with 429', () => {
    let time = 1000;
    const limiter = createLoginRateLimiter({ max: 2, windowMs: 1000, now: () => time });
    assert.strictEqual(runLimiter(limiter), false);
    assert.strictEqual(runLimiter(limiter), false);
    assert.strictEqual(runLimiter(limiter), true, 'third attempt blocked');
  });

  it('resets after the window expires', () => {
    let time = 1000;
    const limiter = createLoginRateLimiter({ max: 1, windowMs: 1000, now: () => time });
    assert.strictEqual(runLimiter(limiter), false);
    assert.strictEqual(runLimiter(limiter), true);
    time = 2001;
    assert.strictEqual(runLimiter(limiter), false, 'allowed after window');
  });

  it('tracks IPs independently', () => {
    let time = 1000;
    const limiter = createLoginRateLimiter({ max: 1, windowMs: 1000, now: () => time });
    assert.strictEqual(runLimiter(limiter, '1.1.1.1'), false);
    assert.strictEqual(runLimiter(limiter, '1.1.1.1'), true);
    assert.strictEqual(runLimiter(limiter, '2.2.2.2'), false);
  });
});
