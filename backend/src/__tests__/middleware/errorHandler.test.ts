import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../middleware/errorHandler.js';
import { HttpError } from '../../middleware/authenticate.js';

function runHandler(error: Error) {
  let statusCode = 0;
  let body: Record<string, unknown> = {};
  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (payload: Record<string, unknown>) => {
      body = payload;
      return res;
    },
  } as unknown as Response;
  errorHandler(
    error,
    {} as Request,
    res,
    (() => undefined) as NextFunction
  );
  return { statusCode, body };
}

describe('errorHandler', () => {
  it('preserves explicit HTTP error messages in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { statusCode, body } = runHandler(new HttpError(401, 'Invalid credentials.'));
      assert.strictEqual(statusCode, 401);
      assert.strictEqual(body.message, 'Invalid credentials.');
      assert.ok(!('stack' in body));
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('hides internal error messages in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { statusCode, body } = runHandler(new Error('passwordHash=secret leaked'));
      assert.strictEqual(statusCode, 500);
      assert.strictEqual(body.message, 'Internal server error');
      assert.ok(!('stack' in body));
      assert.ok(!JSON.stringify(body).includes('passwordHash'));
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('exposes messages and stacks outside production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const { body } = runHandler(new Error('debug detail'));
      assert.strictEqual(body.message, 'debug detail');
      assert.ok('stack' in body);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});
