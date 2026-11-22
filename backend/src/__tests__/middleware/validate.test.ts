import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

function mockRequest(source: 'body' | 'params' | 'query', data: unknown) {
  return {
    [source]: data,
  } as any;
}

function mockResponse() {
  let statusCode = 0;
  let body: unknown = null;
  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (payload: unknown) => {
      body = payload;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
  return res;
}

describe('validation middleware', () => {
  const schema = z.object({
    name: z.string().min(1, 'Name is required.'),
    amount: z.number().positive('Amount must be positive.'),
  });

  it('passes valid request body', () => {
    const req = mockRequest('body', { name: 'Raju', amount: 450 });
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    validate(schema, 'body')(req, res, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 0);
    assert.deepStrictEqual(req.body, { name: 'Raju', amount: 450 });
  });

  it('returns 400 for invalid request body', () => {
    const req = mockRequest('body', {});
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    validate(schema, 'body')(req, res, next);

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    const body = res.body as {
      ok: boolean;
      message: string;
      errors: Array<{ path: string; message: string }>;
    };
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.message, 'Validation failed');
    assert.ok(Array.isArray(body.errors));
    assert.ok(body.errors.length > 0);
  });

  it('returns field-level errors for missing required fields', () => {
    const req = mockRequest('body', { amount: 100 });
    const res = mockResponse();
    const next = () => {};

    validate(schema, 'body')(req, res, next);

    const body = res.body as { errors: Array<{ path: string }> };
    const nameError = body.errors.find((e) => e.path === 'name');
    assert.ok(nameError, 'Expected a validation error for name field');
  });

  it('accepts numeric string amounts when schema coerces', () => {
    const coercibleSchema = z.object({
      amount: z.preprocess(
        (val) => (typeof val === 'string' ? Number(val) : val),
        z.number().positive(),
      ),
    });

    const req = mockRequest('body', { amount: '450' });
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    validate(coercibleSchema, 'body')(req, res, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 0);
  });

  it('rejects zero amount', () => {
    const req = mockRequest('body', { name: 'Raju', amount: 0 });
    const res = mockResponse();
    const next = () => {};

    validate(schema, 'body')(req, res, next);

    const body = res.body as { errors: Array<{ message: string }> };
    assert.ok(
      body.errors.some((e) => e.message.includes('positive')),
      'Expected positive amount error for zero',
    );
  });

  it('rejects negative amount', () => {
    const req = mockRequest('body', { name: 'Raju', amount: -50 });
    const res = mockResponse();
    const next = () => {};

    validate(schema, 'body')(req, res, next);

    const body = res.body as { errors: Array<{ message: string }> };
    assert.ok(
      body.errors.some((e) => e.message.includes('positive')),
      'Expected positive amount error for negative',
    );
  });

  it('validates params source', () => {
    const paramSchema = z.object({
      id: z.string().min(1, 'ID is required.'),
    });
    const req = mockRequest('params', { id: '' });
    const res = mockResponse();
    const next = () => {};

    validate(paramSchema, 'params')(req, res, next);

    assert.strictEqual(res.statusCode, 400);
    const body = res.body as { ok: boolean };
    assert.strictEqual(body.ok, false);
  });

  it('validates query source', () => {
    const querySchema = z.object({
      page: z.string().optional(),
    });
    const req = mockRequest('query', { page: '1' });
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    validate(querySchema, 'query')(req, res, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 0);
  });
});
