import { describe, it } from 'node:test';
import assert from 'node:assert';
import { success, failure } from '../../utils/response.js';

describe('response utilities', () => {
  it('success() returns expected structure with default status 200', () => {
    let statusCode = 0;
    let body = null;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (payload: unknown) => {
        body = payload;
        return res;
      },
    };

    const result = success(res, { id: 'abc' });

    assert.strictEqual(result, res);
    assert.strictEqual(statusCode, 200);
    assert.deepStrictEqual(body, {
      ok: true,
      data: { id: 'abc' },
    });
  });

  it('success() includes optional message', () => {
    let body = null;
    const res: any = {
      status: (code: number) => ({ json: (payload: unknown) => { body = payload; } }),
      json: (payload: unknown) => { body = payload; },
    };

    success(res, { id: 'abc' }, 'Operation successful', 201);

    assert.deepStrictEqual(body, {
      ok: true,
      data: { id: 'abc' },
      message: 'Operation successful',
    });
  });

  it('success() omits message when not provided', () => {
    let body = null;
    const res: any = {
      status: (code: number) => ({ json: (payload: unknown) => { body = payload; } }),
      json: (payload: unknown) => { body = payload; },
    };

    success(res, null);

    assert.deepStrictEqual(body, {
      ok: true,
      data: null,
    });
  });

  it('failure() returns expected error structure with default status 500', () => {
    let statusCode = 0;
    let body = null;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (payload: unknown) => {
        body = payload;
        return res;
      },
    };

    const result = failure(res, 'Something went wrong');

    assert.strictEqual(result, res);
    assert.strictEqual(statusCode, 500);
    assert.deepStrictEqual(body, {
      ok: false,
      message: 'Something went wrong',
    });
  });

  it('failure() uses provided status code', () => {
    let statusCode = 0;
    let body = null;
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (payload: unknown) => {
        body = payload;
        return res;
      },
    };

    failure(res, 'Not found', 404);

    assert.strictEqual(statusCode, 404);
    assert.deepStrictEqual(body, {
      ok: false,
      message: 'Not found',
    });
  });
});
